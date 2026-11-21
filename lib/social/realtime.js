/**
 * Live update signals, server side (PLAN.md S2). Owner: Mhammad.
 * After a plan write, tell the members' phones "plan X changed" over Supabase Broadcast (REST, no subscribe).
 * The signal carries NO plan data: phones refetch through the API, which checks membership.
 * Public channels on purpose: in demo mode the browser isn't a Supabase user. Polling stays as the backup,
 * so a failed signal never breaks anything: errors are logged, never thrown.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { PLAN_CHANGED, invitesChannel, planChannel } from "./channels";

const SEND_TIMEOUT_MS = 2000;

/** @type {ReturnType<typeof createAdminClient> | null} */
let client = null;

/**
 * @param {string} planId
 * @param {string[]} memberIds everyone in the plan (creator included)
 */
export async function notifyPlanChanged(planId, memberIds) {
  try {
    client ??= createAdminClient();
  } catch (e) {
    console.warn("[realtime] no Supabase config, skipping live update:", e instanceof Error ? e.message : e);
    return;
  }
  const db = client;
  const topics = [planChannel(planId), ...[...new Set(memberIds)].map(invitesChannel)];
  await Promise.allSettled(
    topics.map(async (topic) => {
      const channel = db.channel(topic);
      try {
        const res = await channel.httpSend(PLAN_CHANGED, { planId }, { timeout: SEND_TIMEOUT_MS });
        if (!res.success) console.warn(`[realtime] ${topic}: ${res.status} ${res.error}`);
      } catch (e) {
        console.warn(`[realtime] ${topic}:`, e instanceof Error ? e.message : e);
      } finally {
        await db.removeChannel(channel);
      }
    }),
  );
}
