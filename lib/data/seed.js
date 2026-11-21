/**
 * Demo seed + reset. Owner: Adel. Called by POST /api/dev/seed (app/api/dev/seed/route.js).
 *
 * Running it twice gives the same clean state:
 *  - users / friendships: the 5 demo users from lib/mocks/users.js (same ids as the mocks).
 *    Any friendship touching a demo user (including real account ↔ demo user, both directions)
 *    is removed first; friendships between real accounts are kept.
 *  - places: exactly data/places.json (upsert by id, places no longer in the file are deleted).
 *  - plans, plan_members, interactions, user_tag_weights: wiped (fresh demo, learning reset).
 *  - busy_blocks: rows with source='seed' are replaced by the weekly patterns for the next
 *    14 days, starting today (Montréal). The feed looks 8 days ahead, so a seed stays valid
 *    for about a week. 'google' and 'manual' blocks are KEPT (real calendar sync must survive a reset).
 *  - travel_times: recomputed with OpenRouteService for EVERY user in the table (incl. a real
 *    Google user), haversine fallback flagged is_estimate.
 * Not one transaction (supabase-js has none over REST): if a step fails, fix and re-run; it's idempotent.
 * Server-only: needs the service-role client.
 */
import { z } from "zod";
import { Place } from "@/types/domain";
import placesJson from "@/data/places.json";
import { buildMockBusyBlocks } from "@/lib/mocks/schedules";
import { mockFriendships, mockUsers } from "@/lib/mocks/users";
import { busyBlockToRow, friendshipToRow, placeToRow, rowToUser, travelTimeToRow, userToRow } from "./mappers";
import { computeTravelTimes } from "./travel";

/** @typedef {import("@supabase/supabase-js").SupabaseClient} SupabaseClient */

/**
 * @typedef {object} SeedSummary
 * @property {number} users        demo users upserted
 * @property {number} friendships
 * @property {number} places
 * @property {number} placesRemoved
 * @property {number} busyBlocks   seed blocks inserted
 * @property {number} travelTimes
 * @property {number} travelRouted rows from ORS
 * @property {number} travelEstimated rows from the haversine fallback
 * @property {string[]} warnings
 */

/**
 * @param {string} op
 * @param {{ error: { message: string, code?: string } | null }} result
 */
function check(op, { error }) {
  if (error) throw new Error(`[lib/data/seed] ${op} failed${error.code ? ` (${error.code})` : ""}: ${error.message}`);
}

/**
 * Reset the demo data.
 * @param {SupabaseClient} db  service-role client
 * @param {{ computeTravel?: typeof computeTravelTimes, days?: number }} [opts]
 * @returns {Promise<SeedSummary>}
 */
export async function seedDemo(db, { computeTravel = computeTravelTimes, days = 14 } = {}) {
  const places = z.array(Place).parse(placesJson);
  const demoIds = mockUsers.map((u) => u.id);
  /** @type {string[]} */
  const warnings = [];

  // 1. Users (upsert keeps any real Google user rows untouched).
  check("users.upsert", await db.from("users").upsert(mockUsers.map(userToRow), { onConflict: "id" }));

  // 2. Places: upsert the dataset, then delete places that left it (cascades their travel rows).
  check("places.upsert", await db.from("places").upsert(places.map(placeToRow), { onConflict: "id" }));
  const removed = await db
    .from("places")
    .delete()
    .not("id", "in", `(${places.map((p) => p.id).join(",")})`)
    .select("id");
  check("places.delete stale", removed);

  // 3. Fresh demo: no plans (members cascade), no swipes, no learned weights.
  check("plans.delete", await db.from("plans").delete().not("id", "is", null));
  check("interactions.delete", await db.from("interactions").delete().not("id", "is", null));
  check("user_tag_weights.delete", await db.from("user_tag_weights").delete().not("user_id", "is", null));

  // 4. Friendships: remove EVERY row that touches a demo user (demo↔demo and real↔demo, both
  //    directions, e.g. a teammate who friended Sam while testing), then insert the mock graph.
  //    Friendships between real accounts are never touched.
  const demoList = `(${demoIds.join(",")})`;
  check("friendships.delete", await db.from("friendships").delete().or(`user_id.in.${demoList},friend_id.in.${demoList}`));
  check("friendships.insert", await db.from("friendships").insert(mockFriendships.map(friendshipToRow)));

  // 5. Busy blocks: replace only seed rows; keep google/manual.
  check("busy_blocks.delete seed", await db.from("busy_blocks").delete().eq("source", "seed"));
  const blocks = buildMockBusyBlocks(days);
  if (blocks.length) check("busy_blocks.insert", await db.from("busy_blocks").insert(blocks.map(busyBlockToRow)));

  // 6. Travel times for every user in the DB (demo + any real Google user).
  const usersRes = await db.from("users").select("id, name, avatar_url, home_lat, home_lng, interests");
  check("users.select", usersRes);
  const users = (usersRes.data ?? []).map(rowToUser);
  const { rows: travel, stats } = await computeTravel(users, places);
  warnings.push(...stats.errors);
  check("travel_times.delete", await db.from("travel_times").delete().in("user_id", users.map((u) => u.id)));
  if (travel.length) check("travel_times.insert", await db.from("travel_times").insert(travel.map(travelTimeToRow)));

  return {
    users: mockUsers.length,
    friendships: mockFriendships.length,
    places: places.length,
    placesRemoved: removed.data?.length ?? 0,
    busyBlocks: blocks.length,
    travelTimes: travel.length,
    travelRouted: stats.routed,
    travelEstimated: stats.estimated,
    warnings,
  };
}
