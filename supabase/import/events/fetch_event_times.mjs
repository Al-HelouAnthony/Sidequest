/**
 * Fill exact start/end times for city events from their montreal.ca page (JSON-LD "startDate"/"endDate").
 * Owner: Adel. Needs migration 0006 (events.end_at).
 *
 *   node --env-file=.env.local supabase/import/events/fetch_event_times.mjs [--days 8] [--all] [--dry] [--limit N]
 *
 * Only events the app would show (lib/data/eventRules.js: kept types, not kids/seniors-only, not online,
 * with a location) that are active in the next --days days. Skips rows that already have start_at
 * unless --all. ~3 requests/second, generic User-Agent. --dry prints, writes nothing. Safe to re-run.
 */
import { createClient } from "@supabase/supabase-js";
import { keepEvent, parseJsonLdTimes } from "../../../lib/data/eventRules.js";

const UA = "Mozilla/5.0 (compatible; montreal-events-times/0.1)";
const GAP_MS = 340; // ~3 req/s
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const localDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(d); // YYYY-MM-DD

async function fetchPage(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(10_000) });
    if (res.status === 429 || res.status >= 500) {
      await sleep(2000 * attempt);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }
  throw new Error("HTTP 429/5xx after 3 tries");
}

async function main() {
  const args = process.argv.slice(2);
  const daysArg = args.indexOf("--days");
  const days = daysArg > -1 ? Number(args[daysArg + 1]) : 8;
  const all = args.includes("--all");
  const dry = args.includes("--dry");
  const limitArg = args.indexOf("--limit");
  const limit = limitArg > -1 ? Number(args[limitArg + 1]) : Infinity;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY: run with node --env-file=.env.local …");
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const today = localDate(new Date());
  const until = localDate(new Date(Date.now() + days * 86_400_000));

  const { data, error } = await db
    .from("events")
    .select("id, title, url, event_type, audience, setting, lat, lng, start_at")
    .eq("source", "montreal_open_data")
    .lte("start_date", until)
    .gte("end_date", today);
  if (error) throw new Error(`events.select failed: ${error.message}`);
  const todo = data.filter((r) => keepEvent(r) && r.url && (all || !r.start_at)).slice(0, limit);
  console.log(`${data.length} events active ${today}..${until}; ${data.filter(keepEvent).length} worth showing; fetching ${todo.length}${dry ? " (dry run)" : ""}…`);

  let ok = 0, noTimes = 0, failed = 0;
  for (const [i, r] of todo.entries()) {
    try {
      const times = parseJsonLdTimes(await fetchPage(r.url));
      if (!times) {
        noTimes++;
      } else {
        ok++;
        if (dry) console.log(`  ${times.startAt} → ${times.endAt ?? "?"}  ${r.title.slice(0, 60)}`);
        else {
          const { error: upErr } = await db.from("events").update({ start_at: times.startAt, end_at: times.endAt, updated_at: new Date().toISOString() }).eq("id", r.id);
          if (upErr) throw new Error(`update: ${upErr.message}`);
        }
      }
    } catch (e) {
      failed++;
      console.error(`  ! ${r.title.slice(0, 50)}: ${e.message}`);
    }
    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${todo.length}…`);
    await sleep(GAP_MS);
  }
  console.log(`Done: ${ok} with times${dry ? " (not saved)" : " saved"}, ${noTimes} pages without times, ${failed} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
