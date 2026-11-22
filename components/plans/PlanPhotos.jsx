"use client";
/**
 * G4 memory photos on the plan screen. Owner: Oscar. API: Mhammad (POST/GET /api/plans/[id]/photos).
 *  - Banner "📸 Take a memory photo" in the first 15 min of the plan and around halfway (±10 min); dismissible.
 *  - Camera (input capture="environment") → resized in the browser (longest side 1280 px, JPEG 0.8) → upload.
 *  - Shared album (signed URLs, members only), refreshed every 15 s while the plan is on.
 * Uploads open from 15 min before the start to 12 h after the end (the server enforces it too).
 * 404/405 = the photo API isn't live yet: the section stays hidden.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PlanPhotosResponse } from "@/types/api";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn, focusRing } from "@/components/ui/classes";
import { useNow } from "./useNow";

const MIN = 60_000;
const MAX_SIDE = 1280;

/** Resize to MAX_SIDE on the longest side, JPEG 0.8. @param {File} file @returns {Promise<Blob>} */
async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("resize failed"))), "image/jpeg", 0.8),
  );
}

/**
 * @param {{ planId: string, startAt: string, endAt: string, names: Record<string, string> }} props
 * `names`: userId → first name, for "by Maya".
 */
export function PlanPhotos({ planId, startAt, endAt, names }) {
  const now = useNow(30_000);
  const [photos, setPhotos] = useState(/** @type {import("@/types/api").PlanPhotosResponseT["photos"] | null} */ (null));
  const [live, setLive] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [dismissed, setDismissed] = useState(false);
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));

  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  const mid = start + (end - start) / 2;
  const canUpload = now !== null && now >= start - 15 * MIN && now <= end + 12 * 60 * MIN;
  const during = now !== null && now >= start - 15 * MIN && now <= end;
  const nudge =
    now !== null && !dismissed && ((now >= start && now <= start + 15 * MIN) || Math.abs(now - mid) <= 10 * MIN);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/plans/${encodeURIComponent(planId)}/photos`, { cache: "no-store" });
      if (res.status === 404 || res.status === 405) return setLive(false);
      if (!res.ok) throw new Error(`photos ${res.status}`);
      setPhotos(PlanPhotosResponse.parse(await res.json()).photos);
    } catch (e) {
      console.error("[photos] load", e);
    }
  }, [planId]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = during ? setInterval(load, 15_000) : undefined;
    return () => {
      clearTimeout(first);
      if (id) clearInterval(id);
    };
  }, [load, during]);

  /** @param {React.ChangeEvent<HTMLInputElement>} e */
  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("photo", await shrink(file), "memory.jpg");
      const res = await fetch(`/api/plans/${encodeURIComponent(planId)}/photos`, { method: "POST", body });
      if (res.status === 404 || res.status === 405) {
        setLive(false);
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Upload failed (${res.status})`);
      const parsed = PlanPhotosResponse.safeParse(json);
      if (parsed.success) setPhotos(parsed.data.photos);
      else await load();
      setDismissed(true);
    } catch (err) {
      console.error("[photos] upload", err);
      setError(err instanceof Error ? err.message : "Couldn't upload. Try again.");
    } finally {
      setUploading(false);
    }
  };

  if (!live) return null;
  if (!canUpload && (!photos || photos.length === 0)) return null;

  const camera = () => inputRef.current?.click();

  return (
    <section aria-labelledby="plan-photos" className="space-y-3">
      <input ref={inputRef} type="file" accept="image/*" capture="environment" aria-label="Take a memory photo" className="sr-only" tabIndex={-1} onChange={onPick} />

      {nudge && canUpload && (
        <div role="status" className="cel flex items-center gap-3 rounded-tile p-3 motion-safe:animate-toast-in">
          <span className="text-2xl" aria-hidden="true">
            📸
          </span>
          <p className="min-w-0 flex-1 font-bold">Take a memory photo</p>
          <Button onClick={camera} loading={uploading}>
            Open camera
          </Button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setDismissed(true)}
            className={cn("press inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface", focusRing)}
          >
            <Icon name="x" strokeWidth={2.6} className="size-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <h2 id="plan-photos" className="halo font-display text-xl font-extrabold">
          Memories
        </h2>
        {canUpload && !nudge && (
          <Button onClick={camera} loading={uploading} leadingIcon={<Icon name="plus" strokeWidth={2.5} className="size-4" />}>
            Add a photo
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {photos && photos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <li key={p.id}>
              <a href={p.url} target="_blank" rel="noopener noreferrer" className={cn("block rounded-tile", focusRing)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs */}
                <img
                  src={p.url}
                  alt={`Memory by ${names[p.userId] ?? "a friend"}`}
                  className="aspect-square w-full rounded-tile border-2 border-line bg-raised object-cover"
                  loading="lazy"
                />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="halo text-sm text-ink-muted">No photos yet. They show up here for everyone in the plan.</p>
      )}
      {photos && photos.length > 0 && (
        <Link href="/memories" className={cn("halo inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-2", focusRing)}>
          All your memories
        </Link>
      )}
    </section>
  );
}
