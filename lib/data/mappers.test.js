import { describe, expect, it } from "vitest";
import { BusyBlock, Friendship, Interaction, Place, Plan, PlanMember, TagWeights, TravelTime, User } from "@/types/domain";
import {
  busyBlockToRow,
  friendshipToRow,
  interactionToRow,
  placeToRow,
  planMemberToRow,
  planToRow,
  rowsToTagWeights,
  rowToBusyBlock,
  rowToFriendship,
  rowToInteraction,
  rowToPlace,
  rowToPlan,
  rowToPlanMember,
  rowToTravelTime,
  rowToUser,
  tagWeightsToRows,
  toIso,
  travelTimeToRow,
  userToRow,
} from "./mappers";

const SAM = "00000000-0000-4000-8000-000000000001";
const MAYA = "00000000-0000-4000-8000-000000000002";
const PLACE = "10000000-0000-4000-8000-000000000001";
const PLAN = "20000000-0000-4000-8000-000000000001";

// Sample rows shaped like supabase-js returns them (timestamptz as "+00:00" strings).
const rows = {
  user: {
    id: SAM,
    name: "Sam",
    avatar_url: "https://example.com/sam.svg",
    home_lat: 45.5048,
    home_lng: -73.5772,
    interests: ["coffee", "views"],
    created_at: "2026-11-20T23:00:00+00:00",
    updated_at: "2026-11-20T23:00:00+00:00",
  },
  friendship: { user_id: SAM, friend_id: MAYA, closeness: 3, created_at: "2026-11-20T23:00:00+00:00" },
  busyBlock: {
    id: "30000000-0000-4000-8000-000000000001",
    user_id: MAYA,
    start_at: "2026-11-21T14:00:00+00:00",
    end_at: "2026-11-21T18:00:00+00:00",
    source: "seed",
    created_at: "2026-11-20T23:00:00+00:00",
  },
  place: {
    id: PLACE,
    name: "Café Olimpico",
    category: "cafe",
    tags: ["coffee", "cheap-eats"],
    lat: 45.5229,
    lng: -73.6018,
    address: "124 Rue Saint-Viateur O",
    price_level: 1,
    photo_url: "https://example.com/olimpico.jpg",
    hours: { mon: [{ open: "07:00", close: "23:00" }], sat: [{ open: "15:00", close: "03:00" }] },
    typical_duration_min: 60,
    indoor: true,
    created_at: "2026-11-20T23:00:00+00:00",
  },
  travelTime: { user_id: SAM, place_id: PLACE, minutes: 14, mode: "foot-walking", is_estimate: false, created_at: "2026-11-20T23:00:00+00:00" },
  interaction: {
    id: "40000000-0000-4000-8000-000000000001",
    user_id: SAM,
    place_id: PLACE,
    slot_start: "2026-11-21T19:00:00+00:00",
    action: "skip",
    created_at: "2026-11-21T02:15:30.123+00:00",
  },
  tagWeights: [
    { user_id: SAM, tag: "bars", weight: -0.5, updated_at: "2026-11-21T02:15:30+00:00" },
    { user_id: SAM, tag: "cat:bar", weight: -0.25, updated_at: "2026-11-21T02:15:30+00:00" },
  ],
  plan: {
    id: PLAN,
    creator_id: SAM,
    place_id: PLACE,
    start_at: "2026-11-21T19:00:00+00:00",
    end_at: "2026-11-21T21:00:00+00:00",
    status: "pending",
    created_at: "2026-11-21T02:15:30+00:00",
    updated_at: "2026-11-21T02:15:30+00:00",
  },
  planMember: { plan_id: PLAN, user_id: MAYA, rsvp: "invited", created_at: "2026-11-21T02:15:30+00:00" },
};

/** Pick only `keys` from a row (drops DB-only columns like created_at for round-trip comparisons). */
const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));
/** Copy of a row without `keys`. */
const omit = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

describe("rowTo* produce valid contract shapes", () => {
  it("users", () => expect(User.parse(rowToUser(rows.user))).toEqual(rowToUser(rows.user)));
  it("friendships", () => expect(() => Friendship.parse(rowToFriendship(rows.friendship))).not.toThrow());
  it("busy_blocks", () => expect(() => BusyBlock.parse(rowToBusyBlock(rows.busyBlock))).not.toThrow());
  it("places", () => expect(() => Place.parse(rowToPlace(rows.place))).not.toThrow());
  it("travel_times", () => expect(() => TravelTime.parse(rowToTravelTime(rows.travelTime))).not.toThrow());
  it("interactions", () => expect(() => Interaction.parse(rowToInteraction(rows.interaction))).not.toThrow());
  it("user_tag_weights", () => expect(() => TagWeights.parse(rowsToTagWeights(rows.tagWeights))).not.toThrow());
  it("plans", () => expect(() => Plan.parse(rowToPlan(rows.plan))).not.toThrow());
  it("plan_members", () => expect(() => PlanMember.parse(rowToPlanMember(rows.planMember))).not.toThrow());
});

describe("mapped values", () => {
  it("converts snake_case to camelCase", () => {
    const user = rowToUser(rows.user);
    expect(user).toEqual({
      id: SAM,
      name: "Sam",
      avatarUrl: "https://example.com/sam.svg",
      homeLat: 45.5048,
      homeLng: -73.5772,
      interests: ["coffee", "views"],
    });
  });

  it("normalizes timestamptz to ISO UTC with Z", () => {
    expect(rowToBusyBlock(rows.busyBlock).startAt).toBe("2026-11-21T14:00:00.000Z");
    expect(rowToInteraction(rows.interaction).createdAt).toBe("2026-11-21T02:15:30.123Z");
    expect(toIso("2026-11-21T09:00:00-05:00")).toBe("2026-11-21T14:00:00.000Z");
  });

  it("keeps hours jsonb intact (incl. after-midnight close)", () => {
    expect(rowToPlace(rows.place).hours.sat).toEqual([{ open: "15:00", close: "03:00" }]);
  });

  it("folds tag weight rows into one record and back", () => {
    const weights = rowsToTagWeights(rows.tagWeights);
    expect(weights).toEqual({ bars: -0.5, "cat:bar": -0.25 });
    expect(tagWeightsToRows(SAM, weights)).toEqual([
      { user_id: SAM, tag: "bars", weight: -0.5 },
      { user_id: SAM, tag: "cat:bar", weight: -0.25 },
    ]);
  });

  it("empty tag weights -> {}", () => expect(rowsToTagWeights([])).toEqual({}));

  it("fills safe defaults for nullable text/array columns", () => {
    const user = rowToUser({ ...rows.user, avatar_url: null, interests: null });
    expect(user.avatarUrl).toBe("");
    expect(user.interests).toEqual([]);
  });
});

describe("round trip toRow(fromRow(row)) keeps the data columns", () => {
  it("users", () =>
    expect(userToRow(rowToUser(rows.user))).toEqual(pick(rows.user, ["id", "name", "avatar_url", "home_lat", "home_lng", "interests"])));
  it("friendships", () =>
    expect(friendshipToRow(rowToFriendship(rows.friendship))).toEqual(pick(rows.friendship, ["user_id", "friend_id", "closeness"])));
  it("places", () =>
    expect(placeToRow(rowToPlace(rows.place))).toEqual(omit(rows.place, ["created_at"])));
  it("travel_times", () =>
    expect(travelTimeToRow(rowToTravelTime(rows.travelTime))).toEqual(omit(rows.travelTime, ["created_at"])));
  it("plan_members", () =>
    expect(planMemberToRow(rowToPlanMember(rows.planMember))).toEqual(pick(rows.planMember, ["plan_id", "user_id", "rsvp"])));
  it("busy_blocks (timestamps normalized)", () =>
    expect(busyBlockToRow(rowToBusyBlock(rows.busyBlock))).toEqual({
      id: rows.busyBlock.id,
      user_id: MAYA,
      start_at: "2026-11-21T14:00:00.000Z",
      end_at: "2026-11-21T18:00:00.000Z",
      source: "seed",
    }));
  it("interactions", () =>
    expect(interactionToRow(rowToInteraction(rows.interaction))).toMatchObject({
      user_id: SAM,
      place_id: PLACE,
      action: "skip",
      slot_start: "2026-11-21T19:00:00.000Z",
    }));
  it("plans", () =>
    expect(planToRow(rowToPlan(rows.plan))).toMatchObject({ id: PLAN, creator_id: SAM, status: "pending" }));
});

describe("toRow omits ids so DB defaults apply", () => {
  it("busy block without id", () => {
    const row = busyBlockToRow({ userId: SAM, startAt: "2026-11-21T14:00:00.000Z", endAt: "2026-11-21T15:00:00.000Z", source: "seed" });
    expect(row).not.toHaveProperty("id");
  });
  it("interaction without id/createdAt", () => {
    const row = interactionToRow({ userId: SAM, placeId: PLACE, slotStart: "2026-11-21T19:00:00.000Z", action: "go" });
    expect(row).not.toHaveProperty("id");
    expect(row).not.toHaveProperty("created_at");
  });
});

describe("mismatched rows fail loudly with the table name", () => {
  it("bad category", () => expect(() => rowToPlace({ ...rows.place, category: "nightclub" })).toThrow(/places row does not match contract/));
  it("bad enum in busy_blocks", () => expect(() => rowToBusyBlock({ ...rows.busyBlock, source: "outlook" })).toThrow(/busy_blocks/));
  it("missing column", () =>
    expect(() => rowToUser(omit(rows.user, ["home_lat"]))).toThrow(/users row does not match contract/));
  it("invalid timestamp", () => expect(() => rowToPlan({ ...rows.plan, start_at: "not a date" })).toThrow(/invalid timestamp/));
});
