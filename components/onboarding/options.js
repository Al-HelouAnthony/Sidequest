/**
 * Choices for onboarding (F9) and the You tab. Owner: Oscar. Thin adapters over Adel's shared lists
 * (single source of truth, the same words the engine and lib/data updateProfile accept):
 *  - NEIGHBOURHOODS from lib/neighbourhoods.js (sorted by name; only the id is sent, coords stay server-side)
 *  - INTEREST_TAGS + INTEREST_LABELS from lib/interests.js
 */
import { INTEREST_LABELS, INTEREST_TAGS } from "@/lib/interests";

export { NEIGHBOURHOODS, findNeighbourhood } from "@/lib/neighbourhoods";

/** Interest chips: { id: tag, label } in Adel's order. */
export const INTERESTS = INTEREST_TAGS.map((id) => ({ id, label: INTEREST_LABELS[id] ?? id.replace(/-/g, " ") }));

/** Minimum interests before Continue unlocks (PLAN.md says "pick ~5"). */
export const MIN_INTERESTS = 3;
