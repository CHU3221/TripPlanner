import type { PlaceCandidate, PlaceSearchProvider } from './map/provider/contract'

/** One explicit UI search: text search first, geocoding only when it returns no candidates. */
export async function searchPlaceCandidates(provider:PlaceSearchProvider,query:string):Promise<PlaceCandidate[]>{
  const q=query.trim()
  if(!q)return []
  const places=await provider.searchPlaces(q)
  return places.length?places:provider.searchAddress(q)
}
