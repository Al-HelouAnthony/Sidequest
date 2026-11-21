/**
 * Montréal neighbourhoods for the onboarding picker. Owner: Adel.
 * PURE DATA, no imports: safe to import from client components.
 *
 * The client sends only the `id` (PATCH /api/me); the server looks the coordinates up here
 * (lib/data updateProfile), so a user's home is a neighbourhood centre, never an exact address,
 * and nobody can set arbitrary coordinates. Coordinates: OpenStreetMap (Nominatim) centres.
 */

/** @typedef {{ id: string, name: string, lat: number, lng: number }} NeighbourhoodT */

/** Sorted by name for the picker. Ids are stable lowercase slugs: never rename one. @type {NeighbourhoodT[]} */
export const NEIGHBOURHOODS = [
  { id: "cote-des-neiges", name: "Côte-des-Neiges", lat: 45.4988, lng: -73.624 },
  { id: "downtown", name: "Downtown (Centre-ville)", lat: 45.4956, lng: -73.5704 },
  { id: "griffintown", name: "Griffintown", lat: 45.4905, lng: -73.5621 },
  { id: "hochelaga", name: "Hochelaga-Maisonneuve", lat: 45.5515, lng: -73.54 },
  { id: "little-italy", name: "Little Italy (Petite-Italie)", lat: 45.5357, lng: -73.6085 },
  { id: "mile-end", name: "Mile End", lat: 45.5251, lng: -73.6002 },
  { id: "ndg", name: "Notre-Dame-de-Grâce (NDG)", lat: 45.468, lng: -73.6289 },
  { id: "old-montreal", name: "Old Montréal (Vieux-Montréal)", lat: 45.5034, lng: -73.5574 },
  { id: "outremont", name: "Outremont", lat: 45.5186, lng: -73.6069 },
  { id: "plateau", name: "Plateau-Mont-Royal", lat: 45.5218, lng: -73.5822 },
  { id: "rosemont", name: "Rosemont", lat: 45.5605, lng: -73.5728 },
  { id: "saint-henri", name: "Saint-Henri", lat: 45.4783, lng: -73.5852 },
  { id: "verdun", name: "Verdun", lat: 45.4591, lng: -73.5732 },
  { id: "villeray", name: "Villeray", lat: 45.5415, lng: -73.6236 },
  { id: "westmount", name: "Westmount", lat: 45.4857, lng: -73.5966 },
];

/** @param {string} id @returns {NeighbourhoodT | undefined} */
export const findNeighbourhood = (id) => NEIGHBOURHOODS.find((n) => n.id === id);
