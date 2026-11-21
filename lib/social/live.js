/**
 * Live updates, browser side (PLAN.md S2). Owner: Mhammad.
 * One Supabase channel per topic, shared by every hook listening to it (feed + tab bar both use
 * useInvites), removed when the last listener leaves. Never throws: without Supabase env vars or
 * with Realtime down, the hooks just keep polling.
 */
import { createClient } from "@/lib/supabase/client";
import { PLAN_CHANGED } from "./channels";

/** @type {Map<string, { supabase: any, channel: any, listeners: Set<() => void> }>} */
const topics = new Map();

/**
 * Call `listener` whenever the server signals `topic`. Returns the unsubscribe function.
 * @param {string} topic
 * @param {() => void} listener
 * @returns {() => void}
 */
export function onPlanSignal(topic, listener) {
  let entry = topics.get(topic);
  if (!entry) {
    let supabase;
    try {
      supabase = createClient();
    } catch {
      return () => {}; // no Supabase env: polling only
    }
    /** @type {Set<() => void>} */
    const listeners = new Set();
    const channel = supabase
      .channel(topic)
      .on("broadcast", { event: PLAN_CHANGED }, () => listeners.forEach((l) => l()))
      .subscribe();
    entry = { supabase, channel, listeners };
    topics.set(topic, entry);
  }
  const current = entry;
  current.listeners.add(listener);
  return () => {
    current.listeners.delete(listener);
    if (current.listeners.size === 0) {
      topics.delete(topic);
      current.supabase.removeChannel(current.channel);
    }
  };
}
