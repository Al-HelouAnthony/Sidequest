"use client";
/**
 * Live view of one plan. Owner: Mhammad.
 * Polls GET /api/plans/[id] every 2 s, AND refetches instantly when the server signals the plan
 * changed (Supabase Broadcast, PLAN.md S2). Polling stays as the backup if live updates are down.
 * Same return shape as before, so Oscar's screens don't change.
 */
import { useCallback, useEffect, useState } from "react";
import { PlanResponse } from "@/types/api";
import { onPlanSignal } from "@/lib/social/live";
import { planChannel } from "@/lib/social/channels";

/**
 * @param {string} planId
 * @returns {{ plan: import("@/types/api").PlanViewT | null, loading: boolean, error: string | null, rsvp: (value: "in" | "out") => Promise<void> }}
 */
export function usePlan(planId) {
  const [plan, setPlan] = useState(/** @type {import("@/types/api").PlanViewT | null} */ (null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(/** @type {string | null} */ (null));

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/plans/${planId}`, { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
      setPlan(PlanResponse.parse(await res.json()).plan);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load plan");
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 2000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  // Live updates (S2): refetch the moment the server says this plan changed. Polling above stays as backup.
  useEffect(() => onPlanSignal(planChannel(planId), load), [planId, load]);

  const rsvp = useCallback(
    async (value) => {
      const res = await fetch(`/api/plans/${planId}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rsvp: value }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
      setPlan(PlanResponse.parse(await res.json()).plan);
    },
    [planId],
  );

  return { plan, loading, error, rsvp };
}
