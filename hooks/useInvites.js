"use client";
/**
 * Pending invites for the signed-in user (PLAN.md F7). Owner: Oscar.
 * TODAY: polls GET /api/plans every 3 s (works with the in-memory plan store).
 * Mhammad may swap the polling for Supabase Realtime (S2): keep the return shape { invites, dismiss }
 * so components/plans/InviteBanner.jsx and the feed don't change.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlansResponse } from "@/types/api";
import { useMeId } from "@/components/plans/useMeId";

/** Invites the user closed, remembered for this browser tab session. */
const DISMISSED_KEY = "sidequest:dismissed-invites";

/** @returns {Set<string>} */
function readDismissed() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(DISMISSED_KEY) ?? "[]"));
  } catch {
    return new Set(); // SSR, private mode, or bad JSON
  }
}

/**
 * @param {number} [intervalMs]
 * @returns {{ invites: import("@/types/api").PlanViewT[], dismiss: (planId: string) => void }}
 * `invites`: plans where I'm an invitee who hasn't answered yet, newest first, minus dismissed ones.
 */
export function useInvites(intervalMs = 3000) {
  const meId = useMeId();
  const [plans, setPlans] = useState(/** @type {import("@/types/api").PlanViewT[]} */ ([]));
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.hidden) return; // no polling in a background tab
      try {
        const res = await fetch("/api/plans", { cache: "no-store" });
        if (!res.ok) return;
        const data = PlansResponse.parse(await res.json());
        if (alive) setPlans(data.plans);
      } catch (e) {
        console.warn("[invites] poll failed", e);
      }
    };
    const first = setTimeout(load, 0);
    const timer = setInterval(load, intervalMs);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [intervalMs]);

  const invites = useMemo(() => {
    if (!meId) return [];
    return plans
      .filter(
        (p) =>
          p.status !== "cancelled" &&
          !dismissed.has(p.id) &&
          p.members.some((m) => m.userId === meId && !m.isCreator && m.rsvp === "invited"),
      )
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [plans, meId, dismissed]);

  const dismiss = useCallback((/** @type {string} */ planId) => {
    setDismissed((s) => new Set(s).add(planId));
  }, []);

  // Persist dismissals (outside the state updater, which must stay pure).
  useEffect(() => {
    try {
      sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed]));
    } catch {
      // Storage blocked: dismissals just won't survive a reload.
    }
  }, [dismissed]);

  return { invites, dismiss };
}
