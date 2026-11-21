import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BusyBlock, HourlyWeather } from "@/types/domain";
import { DEMO_USER_ID } from "@/lib/mocks/users";
import { mockPlaces } from "@/lib/mocks/places";
import { ENGINE, LEARNING } from "./config";
import { hourKey, travelKey } from "./context";
import { FIXED_NOW, makeCtx } from "./fixtures";

describe("makeCtx (engine test fixture)", () => {
  const ctx = makeCtx();

  it("has every EngineContext key", () => {
    expect(Object.keys(ctx).sort()).toEqual(
      ["busyByUser", "friends", "me", "now", "places", "recentInteractions", "tagWeights", "travel", "weatherByHour"].sort(),
    );
    expect(ctx.me.id).toBe(DEMO_USER_ID);
    expect(ctx.friends).toHaveLength(4);
  });

  it("uses the fixed now (Fri 20:00 Montréal), not the clock", () => {
    expect(ctx.now.toISO()).toBe(FIXED_NOW.toISO());
    expect(ctx.now.weekday).toBe(5);
    expect(makeCtx().busyByUser.get(DEMO_USER_ID)).toEqual(ctx.busyByUser.get(DEMO_USER_ID));
  });

  it("indexes busy blocks for me and every friend, all valid", () => {
    for (const id of [ctx.me.id, ...ctx.friends.map((f) => f.user.id)]) expect(ctx.busyByUser.has(id)).toBe(true);
    const all = [...ctx.busyByUser.values()].flat();
    expect(all.length).toBeGreaterThan(0);
    expect(() => z.array(BusyBlock).parse(all)).not.toThrow();
  });

  it("covers every (user, place) travel pair", () => {
    expect(ctx.travel.size).toBe(5 * mockPlaces.length);
    expect(ctx.travel.get(travelKey(DEMO_USER_ID, mockPlaces[0].id))?.isEstimate).toBe(true);
  });

  it("has the staged rain on Saturday 14:00 local, valid hourly weather", () => {
    expect(() => z.array(HourlyWeather).parse([...ctx.weatherByHour.values()])).not.toThrow();
    const sat14 = FIXED_NOW.plus({ days: 1 }).set({ hour: 14, minute: 0 });
    expect(ctx.weatherByHour.get(hourKey(sat14.toMillis()))?.icon).toBe("rain");
  });

  it("accepts overrides", () => {
    expect(makeCtx({ tagWeights: { "cat:bar": -0.5 } }).tagWeights["cat:bar"]).toBe(-0.5);
  });

  it("config has the Part 0 knobs", () => {
    expect(ENGINE.tickMin).toBe(30);
    expect(ENGINE.minLeadMin).toBe(60);
    expect(LEARNING.suppressAt).toBeLessThan(0);
  });
});
