/**
 * Choices for onboarding (PLAN.md F9). Owner: Oscar. Pure data, safe to import client-side.
 *
 * NEIGHBOURHOODS is a TEMPORARY copy of the ids/names Adel agreed for lib/neighbourhoods.js
 * (same stable slugs, sorted by name). When his PR is on main, replace this export with:
 *   export { NEIGHBOURHOODS } from "@/lib/neighbourhoods";
 * Only the id is sent to the server (PATCH /api/me); coords are looked up server-side.
 */

/** @typedef {{ id: string, name: string }} NeighbourhoodOption */

/** @type {NeighbourhoodOption[]} */
export const NEIGHBOURHOODS = [
  { id: "cote-des-neiges", name: "Côte-des-Neiges" },
  { id: "downtown", name: "Downtown" },
  { id: "griffintown", name: "Griffintown" },
  { id: "hochelaga", name: "Hochelaga" },
  { id: "little-italy", name: "Little Italy" },
  { id: "mile-end", name: "Mile End" },
  { id: "ndg", name: "NDG" },
  { id: "old-montreal", name: "Old Montréal" },
  { id: "outremont", name: "Outremont" },
  { id: "plateau", name: "Plateau-Mont-Royal" },
  { id: "rosemont", name: "Rosemont" },
  { id: "saint-henri", name: "Saint-Henri" },
  { id: "verdun", name: "Verdun" },
  { id: "villeray", name: "Villeray" },
  { id: "westmount", name: "Westmount" },
];

/** Tag vocabulary from PLAN.md §6.3 (the engine's place tags), with friendly labels. */
export const INTERESTS = [
  { id: "coffee", label: "Coffee" },
  { id: "brunch", label: "Brunch" },
  { id: "cheap-eats", label: "Cheap eats" },
  { id: "bars", label: "Bars" },
  { id: "cocktails", label: "Cocktails" },
  { id: "late-night", label: "Late night" },
  { id: "live-music", label: "Live music" },
  { id: "art", label: "Art" },
  { id: "museums", label: "Museums" },
  { id: "markets", label: "Markets" },
  { id: "outdoors", label: "Outdoors" },
  { id: "nature", label: "Nature" },
  { id: "views", label: "Views" },
  { id: "iconic", label: "Iconic spots" },
  { id: "free", label: "Free stuff" },
];

/** Minimum interests before Continue unlocks (PLAN.md says "pick ~5"). */
export const MIN_INTERESTS = 3;
