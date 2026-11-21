/**
 * SHARED CONTRACT. Request/response shapes for every route in app/api.
 * Route handlers MUST validate inputs with these schemas (lib/http.js → parseBody).
 * The frontend MAY parse responses with them (recommended in dev).
 * Identity always comes from the server session (lib/auth.js), never from a body.
 */
import { z } from "zod";
import { Closeness, Id, IsoDateTime, InteractionAction, Plan, Rsvp, User } from "./domain";
import { FeedCard, FeedFilters } from "./feed";

/** Every error response has this shape, with a matching HTTP status. */
export const ApiError = z.object({ error: z.string(), details: z.unknown().optional() });

// ---- GET /api/feed?cursor=<string>&filters=<url-encoded JSON of FeedFilters> ----
export const FeedResponse = z.object({
  cards: z.array(FeedCard),
  /**
   * Opaque: send it back as `cursor`. Format "pass:offset" (N3). null = end of feed, which only happens
   * for searches/filters; the main feed loops forever (pass ≥ 3, card ids end in ":p<pass>").
   */
  nextCursor: z.string().nullable(),
});

/**
 * N2 (variety) query params on GET /api/feed, as Oscar's components/feed/visit.js sends them:
 * seed = one random int per visit (same for every page), seen = comma-separated place ids from earlier visits.
 * Invalid/unknown ids in `seen` are ignored, never an error.
 */
export const FeedVisitParams = z.object({
  seed: z.coerce.number().int().min(0).max(2 ** 31 - 1).optional(),
  seen: z.array(z.string()).max(100).optional(),
});
/** @typedef {z.infer<typeof FeedVisitParams>} FeedVisitParamsT */
/** @typedef {z.infer<typeof FeedResponse>} FeedResponseT */

// ---- POST /api/interactions ----
export const InteractionRequest = z.object({
  placeId: Id,
  slotStart: IsoDateTime,
  action: InteractionAction,
});
export const InteractionResponse = z.object({ ok: z.literal(true) });

// ---- POST /api/search ----
export const SearchRequest = z.object({ query: z.string().min(1).max(300) });
export const SearchResponse = z.object({
  /** What Claude understood. Show it as chips so users can see/undo it. */
  filters: FeedFilters,
  /** Human-readable summary, e.g. "Cheap · with Maya · Sat night". */
  summary: z.string(),
  cards: z.array(FeedCard),
  nextCursor: z.string().nullable(),
});
/** @typedef {z.infer<typeof SearchResponse>} SearchResponseT */

// ---- Plans ----
/** What the plan screens render: the plan plus everything needed to display it. */
/** N4: "requested" once the organizer tapped "Mark as requested" in Book it. Missing = "none". */
export const BookingStatus = z.enum(["none", "requested"]);

export const PlanView = Plan.extend({
  bookingStatus: BookingStatus.optional(),
  place: z.object({
    id: Id,
    name: z.string(),
    category: z.string(),
    photoUrl: z.string(),
    address: z.string(),
    /** N1: false = registry restaurant, hours assumed → "call ahead". Missing = verified. */
    hoursVerified: z.boolean().optional(),
  }),
  members: z.array(
    z.object({
      userId: Id,
      name: z.string(),
      avatarUrl: z.string(),
      rsvp: Rsvp,
      isCreator: z.boolean(),
    }),
  ),
});
/** @typedef {z.infer<typeof PlanView>} PlanViewT */

// POST /api/plans
export const CreatePlanRequest = z.object({
  placeId: Id,
  start: IsoDateTime,
  end: IsoDateTime,
  inviteeIds: z.array(Id).min(1),
});
/** @typedef {z.infer<typeof CreatePlanRequest>} CreatePlanRequestT */

// POST /api/plans → 201, GET /api/plans/[id], POST /api/plans/[id]/rsvp
export const PlanResponse = z.object({ plan: PlanView });
// GET /api/plans
export const PlansResponse = z.object({ plans: z.array(PlanView) });
// POST /api/plans/[id]/rsvp
export const RsvpRequest = z.object({ rsvp: z.enum(["in", "out"]) });

// ---- N4 Book it: GET /api/plans/[id]/booking → BookingInfo; POST (no body) → PlanResponse ----
/**
 * How to book: "online" (booking page), "phone", "walk-in" (no reservation taken),
 * "tickets" (buy entry online), "none" (parks, viewpoints: nothing to book).
 */
export const BookingType = z.enum(["online", "phone", "walk-in", "tickets", "none"]);
export const BookingInfo = z.object({
  bookingType: BookingType,
  /** Members who said "in" (the organizer included). */
  partySize: z.number().int().positive(),
  /** Our hours say the place is open for the whole plan. With hoursVerified false, still "call ahead". */
  openDuring: z.boolean(),
  hoursVerified: z.boolean(),
  links: z.object({
    /** Always present: Google Maps search for the place (phone, hours, reserve button live there). */
    maps: z.string().url(),
    booking: z.string().url().optional(),
    website: z.string().url().optional(),
    /** E.164, e.g. "+15148451696" → tel: link. */
    phone: z.string().optional(),
  }),
  /** Ready-to-send reservation text, French and English. */
  message: z.object({ fr: z.string(), en: z.string() }),
  bookingStatus: BookingStatus,
});
/** @typedef {z.infer<typeof BookingInfo>} BookingInfoT */

// ---- Friends (GET/POST /api/friends) ----
export const FriendView = User.pick({ id: true, name: true, avatarUrl: true }).extend({
  closeness: Closeness,
});
/** @typedef {z.infer<typeof FriendView>} FriendViewT */
export const FriendsResponse = z.object({ friends: z.array(FriendView) });
export const AddFriendRequest = z.object({ friendId: Id, closeness: Closeness.default(2) });

// ---- GET /api/users (people I can add as friends: everyone except me) ----
export const UserListItem = User.pick({ id: true, name: true, avatarUrl: true }).extend({ isFriend: z.boolean() });
/** @typedef {z.infer<typeof UserListItem>} UserListItemT */
export const UsersResponse = z.object({ users: z.array(UserListItem) });
/** @typedef {z.infer<typeof UsersResponse>} UsersResponseT */

// ---- GET /api/me ----
export const MeResponse = z.object({ user: User });

// ---- PATCH /api/me (onboarding: neighbourhood + interests) → MeResponse ----
export const UpdateMeRequest = z.object({
  neighbourhoodId: z.string().optional(), // old picker (lib/neighbourhoods.js), kept until onboarding switches
  postalCode: z.string().max(10).optional(), // e.g. "H2T 1S6": only "H2T" is kept (lib/geo/postalCode.js)
  interests: z.array(z.string()).optional(), // tags from lib/interests.js (checked by updateProfile)
});
/** @typedef {z.infer<typeof UpdateMeRequest>} UpdateMeRequestT */

// ---- POST /api/friends { friendId } → { ok: true } ----
export const OkResponse = z.object({ ok: z.literal(true) });

// ---- POST /api/calendar/sync ----
export const CalendarSyncResponse = z.object({ imported: z.number().int().nonnegative() });
