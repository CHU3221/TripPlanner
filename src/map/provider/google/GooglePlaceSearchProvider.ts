import type { PlaceAutocompleteSession, PlaceAutocompleteSuggestion, PlaceCandidate, PlaceSearchProvider } from '../contract'
import { MapProviderError } from '../contract'
import { googleError, loadGoogleMaps } from './GoogleMapsSdk'
import { recordTelemetry } from '../../../telemetry'

const latLng = (point: any) => ({
  lat: typeof point?.lat === 'function' ? point.lat() : point?.lat,
  lng: typeof point?.lng === 'function' ? point.lng() : point?.lng,
})

class GoogleAutocompleteSession implements PlaceAutocompleteSession {
  private ended = false
  private readonly predictions = new Map<string, any>()

  constructor(
    private readonly AutocompleteSuggestion: any,
    private readonly token: any,
  ) {}

  async suggest(input: string): Promise<PlaceAutocompleteSuggestion[]> {
    const query = input.trim()
    if (this.ended) throw new MapProviderError('INVALID_REQUEST', '종료된 Google Autocomplete 세션입니다.')
    if (!query) return []
    try {
      recordTelemetry('GOOGLE_AUTOCOMPLETE_REQUEST','GOOGLE')
      const { suggestions } = await this.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: query, sessionToken: this.token })
      this.predictions.clear()
      return (suggestions ?? []).flatMap((entry: any): PlaceAutocompleteSuggestion[] => {
        const prediction = entry.placePrediction
        const id = prediction?.placeId ? String(prediction.placeId) : ''
        if (!id) return []
        this.predictions.set(id, prediction)
        const name = String(prediction.mainText ?? prediction.text ?? id)
        const secondaryText = prediction.secondaryText ? String(prediction.secondaryText) : undefined
        return [{ id, name, ...(secondaryText ? { secondaryText } : {}) }]
      })
    } catch (error) { throw googleError(error, 'Google 자동완성 검색에 실패했습니다.') }
  }

  async select(suggestion: PlaceAutocompleteSuggestion): Promise<PlaceCandidate> {
    if (this.ended) throw new MapProviderError('INVALID_REQUEST', '종료된 Google Autocomplete 세션입니다.')
    const prediction = this.predictions.get(suggestion.id)
    if (!prediction) throw new MapProviderError('INVALID_REQUEST', '현재 자동완성 세션에 없는 장소입니다.')
    this.ended = true
    recordTelemetry('GOOGLE_AUTOCOMPLETE_SESSION_SELECTED','GOOGLE')
    this.predictions.clear()
    try {
      const place = prediction.toPlace()
      // Keep selection on Place Details Essentials. The visible name is already supplied
      // by Autocomplete, so requesting displayName here would unnecessarily raise the SKU.
      recordTelemetry('GOOGLE_PLACE_DETAILS_ESSENTIALS','GOOGLE')
      await place.fetchFields({ fields: ['id', 'formattedAddress', 'location'] })
      const point = latLng(place.location)
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) throw new Error('Google Place Details returned no location')
      return {
        provider: 'GOOGLE',
        name: suggestion.name,
        address: place.formattedAddress || suggestion.secondaryText || undefined,
        position: { lat: point.lat, lng: point.lng },
        sourceRef: { provider: 'GOOGLE', id: String(place.id || suggestion.id) },
      }
    } catch (error) { throw googleError(error, 'Google 장소 세부정보를 불러오지 못했습니다.') }
  }

  cancel(): void {
    if(!this.ended)recordTelemetry('GOOGLE_AUTOCOMPLETE_SESSION_ABANDONED','GOOGLE')
    this.ended = true
    this.predictions.clear()
  }
}

export class GooglePlaceSearchProvider implements PlaceSearchProvider {
  constructor(private readonly apiKey: string) {}

  async createAutocompleteSession(): Promise<PlaceAutocompleteSession> {
    try {
      const maps = await loadGoogleMaps(this.apiKey)
      const { AutocompleteSessionToken, AutocompleteSuggestion } = await maps.importLibrary('places')
      if (!AutocompleteSessionToken || !AutocompleteSuggestion) throw new Error('Google Autocomplete Data API를 찾지 못했습니다.')
      recordTelemetry('GOOGLE_AUTOCOMPLETE_SESSION_START','GOOGLE')
      return new GoogleAutocompleteSession(AutocompleteSuggestion, new AutocompleteSessionToken())
    } catch (error) { throw googleError(error, 'Google 자동완성 세션을 시작하지 못했습니다.') }
  }

  async searchPlaces(query: string): Promise<PlaceCandidate[]> {
    if (!query.trim()) throw new MapProviderError('INVALID_REQUEST', '장소 검색어를 입력해주세요.')
    try {
      const maps = await loadGoogleMaps(this.apiKey)
      const { Place } = await maps.importLibrary('places')
      recordTelemetry('GOOGLE_TEXT_SEARCH_PRO','GOOGLE')
      const { places } = await Place.searchByText({
        textQuery: query.trim(),
        fields: ['id', 'displayName', 'formattedAddress', 'location'],
        maxResultCount: 8,
      })
      if (!Array.isArray(places)) throw new Error('Invalid Places response')
      return places.flatMap((place: any): PlaceCandidate[] => {
        const point = latLng(place.location)
        if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng) || !place.displayName) return []
        return [{ provider: 'GOOGLE', name: String(place.displayName), address: place.formattedAddress || undefined,
          position: { lat: point.lat, lng: point.lng }, ...(place.id ? { sourceRef: { provider: 'GOOGLE' as const, id: String(place.id) } } : {}) }]
      })
    } catch (error) { throw googleError(error, 'Google 장소 검색에 실패했습니다.') }
  }

  async searchAddress(address: string): Promise<PlaceCandidate[]> {
    if (!address.trim()) throw new MapProviderError('INVALID_REQUEST', '주소를 입력해주세요.')
    try {
      const maps = await loadGoogleMaps(this.apiKey)
      const { Geocoder } = await maps.importLibrary('geocoding')
      recordTelemetry('GOOGLE_GEOCODING','GOOGLE')
      const result = await new Geocoder().geocode({ address: address.trim() })
      return (result.results ?? []).flatMap((entry: any): PlaceCandidate[] => {
        const point = latLng(entry.geometry?.location)
        if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return []
        const name = String(entry.formatted_address || address.trim())
        return [{ provider: 'GOOGLE', name, address: name, position: { lat: point.lat, lng: point.lng },
          ...(entry.place_id ? { sourceRef: { provider: 'GOOGLE' as const, id: String(entry.place_id) } } : {}) }]
      })
    } catch (error) { throw googleError(error, 'Google 주소 검색에 실패했습니다.') }
  }
}
