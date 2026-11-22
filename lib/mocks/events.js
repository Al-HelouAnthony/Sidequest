/**
 * Sample city events for mock mode / DATA_FALLBACK, built RELATIVE TO NOW so they're always in the
 * feed's next days. Owner: Adel. Same row shape as public.events (montreal_open_data) after migration
 * 0006. Titles are generic samples (not real listings); venues and coordinates are real maisons de la
 * culture. One row is kids-only and one is online: both must be filtered out by eventRules.
 */
import { DateTime } from "luxon";
import { TIMEZONE } from "@/types/domain";

/** @param {number} dayOffset @param {string} hhmm */
const at = (dayOffset, hhmm) => {
  const [hour, minute] = hhmm.split(":").map(Number);
  return DateTime.now().setZone(TIMEZONE).plus({ days: dayOffset }).set({ hour, minute, second: 0, millisecond: 0 });
};

/**
 * @param {string} key last 12 hex (place_key) @param {string} title @param {string} type
 * @param {DateTime} start @param {DateTime} end @param {Partial<import("@/lib/data/events").EventRow>} [over]
 * @returns {import("@/lib/data/events").EventRow}
 */
const row = (key, title, type, start, end, over = {}) => ({
  id: `aaaaaaaa-0000-4000-8000-${key}`,
  title,
  url: "https://montreal.ca/evenements",
  event_type: type,
  audience: "Pour tous",
  setting: "En salle",
  is_free: true,
  start_date: start.toISODate() ?? "",
  end_date: end.toISODate() ?? "",
  start_at: start.toUTC().toISO(),
  end_at: end.toUTC().toISO(),
  venue_name: "Maison de la culture du Plateau-Mont-Royal",
  address: "465 Avenue du Mont-Royal Est",
  lat: 45.5243,
  lng: -73.5822,
  ...over,
});

/** Rebuilt on every call so the dates stay relative to today. */
export function buildMockEventRows() {
  return [
    row("e00000000001", "Sample: jazz trio evening", "Musique", at(1, "19:30"), at(1, "21:00")),
    row("e00000000002", "Sample: one-act comedy play", "Théâtre", at(2, "20:00"), at(2, "21:30"), { is_free: false, venue_name: "Maison de la culture Frontenac", address: "2550 Rue Ontario Est", lat: 45.5341, lng: -73.5525 }),
    row("e00000000003", "Sample: Québec film screening", "Cinéma", at(3, "14:00"), at(3, "15:45"), { venue_name: "Maison de la culture Mercier", address: "8105 Avenue Hochelaga", lat: 45.5779, lng: -73.5365 }),
    row("e00000000004", "Sample: photography exhibition", "Exposition", at(-10, "13:00"), at(30, "13:00"), { venue_name: "Maison de la culture Notre-Dame-de-Grâce", address: "3755 Rue Botrel", lat: 45.4733, lng: -73.6146 }),
    row("e00000000005", "Sample: contemporary dance night", "Danse", at(4, "19:00"), at(4, "20:30")),
    row("e00000000006", "Sample: outdoor winter market", "Fête et marché", at(5, "11:00"), at(5, "16:00"), { setting: "À l'extérieur" }),
    row("e00000000007", "Sample: storytime for toddlers", "Musique", at(1, "10:00"), at(1, "10:45"), { audience: "Enfants d'âge préscolaire" }), // filtered: kids-only
    row("e00000000008", "Sample: online concert", "Musique", at(2, "19:00"), at(2, "20:00"), { setting: "En ligne" }), // filtered: online
  ];
}
