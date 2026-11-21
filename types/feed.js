/**
 * SHARED CONTRACT. What the feed engine produces and the frontend renders.
 * Producer: Anthony (lib/engine, /api/feed). Consumer: Oscar (components/feed).
 * Announce in the team chat before changing anything here.
 */
import { z } from "zod";
import { Category, Id, IsoDateTime, PriceLevel, TimeRange, WeatherIcon } from "./domain";

/** Every component is normalized to 0–1 BEFORE weighting. Weights live in lib/engine/config.js. */
export const ScoreBreakdown = z.object({
  interest: z.number().min(0).max(1),
  friends: z.number().min(0).max(1),
  timing: z.number().min(0).max(1),
  weather: z.number().min(0).max(1),
  fairness: z.number().min(0).max(1),
  novelty: z.number().min(0).max(1),
  proximity: z.number().min(0).max(1),
});
/** @typedef {z.infer<typeof ScoreBreakdown>} ScoreBreakdownT */

export const FeedFriend = z.object({
  id: Id,
  name: z.string(),
  avatarUrl: z.string(),
  travelMin: z.number().int().nonnegative(),
  /** true = haversine fallback. UI shows "~12 min". */
  travelIsEstimate: z.boolean(),
});
/** @typedef {z.infer<typeof FeedFriend>} FeedFriendT */

export const FeedCard = z.object({
  /** Stable for a given (place, slot): `${placeId}:${slot.start}`. React key + caption cache key. */
  id: z.string(),
  place: z.object({
    id: Id,
    name: z.string(),
    category: Category,
    photoUrl: z.string(),
    priceLevel: PriceLevel,
    lat: z.number(),
    lng: z.number(),
    address: z.string(),
    tags: z.array(z.string()),
  }),
  /** The suggested visit window (ISO UTC), already trimmed to the place's typical duration. */
  slot: z.object({ start: IsoDateTime, end: IsoDateTime }),
  /** The current user's own travel time to the place. */
  myTravelMin: z.number().int().nonnegative(),
  /** Friends free for the whole slot. Never includes the current user. */
  friends: z.array(FeedFriend),
  weather: z.object({
    icon: WeatherIcon,
    tempC: z.number(),
    rainProb: z.number().min(0).max(100),
  }),
  /** Weighted total, 0–1. */
  score: z.number(),
  breakdown: ScoreBreakdown,
  /** Claude-written one-liner, or the template fallback. Never empty. */
  caption: z.string().min(1),
});
/** @typedef {z.infer<typeof FeedCard>} FeedCardT */

/** Filters the engine accepts. Produced by URL params or by Claude NL search (/api/search). */
export const FeedFilters = z.object({
  /** Only cards where ALL these friends are free. */
  friendIds: z.array(Id).optional(),
  dateRange: TimeRange.optional(),
  priceMax: PriceLevel.optional(),
  categories: z.array(Category).optional(),
  indoorOnly: z.boolean().optional(),
});
/** @typedef {z.infer<typeof FeedFilters>} FeedFiltersT */
