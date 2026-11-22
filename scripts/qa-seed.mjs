// QA: edge-case test data in the LOCAL Supabase only (assertLocal). Idempotent: removes earlier QA rows first.
// Everything is recognizable: names start with "qa_", ids start with 0a0a… (users), 0b0b… (places), 0c0c… (events),
// auth emails end with @qa.sidequest.test. Usage: node scripts/qa-seed.mjs [.env.local]
import { DateTime } from "luxon";
import { localAdmin, removeQaData, QA, qaId } from "./qa-local.mjs";

const db = localAdmin(process.argv[2] ?? ".env.local");
const TZ = "America/Toronto";
const PASSWORD = "qa-password-123"; // local stack only

// ---------- users ----------
const DOWNTOWN = [45.5048, -73.5772];
const PLATEAU = [45.5225, -73.58];
const MILE_END = [45.5236, -73.6];
const LAVAL = [45.6066, -73.7124];
const ST_JEROME = [45.7804, -74.0036]; // far suburb: beyond the 35 min travel cap
const avatar = (n) => `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(n)}`;
const ALL_TAGS = ["coffee", "cheap-eats", "views", "outdoors", "bars", "live-music", "art", "museums", "markets", "brunch", "iconic", "free", "late-night", "cocktails", "nature"];

/** [n, name, home, interests, schedule key, avatar override] */
const USERS = [
  [1, "qa_Hélène Côté", DOWNTOWN, ["museums", "art"], "mwfClasses"],
  [2, "qa_Seán O'Brien", PLATEAU, ["bars", "late-night", "cocktails"], "nightOwl"],
  [3, "qa_🎉 Party Pat", MILE_END, ["outdoors", "nature"], "weekendsOnly"],
  [4, "qa_Maximiliano Alejandro de la Santísima Trinidad Fernández-Gutiérrez", DOWNTOWN, ALL_TAGS, "empty"],
  [5, "qa_No Interests", DOWNTOWN, [], "empty"],
  [6, "qa_Fully Booked", DOWNTOWN, ["coffee"], "allDay"],
  [7, "qa_Zero Friends", DOWNTOWN, ["coffee", "brunch"], "empty"],
  [8, "qa_Laval Lou", LAVAL, ["markets", "cheap-eats"], "empty"],
  [9, "qa_Far Away Frank", ST_JEROME, ["views"], "empty"],
  [10, "qa_Back-to-back Bea", DOWNTOWN, ["coffee"], "backToBack"],
  [11, "qa_Midnight Mo", PLATEAU, ["late-night", "bars"], "crossMidnight"],
  [12, "qa_Duplicate Dee", DOWNTOWN, ["brunch"], "duplicates"],
  [13, "qa_Bridge Bo", PLATEAU, ["free", "iconic"], "empty"],
  [14, "qa_Popular Paula", DOWNTOWN, ["coffee", "views", "art"], "empty"],
  [15, "qa_Sam", DOWNTOWN, ["coffee"], "empty"],
  [16, "qa_Weekend Wendy", PLATEAU, ["nature", "outdoors"], "weekendsOnly"],
  [17, "qa_Missing Avatar", DOWNTOWN, ["art"], "empty", ""],
  [18, "qa_Broken Avatar", DOWNTOWN, ["museums"], "empty", "https://example.invalid/missing.png"],
  [19, "qa_Partial Pia", DOWNTOWN, ["coffee", "brunch"], "afternoon"],
  [20, "qa_Friend-of-friend Fay", PLATEAU, ["bars"], "empty"],
  [21, "qa_Morning Max", MILE_END, ["coffee"], "morningsOnly"],
  [22, "qa_Evening Eve", DOWNTOWN, ["cheap-eats"], "eveningsOnly"],
  [23, "qa_Museum Mia", DOWNTOWN, ["museums"], "empty"],
  [24, "qa_Park Pete", PLATEAU, ["outdoors"], "empty"],
  [25, "qa_Bar Bob", PLATEAU, ["bars"], "empty"],
  [26, "qa_Filler One", DOWNTOWN, ["coffee"], "mwfShort"],
  [27, "qa_Filler Two", PLATEAU, ["bars"], "tueThuEvening"],
  [28, "qa_Filler Three", MILE_END, ["art"], "empty"],
  [29, "qa_Filler Four", DOWNTOWN, ["brunch"], "earlyMornings"],
  [30, "qa_Filler Five", PLATEAU, ["views"], "empty"],
];

// ---------- schedules (local Montréal time, today .. today+7) ----------
const today = DateTime.now().setZone(TZ).startOf("day");
const days = Array.from({ length: 8 }, (_, i) => today.plus({ days: i }));
const at = (day, hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return day.set({ hour: h, minute: m, second: 0, millisecond: 0 });
};
const span = (day, from, to, nextDay = false) => [at(day, from), nextDay ? at(day.plus({ days: 1 }), to) : at(day, to)];
const weekdays = (d) => d.weekday <= 5;

/** @type {Record<string, (day: DateTime) => [DateTime, DateTime][]>} */
const SCHEDULES = {
  empty: () => [],
  mwfClasses: (d) => ([1, 3, 5].includes(d.weekday) ? [span(d, "09:00", "17:00")] : []),
  nightOwl: (d) => [span(d, "09:00", "22:00")],
  weekendsOnly: (d) => (weekdays(d) ? [span(d, "08:00", "23:30")] : []),
  allDay: (d) => [span(d, "00:00", "00:00", true)],
  backToBack: (d) => {
    const out = [];
    for (let t = at(d, "09:00"); t < at(d, "23:00"); t = t.plus({ hours: 1 })) out.push([t, t.plus({ minutes: 45 })]);
    return out;
  },
  crossMidnight: (d) => [span(d, "22:00", "02:00", true)],
  duplicates: (d) => [span(d, "12:00", "14:00"), span(d, "12:00", "14:00"), span(d, "13:00", "15:00")],
  afternoon: (d) => [span(d, "13:00", "15:00")],
  morningsOnly: (d) => [span(d, "12:00", "23:30")],
  eveningsOnly: (d) => [span(d, "09:00", "18:00")],
  mwfShort: (d) => ([1, 3, 5].includes(d.weekday) ? [span(d, "10:00", "16:00")] : []),
  tueThuEvening: (d) => ([2, 4].includes(d.weekday) ? [span(d, "18:00", "22:00")] : []),
  earlyMornings: (d) => [span(d, "09:00", "11:00")],
};

// ---------- friend graph ----------
const pairs = [];
const link = (a, b, closeness = 2) => pairs.push([a, b, closeness]);
const A = [1, 2, 3, 4, 5, 6]; // cluster A (complete)
const B = [8, 9, 10, 11, 12]; // cluster B (complete), no mutual friends with cluster C
const C = [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
for (const g of [A, B]) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) link(g[i], g[j], 1 + ((i + j) % 3));
for (const n of [...A, ...C, 26, 27, 28, 29, 30]) link(14, n, n % 3 === 0 ? 3 : 2); // Paula: 22 friends
link(13, 4, 3); // Bo bridges A and B
link(13, 8, 3);
link(15, 20, 2); // friends-of-friends: 16 and 20 are both friends with 15, not with each other
link(15, 16, 2);
link(16, 21, 1);
link(23, 24, 2); // chain: 23 and 25 are not friends
link(24, 25, 2);
// 7 has no friends at all.

// ---------- places (edge cases) ----------
const daily = (open, close) => Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, [{ open, close }]]));
const PLACES = [
  [1, "qa_No Photo Café", "cafe", ["coffee"], DOWNTOWN, "", daily("08:00", "20:00"), 60, true, 1],
  [2, "qa_Closed All Week", "restaurant", ["cheap-eats"], DOWNTOWN, "/places/10000000-0000-4000-8000-000000000001.jpg", {}, 60, true, 2],
  [3, "qa_Open 24h Diner", "restaurant", ["cheap-eats", "late-night"], PLATEAU, "/places/10000000-0000-4000-8000-000000000002.jpg", daily("00:00", "00:00"), 60, true, 1],
  [4, "qa_Night Bar", "bar", ["bars", "late-night"], PLATEAU, "/places/10000000-0000-4000-8000-000000000003.jpg", daily("20:00", "03:00"), 90, true, 2],
  [5, "qa_Outdoor Only Park", "park", ["outdoors", "nature"], MILE_END, "/places/10000000-0000-4000-8000-000000000004.jpg", daily("06:00", "23:00"), 60, false, 1],
  [6, "qa_Twin Name", "cafe", ["coffee"], DOWNTOWN, "/places/10000000-0000-4000-8000-000000000005.jpg", daily("08:00", "18:00"), 60, true, 1],
  [7, "qa_Twin Name", "cafe", ["coffee"], PLATEAU, "/places/10000000-0000-4000-8000-000000000006.jpg", daily("08:00", "18:00"), 60, true, 1],
];

// ---------- events (edge cases), shaped like montreal_open_data rows that pass keepEvent ----------
const ev = (n, title, startLocal, hours, { image = true, coords = true } = {}) => ({
  id: qaId(QA.event, n),
  source: "montreal_open_data", // the only value events_source_check allows; QA rows are found by id prefix
  source_id: `qa_event_${n}`,
  title,
  description: "QA test event",
  url: "https://montreal.ca/evenements/qa-test",
  event_type: "Musique",
  audience: "Pour tous",
  setting: "En salle",
  registration: "Entrée libre",
  is_free: true,
  start_date: startLocal.toISODate(),
  end_date: startLocal.toISODate(),
  start_at: startLocal.toUTC().toISO(),
  end_at: startLocal.plus({ hours }).toUTC().toISO(),
  venue_name: "qa_Venue",
  address: "1 Rue QA",
  borough: "Ville-Marie",
  lat: coords ? DOWNTOWN[0] + 0.002 : null,
  lng: coords ? DOWNTOWN[1] + 0.002 : null,
  image_url: image ? "https://res.cloudinary.com/villemontreal/image/upload/qa.jpg" : null,
});
const EVENTS = [
  ev(1, "qa_Past Event", at(today.minus({ days: 1 }), "14:00"), 2),
  ev(2, "qa_Event Inside Free Slot", at(today.plus({ days: 2 }), "14:00"), 2),
  ev(3, "qa_Event Outside Free Slot", at(today.plus({ days: 2 }), "03:00"), 1),
  ev(4, "qa_Event No Image", at(today.plus({ days: 3 }), "15:00"), 2, { image: false }),
  ev(5, "qa_Event No Coords", at(today.plus({ days: 3 }), "16:00"), 2, { coords: false }),
];

// ---------- write ----------
const haversineKm = (a, b) => {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const estimateMin = (km) => Math.round(5 + ((km * 1.3) / 12) * 60); // same as lib/data/geo.js
const must = (op, { error }) => {
  if (error) throw new Error(`${op}: ${error.message}`);
};

await removeQaData(db);

const userRows = USERS.map(([n, name, home, interests, , av]) => ({
  id: qaId(QA.user, n), name, avatar_url: av ?? avatar(name), home_lat: home[0], home_lng: home[1], interests,
}));
must("users", await db.from("users").insert(userRows));

for (const u of userRows) {
  const n = Number(u.id.slice(-2));
  const { error } = await db.auth.admin.createUser({ id: u.id, email: `qa_user${String(n).padStart(2, "0")}@qa.sidequest.test`, password: PASSWORD, email_confirm: true });
  if (error && !/already/i.test(error.message)) throw new Error(`auth ${u.name}: ${error.message}`);
}

// Local-only logins for the real teammates' rows (copied from the backup), so their feeds can be checked too.
// Same id as their users row; the email is a QA one (removed by the cleanup). Never touches Google.
const MOCK_IDS = new Set(["1", "2", "3", "4", "5"].map((n) => `00000000-0000-4000-8000-00000000000${n}`));
const { data: realUsers } = await db.from("users").select("id");
for (const u of realUsers.filter((r) => !r.id.startsWith(QA.user) && !MOCK_IDS.has(r.id))) {
  const { error } = await db.auth.admin.createUser({ id: u.id, email: `qa_real_${u.id.slice(0, 8)}@qa.sidequest.test`, password: PASSWORD, email_confirm: true });
  if (error && !/already/i.test(error.message)) throw new Error(`auth real ${u.id.slice(0, 8)}: ${error.message}`);
}

const friendRows = pairs.flatMap(([a, b, c]) => [
  { user_id: qaId(QA.user, a), friend_id: qaId(QA.user, b), closeness: c },
  { user_id: qaId(QA.user, b), friend_id: qaId(QA.user, a), closeness: c },
]);
must("friendships", await db.from("friendships").upsert(friendRows, { onConflict: "user_id,friend_id" }));

const busyRows = USERS.flatMap(([n, , , , sched]) =>
  days.flatMap((d) => SCHEDULES[sched](d)).map(([s, e]) => ({ user_id: qaId(QA.user, n), start_at: s.toUTC().toISO(), end_at: e.toUTC().toISO(), source: "seed" })),
);
must("busy_blocks", await db.from("busy_blocks").insert(busyRows));

const placeRows = PLACES.map(([n, name, category, tags, at_, photo, hours, dur, indoor, price]) => ({
  id: qaId(QA.place, n), name, category, tags, lat: at_[0], lng: at_[1], address: `${n} Rue QA`, price_level: price,
  photo_url: photo, hours, typical_duration_min: dur, indoor,
}));
must("places", await db.from("places").insert(placeRows));

// Straight-line estimates (ORS is off in QA): every QA user × every place, every real user × every QA place.
const { data: allPlaces } = await db.from("places").select("id, lat, lng");
const { data: allUsers } = await db.from("users").select("id, home_lat, home_lng");
const travel = [];
for (const u of allUsers) {
  for (const p of allPlaces) {
    if (!u.id.startsWith(QA.user) && !p.id.startsWith(QA.place)) continue;
    travel.push({ user_id: u.id, place_id: p.id, mode: "foot-walking", minutes: estimateMin(haversineKm([u.home_lat, u.home_lng], [p.lat, p.lng])), is_estimate: true });
  }
}
for (let i = 0; i < travel.length; i += 500) must("travel_times", await db.from("travel_times").upsert(travel.slice(i, i + 500), { onConflict: "user_id,place_id,mode" }));

must("events", await db.from("events").insert(EVENTS));

console.log(JSON.stringify({ users: userRows.length, friendships: friendRows.length, busy: busyRows.length, places: placeRows.length, travel: travel.length, events: EVENTS.length }));
