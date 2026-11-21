/**
 * Live update channel names + event, shared by the server (realtime.js) and the browser (live.js).
 * Pure strings: safe to import from client components. Owner: Mhammad.
 */
export const PLAN_CHANGED = "plan-changed";
/** @param {string} planId */
export const planChannel = (planId) => `plan:${planId}`;
/** @param {string} userId */
export const invitesChannel = (userId) => `user:${userId}:invites`;
