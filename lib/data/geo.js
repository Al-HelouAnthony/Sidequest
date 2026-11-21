/**
 * Haversine fallback for travel times when OpenRouteService is unavailable.
 * Results MUST be flagged isEstimate = true.
 */

/**
 * @param {number} aLat @param {number} aLng @param {number} bLat @param {number} bLng
 * @returns {number} km
 */
export function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Rough door-to-door estimate. Assumes ~12 km/h average (mix of walking + metro/bike)
 * plus 5 min overhead. Straight-line distance underestimates real routes, hence the 1.3 detour factor.
 * @param {number} km
 * @returns {number} minutes
 */
export function estimateTravelMin(km) {
  return Math.round(5 + ((km * 1.3) / 12) * 60);
}
