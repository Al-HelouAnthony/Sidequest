/**
 * G4 memory photos. Owner: Mhammad. Used by Oscar's plan screen (PlanPhotos.jsx).
 * GET  /api/plans/[id]/photos                     → PlanPhotosResponse { photos: [{ id, userId, url, createdAt }] }
 * POST /api/plans/[id]/photos (multipart "photo") → 201 PlanPhotosResponse (the whole album)
 * Members only (403), album open from 15 min before the start to 12 h after the end (409),
 * JPEG/PNG/WebP (415), ≤ 5 MB (413). Never 404 for a normal case (Oscar's UI reads 404/405 as "not live").
 */
import { getSessionUserId } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { PlanError } from "@/lib/social/plans-store";
import { addPhoto, listPhotos, MAX_PHOTO_BYTES } from "@/lib/social/photos";

/** @param {unknown} e */
function toResponse(e) {
  if (e instanceof PlanError) return jsonError(e.status, e.message);
  throw e;
}

/** @param {Request} _request @param {{ params: Promise<{ id: string }> }} ctx */
export async function GET(_request, { params }) {
  const userId = await getSessionUserId();
  const { id } = await params;
  try {
    return Response.json({ photos: await listPhotos(userId, id) });
  } catch (e) {
    return toResponse(e);
  }
}

/** @param {Request} request @param {{ params: Promise<{ id: string }> }} ctx */
export async function POST(request, { params }) {
  const userId = await getSessionUserId();
  const { id } = await params;
  // Cheap early stop for huge uploads (the real check is on the bytes).
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_PHOTO_BYTES + 64 * 1024) return jsonError(413, "Photos must be 5 MB or less");
  let form;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, 'Send the picture as a form field called "photo"');
  }
  try {
    return Response.json({ photos: await addPhoto(userId, id, form.get("photo")) }, { status: 201 });
  } catch (e) {
    return toResponse(e);
  }
}
