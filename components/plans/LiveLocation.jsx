"use client";
/**
 * G5 live location on the plan screen. Owner: Oscar. API: Mhammad (POST …/location, GET …/locations).
 * Only from 30 min before the start to 30 min after. Opt-in: "Share my location until we meet" starts
 * navigator.geolocation.watchPosition (only while the app is open) and posts at most every 15 s; it stops on
 * "Stop sharing", when the window ends, or when the screen closes. Everyone sees status + ETA per member,
 * never coordinates (the API only returns status / distance / ETA). 404/405 = API not live yet: hidden.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { PlanLocationsResponse } from "@/types/api";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useNow } from "./useNow";

const MIN = 60_000;
const SEND_EVERY_MS = 15_000;

/** @type {Record<string, string>} */
const STATUS_TEXT = { arrived: "Arrived", late: "Running late", "not-sharing": "Not sharing" };

/** @param {{ status: string, etaMin?: number, distanceM?: number }} m */
function describe(m) {
  if (m.status === "arrived" || m.status === "not-sharing") return STATUS_TEXT[m.status];
  const eta = m.etaMin != null ? `${m.etaMin} min away` : m.distanceM != null ? `${(m.distanceM / 1000).toFixed(1)} km away` : "On the way";
  return m.status === "late" ? `${STATUS_TEXT.late} · ${eta}` : eta;
}

/**
 * @param {{ planId: string, startAt: string, meId: string | null, names: Record<string, string> }} props
 */
export function LiveLocation({ planId, startAt, meId, names }) {
  const now = useNow(15_000);
  const start = Date.parse(startAt);
  const open = now !== null && now >= start - 30 * MIN && now <= start + 30 * MIN;

  const [sharing, setSharing] = useState(false);
  const [live, setLive] = useState(true);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [members, setMembers] = useState(/** @type {import("@/types/api").PlanLocationsResponseT["members"]} */ ([]));
  const lastSent = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/plans/${encodeURIComponent(planId)}/locations`, { cache: "no-store" });
      if (res.status === 404 || res.status === 405) return setLive(false);
      if (!res.ok) throw new Error(`locations ${res.status}`);
      setMembers(PlanLocationsResponse.parse(await res.json()).members);
    } catch (e) {
      console.error("[location] load", e);
    }
  }, [planId]);

  // Everyone's status, every 5 s while the window is open.
  useEffect(() => {
    if (!open) return;
    const first = setTimeout(load, 0);
    const id = setInterval(load, 5_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [open, load]);

  // My position, only while sharing and inside the window.
  useEffect(() => {
    if (!sharing || !open) return;
    if (!("geolocation" in navigator)) {
      const t = setTimeout(() => {
        setError("This browser can't share its location.");
        setSharing(false);
      }, 0);
      return () => clearTimeout(t);
    }
    const watch = navigator.geolocation.watchPosition(
      async (pos) => {
        const t = Date.now();
        if (t - lastSent.current < SEND_EVERY_MS) return;
        lastSent.current = t;
        try {
          const res = await fetch(`/api/plans/${encodeURIComponent(planId)}/location`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: Math.round(pos.coords.accuracy) }),
          });
          if (res.status === 404 || res.status === 405) setLive(false);
          else if (res.ok) load();
        } catch (e) {
          console.error("[location] send", e);
        }
      },
      (err) => {
        setError(err.code === err.PERMISSION_DENIED ? "Location is blocked. Allow it in your browser settings to share." : "Couldn't get your location.");
        setSharing(false);
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [sharing, open, planId, load]);

  if (!live || !open) return null;

  return (
    <section aria-labelledby="plan-location" className="cel space-y-3 rounded-tile p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="plan-location" className="font-display text-xl font-extrabold">
          On the way
        </h2>
        <Icon name="walk" strokeWidth={1.9} className="size-5" />
      </div>
      <ul className="space-y-1.5" aria-live="polite">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-3 text-sm">
            <span className="font-bold">{m.userId === meId ? "You" : (names[m.userId] ?? "Friend")}</span>
            <span className={m.status === "late" ? "font-semibold text-danger" : m.status === "arrived" ? "font-semibold" : "text-ink-muted"}>
              {describe(m)}
            </span>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <Button variant="secondary" fullWidth onClick={() => { setError(null); setSharing((s) => !s); }}>
        {sharing ? "Stop sharing my location" : "Share my location until we meet"}
      </Button>
      <p className="text-caption text-ink-muted">Friends in this plan see your ETA, never your exact position. Stops 30 min after the start.</p>
    </section>
  );
}
