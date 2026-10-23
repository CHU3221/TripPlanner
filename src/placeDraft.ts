import type { TripPlace, TripPlaceFieldProvenance } from './domain/place'
import type { PlaceCandidate } from './map/provider/contract'
import type { PlaceChoice } from './components/editorTypes'

type NewPlaceChoice = Extract<PlaceChoice, { mode: 'NEW' }>

const user = { source: 'USER' as const }
const provider = (providerId: PlaceCandidate['provider']) => ({ source: 'PROVIDER' as const, provider: providerId })

/** Converts a provider result into an editor draft without materializing a TripPlace. */
export function placeChoiceFromCandidate(candidate: PlaceCandidate, searchLabel?: string): NewPlaceChoice {
  const fromProvider = provider(candidate.provider)
  return {
    mode: 'NEW',
    name: candidate.name,
    address: candidate.address,
    lat: candidate.position.lat,
    lng: candidate.position.lng,
    sourceRef: candidate.sourceRef,
    ...(searchLabel?.trim() ? { searchLabel: searchLabel.trim() } : {}),
    provenance: {
      name: fromProvider,
      ...(candidate.address ? { address: fromProvider } : {}),
      position: fromProvider,
    },
  }
}

/**
 * A manual edit changes only the edited field's provenance to USER. This matters when a
 * user selects a provider result and then intentionally replaces its name/coordinates.
 */
export function patchNewPlaceChoiceAsUser(
  choice: NewPlaceChoice,
  patch: Partial<Omit<NewPlaceChoice, 'mode' | 'provenance'>>,
): NewPlaceChoice {
  const provenance: TripPlaceFieldProvenance = { ...choice.provenance }
  if ('name' in patch) provenance.name = user
  if ('address' in patch) provenance.address = user
  if ('lat' in patch || 'lng' in patch) provenance.position = user
  return { ...choice, ...patch, provenance }
}

/**
 * Materializes a NEW editor choice into the canonical TripPlace shape.
 * Missing provenance is treated as USER only for manually-constructed editor drafts;
 * provider adapters must create choices through placeChoiceFromCandidate().
 */
export function materializeNewPlaceChoice(choice: NewPlaceChoice, id: string): TripPlace {
  const hasPosition = Number.isFinite(choice.lat) && Number.isFinite(choice.lng)
  const provenance: TripPlaceFieldProvenance = {
    name: choice.provenance?.name ?? user,
    ...(choice.address ? { address: choice.provenance?.address ?? user } : {}),
    ...(hasPosition ? { position: choice.provenance?.position ?? user } : {}),
  }
  return {
    id,
    name: choice.name.trim(),
    address: choice.address?.trim() || undefined,
    position: hasPosition ? { lat: choice.lat!, lng: choice.lng! } : undefined,
    providerRef: choice.sourceRef,
    provenance,
    ...(choice.searchLabel?.trim() ? { searchLabel: choice.searchLabel.trim() } : {}),
  }
}
