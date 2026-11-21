/**
 * Fetch upcoming Montréal events from the Ticketmaster Discovery API v2 and write them as
 * SQL (upserts into public.events, see 00_create_table.sql). Owner: Adel.
 *
 *   node --env-file=.env.local supabase/import/events/fetch_ticketmaster.mjs [--days 30]
 *
 * Needs TICKETMASTER_API_KEY in .env.local (free "Consumer Key" from developer.ticketmaster.com).
 * Writes supabase/import/events/10_ticketmaster_data.sql. Paste it into the Supabase SQL Editor
 * after 00_create_table.sql. Safe to re-run: rows upsert on (source, source_id), so a fresh
 * fetch refreshes status (canceled/postponed) and prices.
 *
 * API facts (from the Discovery API v2 docs): GET https://app.ticketmaster.com/discovery/v2/events.json,
 * key in the `apikey` query param, events in `_embedded.events`, venues in `event._embedded.venues`,
 * quota 5000 calls/day and 5 requests/second, deep paging limited to size * page < 1000.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const API = "https://app.ticketmaster.com/discovery/v2/events.json";
const PAGE_SIZE = 200;
const MAX_ITEMS = 1000; // documented deep-paging limit
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "10_ticketmaster_data.sql");

export const COLS = [
  "source", "source_id", "title", "description", "url", "event_type", "genre", "is_free",
  "price_min", "price_max", "currency", "start_date", "end_date", "start_at", "status",
  "venue_name", "address", "postal_code", "lat", "lng", "image_url",
];

const clean = (v) => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v;
  return s === "" || s === undefined ? null : s;
};
const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const toNum = (v) => {
  const n = typeof v === "string" ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
};

/** Pick the widest 16:9 image (cards are full-bleed), else the widest of any ratio. */
function bestImage(images = []) {
  const byWidth = (a, b) => (b.width ?? 0) - (a.width ?? 0);
  const wide = images.filter((i) => i.ratio === "16_9").sort(byWidth);
  return (wide[0] ?? [...images].sort(byWidth)[0])?.url ?? null;
}

/**
 * One Ticketmaster event -> one row object for public.events (null = skip: no usable date).
 * @param {any} e
 */
export function eventToRow(e) {
  const start = e?.dates?.start ?? {};
  if (!e?.id || !clean(e?.name) || !isDate(start.localDate)) return null;
  const endDate = isDate(e.dates?.end?.localDate) && e.dates.end.localDate >= start.localDate ? e.dates.end.localDate : start.localDate;
  const cls = (e.classifications ?? []).find((c) => c.primary) ?? e.classifications?.[0];
  const price = (e.priceRanges ?? []).find((p) => p.type === "standard") ?? e.priceRanges?.[0];
  const priceMin = toNum(price?.min);
  const priceMax = toNum(price?.max);
  const venue = e._embedded?.venues?.[0] ?? {};
  const lat = toNum(venue.location?.latitude);
  const lng = toNum(venue.location?.longitude);
  const genre = clean(cls?.genre?.name);
  return {
    source: "ticketmaster",
    source_id: e.id,
    title: clean(e.name),
    description: (clean(e.info) ?? clean(e.pleaseNote) ?? clean(e.description) ?? "").slice(0, 1000),
    url: clean(e.url),
    event_type: clean(cls?.segment?.name),
    genre: genre === "Undefined" ? null : genre,
    is_free: price ? priceMin === 0 && (priceMax ?? 0) === 0 : null,
    price_min: priceMin,
    price_max: priceMax,
    currency: clean(price?.currency),
    start_date: start.localDate,
    end_date: endDate,
    start_at: clean(start.dateTime) ?? null,
    status: clean(e.dates?.status?.code),
    venue_name: clean(venue.name),
    address: clean(venue.address?.line1),
    postal_code: clean(venue.postalCode),
    lat: lat !== null && Math.abs(lat) <= 90 ? lat : null,
    lng: lng !== null && Math.abs(lng) <= 180 ? lng : null,
    image_url: bestImage(e.images),
  };
}

/** @param {unknown} v */
function sqlValue(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`bad number ${v}`);
    return String(v);
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** Rows -> one upsert statement. @param {ReturnType<typeof eventToRow>[]} rows */
export function rowsToSql(rows, note = "") {
  const update = COLS.filter((c) => c !== "source" && c !== "source_id").map((c) => `${c} = excluded.${c}`).join(",\n  ");
  return (
    `-- 10_ticketmaster_data.sql: ${rows.length} Ticketmaster events${note}. Safe to re-run.\n` +
    `insert into public.events\n  (${COLS.join(", ")})\nvalues\n` +
    rows.map((r) => `(${COLS.map((c) => sqlValue(r[c])).join(",")})`).join(",\n") +
    `\non conflict (source, source_id) do update set\n  ${update},\n  updated_at = now();\n`
  );
}

const isoNoMs = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key) {
    console.error("TICKETMASTER_API_KEY is not set. Add it to .env.local and run with: node --env-file=.env.local ...");
    process.exit(1);
  }
  const daysArg = process.argv.indexOf("--days");
  const days = daysArg > -1 ? Number(process.argv[daysArg + 1]) : 30;
  const now = new Date();
  const params = {
    city: "Montreal",
    countryCode: "CA",
    preferredCountry: "ca",
    locale: "*",
    sort: "date,asc",
    startDateTime: isoNoMs(now),
    endDateTime: isoNoMs(new Date(now.getTime() + days * 86_400_000)),
    size: String(PAGE_SIZE),
  };

  /** @type {Map<string, any>} */
  const byId = new Map();
  for (let page = 0; page * PAGE_SIZE < MAX_ITEMS; page++) {
    const url = `${API}?${new URLSearchParams({ ...params, page: String(page) })}&apikey=${encodeURIComponent(key)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const body = await res.text();
    if (!res.ok) {
      console.error(`Ticketmaster HTTP ${res.status} on page ${page}: ${body.slice(0, 300)}`);
      process.exit(1);
    }
    const json = JSON.parse(body);
    const events = json._embedded?.events ?? [];
    for (const e of events) {
      const row = eventToRow(e);
      if (row) byId.set(row.source_id, row);
    }
    const totalPages = json.page?.totalPages ?? 0;
    console.log(`page ${page + 1}/${Math.max(totalPages, 1)}: ${events.length} events (total available ${json.page?.totalElements ?? 0})`);
    if (page + 1 >= totalPages) break;
    await sleep(250); // stay under 5 requests/second
  }

  const rows = [...byId.values()];
  if (rows.length === 0) {
    console.log("No events returned, nothing written.");
    return;
  }
  fs.writeFileSync(OUT, rowsToSql(rows, `, next ${days} days, fetched ${now.toISOString()}`));
  console.log(`Wrote ${rows.length} events to ${path.relative(process.cwd(), OUT)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
