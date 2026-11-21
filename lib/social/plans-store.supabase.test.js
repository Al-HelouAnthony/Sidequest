// Supabase store (USE_MOCK_DATA=false) against a small fake database: no network, no keys.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPlaces } from "@/lib/mocks/places";

const { fake } = vi.hoisted(() => {
  /** @type {Record<string, any[]>} */
  const tables = { plans: [], plan_members: [] };
  /** failNext: the next query returns this error. knownUsers: plan_members FK check. */
  const state = { failNext: null, knownUsers: null };

  function run(q) {
    if (state.failNext) {
      const error = state.failNext;
      state.failNext = null;
      return { data: null, error };
    }
    const rows = tables[q.table];
    const match = (r) => q.filters.every((f) => f(r));
    switch (q.op) {
      case "insert":
        if (q.table === "plan_members" && state.knownUsers && q.payload.some((r) => !state.knownUsers.includes(r.user_id))) {
          return { data: null, error: { code: "23503", message: "violates foreign key constraint" } };
        }
        rows.push(...q.payload.map((r) => ({ ...r })));
        return { data: null, error: null };
      case "upsert": {
        const row = q.payload[0];
        const i = rows.findIndex((x) => x.plan_id === row.plan_id && x.user_id === row.user_id);
        if (i >= 0) rows[i] = { ...rows[i], ...row };
        else rows.push({ ...row });
        return { data: null, error: null };
      }
      case "update":
        rows.filter(match).forEach((r) => Object.assign(r, q.payload));
        return { data: null, error: null };
      case "delete": {
        tables[q.table] = rows.filter((r) => !match(r));
        if (q.table === "plans") {
          tables.plan_members = tables.plan_members.filter((m) => tables.plans.some((p) => p.id === m.plan_id));
        }
        return { data: null, error: null };
      }
      default: {
        const out = rows.filter(match).map((r) => ({ ...r }));
        if (q.orderBy) out.sort((a, b) => (a[q.orderBy] < b[q.orderBy] ? -1 : 1));
        return q.single ? { data: out[0] ?? null, error: null } : { data: out, error: null };
      }
    }
  }

  function from(table) {
    const q = { table, op: "select", filters: [], orderBy: null, payload: null, single: false };
    const b = {
      select: () => b,
      insert: (rows) => ((q.op = "insert"), (q.payload = Array.isArray(rows) ? rows : [rows]), b),
      upsert: (row) => ((q.op = "upsert"), (q.payload = [row]), b),
      update: (obj) => ((q.op = "update"), (q.payload = obj), b),
      delete: () => ((q.op = "delete"), b),
      eq: (col, v) => (q.filters.push((r) => r[col] === v), b),
      in: (col, vs) => (q.filters.push((r) => vs.includes(r[col])), b),
      order: (col) => ((q.orderBy = col), b),
      maybeSingle: () => ((q.single = true), b),
      then: (resolve, reject) => Promise.resolve(run(q)).then(resolve, reject),
    };
    return b;
  }

  return { fake: { from, tables, state } };
});

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fake }));
vi.mock("@/lib/data", async (importOriginal) => ({ ...(await importOriginal()), USE_MOCK_DATA: false }));

const { createPlan, getPlan, listPlans, setRsvp } = await import("./plans-store");

const SAM = "00000000-0000-4000-8000-000000000001";
const MAYA = "00000000-0000-4000-8000-000000000002";
const KARIM = "00000000-0000-4000-8000-000000000003";
const STRANGER = "99999999-0000-4000-8000-000000000999";
const PLACE = mockPlaces[0].id;
const T1 = "2026-11-21T19:00:00.000Z";
const request = (inviteeIds = [MAYA, KARIM]) => ({
  placeId: PLACE,
  start: T1,
  end: "2026-11-21T20:00:00.000Z",
  inviteeIds,
});

beforeEach(() => {
  fake.tables.plans = [];
  fake.tables.plan_members = [];
  fake.state.failNext = null;
  fake.state.knownUsers = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("plans store (Supabase)", () => {
  it("full flow: create → Maya says in → confirmed, saved in the database", async () => {
    const plan = await createPlan(SAM, request());
    expect(fake.tables.plans).toHaveLength(1);
    expect(fake.tables.plan_members).toHaveLength(3);

    await setRsvp(MAYA, plan.id, "in");
    expect(fake.tables.plans[0].status).toBe("confirmed");

    const seenBySam = await getPlan(SAM, plan.id);
    expect(seenBySam.status).toBe("confirmed");
    expect(seenBySam.members.find((m) => m.userId === MAYA)?.rsvp).toBe("in");
    expect(await listPlans(KARIM)).toHaveLength(1);
  });

  it("an unknown invitee deletes the half-made plan and gives 400", async () => {
    fake.state.knownUsers = [SAM, MAYA];
    await expect(createPlan(SAM, request([MAYA, STRANGER]))).rejects.toMatchObject({ status: 400 });
    expect(fake.tables.plans).toHaveLength(0);
    expect(fake.tables.plan_members).toHaveLength(0);
  });

  it("a database error gives a clear 503, with no fallback to memory", async () => {
    fake.state.failNext = { code: "08006", message: "connection failure" };
    await expect(createPlan(SAM, request())).rejects.toMatchObject({ status: 503 });
    expect(globalThis.__sqPlans.plans).toHaveLength(0);
  });

  it("an invalid plan id gives 404, a non-member 403", async () => {
    fake.state.failNext = { code: "22P02", message: "invalid input syntax for type uuid" };
    await expect(getPlan(SAM, "not-a-uuid")).rejects.toMatchObject({ status: 404 });

    const plan = await createPlan(SAM, request([MAYA]));
    await expect(getPlan(KARIM, plan.id)).rejects.toMatchObject({ status: 403 });
  });
});
