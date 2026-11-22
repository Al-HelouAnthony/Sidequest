/**
 * G4: shared memory photos for a plan. Owner: Mhammad. Used by app/api/plans/[id]/photos/route.js.
 *
 * Rules (PLAN.md §13.2 + privacy): plan members only; open from 15 min before the start to 12 h after
 * the end; JPEG / PNG / WebP only (checked from the file's bytes, not its name); ≤ 5 MB.
 * USE_MOCK_DATA=true: kept in memory, shown as data: URLs. USE_MOCK_DATA=false: private Supabase
 * bucket `plan-photos/{planId}/{uuid}.{ext}` + a `plan_photos` row (Adel's migration 0007); members get
 * signed URLs valid 1 h. Members' screens update live (data-free plan signal).
 * memoriesOf(): all my plans' photos at once, for the Memories screen (GET /api/memories).
 */
import { randomUUID } from "node:crypto";
import { USE_MOCK_DATA } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlanError, listPlans, loadPlanForMember } from "./plans-store";
import { notifyPlanChanged } from "./realtime";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const OPENS_BEFORE_MS = 15 * 60_000;
const CLOSES_AFTER_MS = 12 * 3600_000;
const SIGNED_URL_SECONDS = 3600;
const BUCKET = "plan-photos";
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** @typedef {{ id: string, userId: string, url: string, createdAt: string }} PhotoView */

/**
 * The real image type from the first bytes (never trust the file name or the browser's label).
 * @param {Uint8Array} b
 * @returns {"image/jpeg" | "image/png" | "image/webp" | null}
 */
export function sniffImageType(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "image/png";
  const ascii = (/** @type {number} */ from, /** @type {number} */ to) => String.fromCharCode(...b.slice(from, to));
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

/** @type {{ id: string, planId: string, userId: string, mime: string, base64: string, createdAt: string }[]} */
const mem = (globalThis.__sqPhotos ??= []);

/** @type {ReturnType<typeof createAdminClient> | null} */
let client = null;
const db = () => (client ??= createAdminClient());

/**
 * Missing table/bucket (migration 0007 not applied) or Supabase down → clear 503, real error in the log.
 * @param {string} op @param {{ message: string } | null | undefined} error
 */
function failIf(op, error) {
  if (!error) return;
  console.error(`[photos] ${op} failed: ${error.message}`);
  throw new PlanError("Photos aren't available right now. Try again.", 503);
}

/**
 * Members' photos for several plans, oldest first per plan, with URLs they can open (signed 1 h on
 * Supabase). One query + one signing call however many plans (the Memories screen asks for all of mine).
 * @param {string[]} planIds
 * @returns {Promise<Map<string, PhotoView[]>>} planId → photos (plans without photos are missing)
 */
async function photosOfPlans(planIds) {
  /** @type {Map<string, PhotoView[]>} */
  const byPlan = new Map();
  const add = (/** @type {string} */ planId, /** @type {PhotoView} */ photo) => {
    const list = byPlan.get(planId);
    if (list) list.push(photo);
    else byPlan.set(planId, [photo]);
  };
  if (planIds.length === 0) return byPlan;
  if (USE_MOCK_DATA) {
    const wanted = new Set(planIds);
    for (const p of mem) {
      if (wanted.has(p.planId)) add(p.planId, { id: p.id, userId: p.userId, url: `data:${p.mime};base64,${p.base64}`, createdAt: p.createdAt });
    }
    return byPlan;
  }
  const { data: rows, error } = await db()
    .from("plan_photos")
    .select("id, plan_id, user_id, path, created_at")
    .in("plan_id", planIds)
    .order("created_at");
  failIf("plan_photos.select", error);
  if (!rows?.length) return byPlan;
  const signed = await db().storage.from(BUCKET).createSignedUrls(rows.map((r) => r.path), SIGNED_URL_SECONDS);
  failIf("storage.createSignedUrls", signed.error);
  const urlByPath = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));
  for (const r of rows) {
    const url = urlByPath.get(r.path);
    if (url) add(r.plan_id, { id: r.id, userId: r.user_id, url, createdAt: new Date(r.created_at).toISOString() });
  }
  return byPlan;
}

/** @param {string} planId @returns {Promise<PhotoView[]>} */
async function photosOf(planId) {
  return (await photosOfPlans([planId])).get(planId) ?? [];
}

/**
 * GET /api/memories: every photo from every plan I'm a member of, one entry per plan, newest plan first.
 * Only plans that have photos. `people` = who went ("in") plus anyone who added a photo.
 * Same access rule as the album: members only (it only looks at my own plans).
 * @param {string} userId from getSessionUserId()
 * @returns {Promise<import("@/types/api").MemoriesResponseT["memories"]>}
 */
export async function memoriesOf(userId) {
  const plans = await listPlans(userId);
  const byPlan = await photosOfPlans(plans.map((p) => p.id));
  return plans
    .filter((p) => byPlan.has(p.id))
    .sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt))
    .map((p) => {
      const photos = byPlan.get(p.id) ?? [];
      const uploaders = new Set(photos.map((ph) => ph.userId));
      return {
        planId: p.id,
        startAt: p.startAt,
        endAt: p.endAt,
        place: { id: p.place.id, name: p.place.name, category: p.place.category, photoUrl: p.place.photoUrl },
        people: p.members
          .filter((m) => m.rsvp === "in" || uploaders.has(m.userId))
          .map((m) => ({ userId: m.userId, name: m.name, avatarUrl: m.avatarUrl })),
        photos,
      };
    });
}

/**
 * GET: the album (members only).
 * @param {string} userId from getSessionUserId()
 * @param {string} planId
 */
export async function listPhotos(userId, planId) {
  await loadPlanForMember(userId, planId); // 404 / 403
  return photosOf(planId);
}

/**
 * POST: add one photo. Returns the whole album (what Oscar's screen shows next).
 * @param {string} userId from getSessionUserId()
 * @param {string} planId
 * @param {unknown} file the multipart "photo" field
 * @param {number} [now] for tests
 */
export async function addPhoto(userId, planId, file, now = Date.now()) {
  const { plan, members } = await loadPlanForMember(userId, planId); // 404 / 403
  if (plan.status === "cancelled") throw new PlanError("This plan was cancelled", 409);
  if (now < Date.parse(plan.startAt) - OPENS_BEFORE_MS) throw new PlanError("Photos open 15 minutes before the plan", 409);
  if (now > Date.parse(plan.endAt) + CLOSES_AFTER_MS) throw new PlanError("This plan's album is closed", 409);
  if (!file || typeof file !== "object" || typeof (/** @type {any} */ (file).arrayBuffer) !== "function") {
    throw new PlanError('Send the picture as a form field called "photo"', 400);
  }
  const blob = /** @type {Blob} */ (file);
  if (blob.size > MAX_PHOTO_BYTES) throw new PlanError("Photos must be 5 MB or less", 413);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length > MAX_PHOTO_BYTES) throw new PlanError("Photos must be 5 MB or less", 413);
  const mime = sniffImageType(bytes);
  if (!mime) throw new PlanError("Only JPEG, PNG or WebP pictures", 415);

  const id = randomUUID();
  const createdAt = new Date(now).toISOString();
  if (USE_MOCK_DATA) {
    mem.push({ id, planId, userId, mime, base64: Buffer.from(bytes).toString("base64"), createdAt });
  } else {
    const path = `${planId}/${id}.${EXT[mime]}`;
    const up = await db().storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
    failIf("storage.upload", up.error);
    const { error } = await db().from("plan_photos").insert({ id, plan_id: planId, user_id: userId, path, created_at: createdAt });
    if (error) {
      await db().storage.from(BUCKET).remove([path]); // no orphan file without its row
      failIf("plan_photos.insert", error);
    }
    await notifyPlanChanged(planId, members.map((m) => m.userId)); // others' albums refetch live
  }
  return photosOf(planId);
}
