/**
 * SHARED CONTRACT. Domain entities, as Zod schemas.
 * The schemas ARE the contract: validate with them at every API boundary.
 * The @typedef lines give VS Code autocomplete/hover in plain JavaScript.
 * Owner: whole team. Announce in the team chat before changing anything here.
 *
 * Conventions:
 *  - All timestamps are ISO 8601 strings in UTC ("2026-11-21T19:00:00.000Z").
 *    Convert to America/Toronto only for display / slot logic (see lib/time.js).
 *  - IDs are UUIDs.
 *  - camelCase in JS. The DB uses snake_case; lib/data maps between them.
 */
import { z } from "zod";

export const TIMEZONE = "America/Toronto";

export const IsoDateTime = z.iso.datetime({ offset: true });
export const Id = z.uuid();

export const Category = z.enum(["cafe", "restaurant", "bar", "park", "viewpoint", "activity", "event"]);
/** @typedef {z.infer<typeof Category>} CategoryT */

export const Weekday = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
/** @typedef {z.infer<typeof Weekday>} WeekdayT */

/** "HH:mm", 24h, local Montréal time. close < open means it closes after midnight. */
export const HHmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const OpeningInterval = z.object({ open: HHmm, close: HHmm });

/** Missing weekday = closed that day. Multiple intervals allowed (lunch + dinner). */
export const OpeningHours = z.partialRecord(Weekday, z.array(OpeningInterval));
/** @typedef {z.infer<typeof OpeningHours>} OpeningHoursT */

export const PriceLevel = z.number().int().min(1).max(4);

export const Place = z.object({
  id: Id,
  name: z.string().min(1),
  category: Category,
  tags: z.array(z.string()),
  lat: z.number(),
  lng: z.number(),
  address: z.string(),
  priceLevel: PriceLevel,
  photoUrl: z.string(),
  hours: OpeningHours,
  typicalDurationMin: z.number().int().positive(),
  indoor: z.boolean(),
  /**
   * Where the place comes from. Missing = "curated" (data/places.json). "registry" = city health registry.
   * "event" = a Montréal open-data event (category "event"; its `hours` are only the event's own window).
   */
  source: z.enum(["curated", "registry", "event"]).optional(),
  /** N1: false = opening hours are ASSUMED (registry places, 11:30–22:00). Missing = verified. */
  hoursVerified: z.boolean().optional(),
  /** Events: exact start (ISO), e.g. 19:15 when the slot shows 19:00–21:30 (slots snap to 30 min). */
  startsAt: IsoDateTime.optional(),
  /** Events: the event's page (montreal.ca), used for "Buy tickets" / details. */
  eventUrl: z.string().url().optional(),
});
/** @typedef {z.infer<typeof Place>} PlaceT */

export const User = z.object({
  id: Id,
  name: z.string(),
  avatarUrl: z.string(),
  homeLat: z.number(),
  homeLng: z.number(),
  interests: z.array(z.string()),
});
/** @typedef {z.infer<typeof User>} UserT */

export const Closeness = z.number().int().min(1).max(3);

export const Friendship = z.object({ userId: Id, friendId: Id, closeness: Closeness });
/** @typedef {z.infer<typeof Friendship>} FriendshipT */

export const BusySource = z.enum(["google", "manual", "seed"]);

export const BusyBlock = z.object({
  id: Id.optional(),
  userId: Id,
  startAt: IsoDateTime,
  endAt: IsoDateTime,
  source: BusySource,
});
/** @typedef {z.infer<typeof BusyBlock>} BusyBlockT */

/** OpenRouteService profile names. Note: ORS has no public-transit profile. */
export const TravelMode = z.enum(["foot-walking", "cycling-regular", "driving-car"]);

export const TravelTime = z.object({
  userId: Id,
  placeId: Id,
  minutes: z.number().int().nonnegative(),
  mode: TravelMode,
  /** true = haversine fallback, not a real route. Show "~" in the UI. */
  isEstimate: z.boolean(),
});
/** @typedef {z.infer<typeof TravelTime>} TravelTimeT */

export const WeatherIcon = z.enum(["sun", "partly", "cloud", "rain", "snow", "storm", "fog"]);

export const HourlyWeather = z.object({
  /** Start of the hour, ISO UTC. */
  time: IsoDateTime,
  tempC: z.number(),
  /** 0–100 (Open-Meteo precipitation_probability). */
  rainProb: z.number().min(0).max(100),
  /** WMO weather code from Open-Meteo. */
  weatherCode: z.number().int(),
  icon: WeatherIcon,
});
/** @typedef {z.infer<typeof HourlyWeather>} HourlyWeatherT */

export const InteractionAction = z.enum(["skip", "save", "go"]);

export const Interaction = z.object({
  id: Id.optional(),
  userId: Id,
  placeId: Id,
  slotStart: IsoDateTime,
  action: InteractionAction,
  createdAt: IsoDateTime,
});
/** @typedef {z.infer<typeof Interaction>} InteractionT */

/** tag -> learned weight. Missing tag = 0. Clamped to [-1, 1] by lib/engine/learning.js. */
export const TagWeights = z.record(z.string(), z.number());
/** @typedef {z.infer<typeof TagWeights>} TagWeightsT */

export const PlanStatus = z.enum(["pending", "confirmed", "cancelled"]);
export const Rsvp = z.enum(["invited", "in", "out"]);

export const PlanMember = z.object({ planId: Id, userId: Id, rsvp: Rsvp });
/** @typedef {z.infer<typeof PlanMember>} PlanMemberT */

export const Plan = z.object({
  id: Id,
  creatorId: Id,
  placeId: Id,
  startAt: IsoDateTime,
  endAt: IsoDateTime,
  status: PlanStatus,
  createdAt: IsoDateTime,
});
/** @typedef {z.infer<typeof Plan>} PlanT */

export const TimeRange = z.object({ start: IsoDateTime, end: IsoDateTime });
/** @typedef {z.infer<typeof TimeRange>} TimeRangeT */
