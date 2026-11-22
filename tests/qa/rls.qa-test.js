// QA security: Row Level Security with REAL user tokens (local auth), straight against PostgREST + Storage,
// i.e. what any signed-in user could do from the browser console with the public anon key.
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { db, qaId, QA } from "./helpers";
import { qaSession } from "../../scripts/qa-session.mjs";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const as = async (n) => {
  const { accessToken } = await qaSession(n);
  return createClient(URL_, ANON, { global: { headers: { Authorization: `Bearer ${accessToken}` } }, auth: { persistSession: false } });
};
const anon = () => createClient(URL_, ANON, { auth: { persistSession: false } });
const U = (n) => qaId(QA.user, n);
const report = [];

describe("RLS with real tokens", () => {
  it("a user can't read or change other users' private rows; anonymous gets nothing private", async () => {
    const lou = await as(8); // cluster B
    const max = U(4); // cluster A, not Lou's friend
    const rows = async (client, table, filter) => (await filter(client.from(table).select("*"))).data ?? [];

    // Reads of a stranger's data → empty.
    for (const [table, col] of [["busy_blocks", "user_id"], ["interactions", "user_id"], ["user_tag_weights", "user_id"], ["travel_times", "user_id"], ["users", "id"], ["friendships", "user_id"]]) {
      const got = await rows(lou, table, (q) => q.eq(col, max));
      report.push(`stranger ${table}: ${got.length} rows`);
      expect(got.length, table).toBe(0);
    }
    // Server-only tables → nothing, even for signed-in users.
    for (const table of ["google_tokens", "plan_locations", "plan_photos", "businesses"]) {
      const { data, error } = await lou.from(table).select("*").limit(5);
      report.push(`server-only ${table}: ${data?.length ?? 0} rows${error ? ` (${error.code})` : ""}`);
      expect(data?.length ?? 0, table).toBe(0);
    }
    // Plans: only those I'm in.
    const { data: myPlans } = await lou.from("plans").select("id, creator_id");
    const { data: memberships } = await db.from("plan_members").select("plan_id").eq("user_id", U(8));
    const mine = new Set((memberships ?? []).map((m) => m.plan_id));
    expect((myPlans ?? []).every((p) => mine.has(p.id) || p.creator_id === U(8))).toBe(true);
    report.push(`plans visible to Lou: ${myPlans?.length} (all hers)`);

    // Writes on someone else's behalf → refused.
    const ins = await lou.from("busy_blocks").insert({ user_id: max, start_at: "2026-12-01T15:00:00Z", end_at: "2026-12-01T16:00:00Z", source: "manual" });
    expect(ins.error).not.toBeNull();
    const upd = await lou.from("users").update({ name: "hacked" }).eq("id", max).select();
    expect(upd.data?.length ?? 0).toBe(0);
    const delW = await lou.from("user_tag_weights").delete().eq("user_id", max).select();
    expect(delW.data?.length ?? 0).toBe(0);
    const planIns = await lou.from("plans").insert({ creator_id: U(8), place_id: "10000000-0000-4000-8000-000000000001", start_at: "2026-12-01T15:00:00Z", end_at: "2026-12-01T16:00:00Z", status: "confirmed" });
    report.push(`direct plan insert: ${planIns.error ? "refused" : "ALLOWED"}`);
    expect(planIns.error).not.toBeNull();
    const memberIns = await lou.from("plan_members").insert({ plan_id: (myPlans?.[0]?.id ?? "00000000-0000-4000-8000-000000000000"), user_id: max, rsvp: "in" });
    expect(memberIns.error).not.toBeNull();
    const tokenRead = await lou.from("google_tokens").select("refresh_token");
    expect(tokenRead.data?.length ?? 0).toBe(0);

    // Anonymous (anon key only): no private table readable.
    const a = anon();
    for (const table of ["users", "busy_blocks", "friendships", "plans", "plan_members", "interactions", "travel_times", "events"]) {
      const { data } = await a.from(table).select("*").limit(3);
      report.push(`anon ${table}: ${data?.length ?? 0}`);
      expect(data?.length ?? 0, `anon ${table}`).toBe(0);
    }
    const { data: placesAnon } = await a.from("places").select("id").limit(3);
    report.push(`anon places (public by design): ${placesAnon?.length}`);
  });

  it("one-sided friendship: adding someone as a friend directly in the DB grants their busy blocks", async () => {
    // Lou adds Max as a friend herself (allowed: 'friendships: insert own'), then reads Max's data.
    const lou = await as(8);
    const max = U(4);
    await db.from("busy_blocks").insert({ user_id: max, start_at: "2026-12-02T15:00:00Z", end_at: "2026-12-02T16:00:00Z", source: "seed" });
    const add = await lou.from("friendships").insert({ user_id: U(8), friend_id: max, closeness: 1 });
    const busy = (await lou.from("busy_blocks").select("start_at").eq("user_id", max)).data ?? [];
    const profile = (await lou.from("users").select("id, name, home_lat, home_lng").eq("id", max)).data ?? [];
    report.push(`one-sided friend add: insert ${add.error ? "refused" : "allowed"} → stranger's busy blocks ${busy.length}, profile rows ${profile.length}${profile[0] ? ` (home ${profile[0].home_lat}, ${profile[0].home_lng})` : ""}`);
    await db.from("friendships").delete().eq("user_id", U(8)).eq("friend_id", max);
    await db.from("busy_blocks").delete().eq("user_id", max).eq("start_at", "2026-12-02T15:00:00+00:00");
  });

  it("storage: private plan photos are not listable/readable without a signed URL", async () => {
    const lou = await as(8);
    const { data: list } = await lou.storage.from("plan-photos").list("", { limit: 10 });
    report.push(`storage list plan-photos as a user: ${list?.length ?? 0}`);
    expect(list?.length ?? 0).toBe(0);
    const { data: up, error } = await lou.storage.from("plan-photos").upload(`x/${Date.now()}.jpg`, new Blob([new Uint8Array([1, 2, 3])]), { contentType: "image/jpeg" });
    report.push(`storage upload as a user: ${error ? "refused" : "ALLOWED " + up?.path}`);
    expect(error).not.toBeNull();
    console.log(report.join("\n"));
  });
});
