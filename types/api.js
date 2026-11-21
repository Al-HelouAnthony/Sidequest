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
  /** null = end of feed. */
  nextCursor: z.string().nullable(),
});
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
export const PlanView = Plan.extend({
  place: z.object({
    id: Id,
    name: z.string(),
    category: z.string(),
    photoUrl: z.string(),
    address: z.string(),
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

// ---- Friends (GET/POST /api/friends) ----
export const FriendView = User.pick({ id: true, name: true, avatarUrl: true }).extend({
  closeness: Closeness,
});
/** @typedef {z.infer<typeof FriendView>} FriendViewT */
export const FriendsResponse = z.object({ friends: z.array(FriendView) });
export const AddFriendRequest = z.object({ friendId: Id, closeness: Closeness.default(2) });

// ---- GET /api/me ----
export const MeResponse = z.object({ user: User });

// ---- POST /api/calendar/sync ----
export const CalendarSyncResponse = z.object({ imported: z.number().int().nonnegative() });
