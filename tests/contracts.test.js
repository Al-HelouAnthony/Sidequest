/**
 * Guards the shared contracts: every mock must satisfy the Zod schemas in types/.
 * In JavaScript this is our safety net: if you change a schema, this tells you which mocks broke.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BusyBlock, FeedCard, HourlyWeather, Place, User } from "@/types";
import { SCORE_WEIGHTS } from "@/lib/engine/config";
import { buildMockFeedCards } from "@/lib/mocks/feedCards";
import { mockPlaces } from "@/lib/mocks/places";
import { buildMockBusyBlocks } from "@/lib/mocks/schedules";
import { mockUsers } from "@/lib/mocks/users";
import { buildMockWeather } from "@/lib/mocks/weather";
import { formatSlot } from "@/lib/time";

describe("mock data matches contracts", () => {
  it("places", () => expect(() => z.array(Place).parse(mockPlaces)).not.toThrow());
  it("users", () => expect(() => z.array(User).parse(mockUsers)).not.toThrow());
  it("busy blocks", () => expect(() => z.array(BusyBlock).parse(buildMockBusyBlocks())).not.toThrow());
  it("weather", () => expect(() => z.array(HourlyWeather).parse(buildMockWeather())).not.toThrow());
  it("feed cards", () => expect(() => z.array(FeedCard).parse(buildMockFeedCards())).not.toThrow());
  it("place ids are unique", () => expect(new Set(mockPlaces.map((p) => p.id)).size).toBe(mockPlaces.length));
});

describe("engine config", () => {
  it("score weights sum to 1", () => {
    const sum = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
  });
});

describe("time helpers", () => {
  it("formats a slot in Montréal time", () => {
    // 2026-11-21 19:00Z = 14:00 EST (UTC-5)
    expect(formatSlot("2026-11-21T19:00:00.000Z", "2026-11-21T21:00:00.000Z")).toBe("Sat 2:00–4:00 PM");
    expect(formatSlot("2026-11-21T16:00:00.000Z", "2026-11-21T18:00:00.000Z")).toBe("Sat 11:00 AM–1:00 PM");
  });
});
