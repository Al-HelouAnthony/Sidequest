/**
 * Which city events (public.events, source montreal_open_data) are worth suggesting to a group of
 * friends, and how to read exact times from a montreal.ca page. Owner: Adel.
 * Pure, no "@/" imports: also used by supabase/import/events/fetch_event_times.mjs (plain node).
 */

/** Things friends go to together. Everything else (library workshops, councils, help desks…) is dropped. */
export const KEEP_TYPES = new Set([
  "Musique", "Théâtre", "Cinéma", "Danse", "Exposition", "Fête et marché", "Humour", "Cirque", "Art de la parole",
  "Jeux", "Sport et plein air",
]);

/** Kids-only and seniors-only events aren't for a group of students. */
export const DROP_AUDIENCES = new Set(["Enfants", "Enfants d'âge préscolaire", "Personnes aînées", "Adolescents"]);

/**
 * @param {{ event_type?: string | null, audience?: string | null, setting?: string | null, lat?: number | null, lng?: number | null }} row
 */
export function keepEvent(row) {
  if (!row || !KEEP_TYPES.has(row.event_type ?? "")) return false;
  if (DROP_AUDIENCES.has(row.audience ?? "")) return false;
  if (row.setting === "En ligne") return false;
  return row.lat != null && row.lng != null;
}

/** JSON-LD image: a URL, a list of URLs, or an ImageObject { url }. Only https. @param {unknown} img */
function imageUrl(img) {
  const first = Array.isArray(img) ? img[0] : img;
  const url = typeof first === "string" ? first : first && typeof first === "object" ? /** @type {any} */ (first).url : null;
  return typeof url === "string" && /^https:\/\/\S+$/.test(url) ? url : null;
}

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Exact start/end (+ the official picture) from a montreal.ca event page: its JSON-LD Event
 * ("startDate": "2026-11-27T19:30:00-05:00", "image": "https://res.cloudinary.com/villemontreal/…").
 * @param {string} html
 * @returns {{ startAt: string, endAt: string | null, image: string | null } | null} UTC ISO strings, or null when the page has none
 */
export function parseJsonLdTimes(html) {
  for (const m of String(html).matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let json;
    try {
      json = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const nodes = Array.isArray(json) ? json : json?.["@graph"] ?? [json];
    for (const n of nodes) {
      const type = [].concat(n?.["@type"] ?? []).join(" ");
      if (!/Event/.test(type) || !ISO_WITH_OFFSET.test(n.startDate ?? "")) continue;
      const start = new Date(n.startDate);
      const end = ISO_WITH_OFFSET.test(n.endDate ?? "") ? new Date(n.endDate) : null;
      if (Number.isNaN(start.getTime())) continue;
      return { startAt: start.toISOString(), endAt: end && end > start ? end.toISOString() : null, image: imageUrl(n.image) };
    }
  }
  return null;
}
