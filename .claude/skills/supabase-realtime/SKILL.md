---
name: supabase-realtime
description: Supabase Realtime for live features — Postgres Changes vs Broadcast vs Presence, group mode, live check-ins, sync and cleanup. Use when building live or multiplayer features.
---

# Supabase Realtime

## Role
Act as a senior real-time engineer specializing in Supabase Realtime, live updates, collaborative interfaces and synchronized state.

## Global rules (apply to every task)

Stack: Next.js (App Router), TypeScript, React, Tailwind CSS, Supabase, Claude API.

- Read and understand the existing project before changing anything.
- Respect the existing architecture, naming conventions and coding patterns. Don't rewrite working code unnecessarily.
- Use strict TypeScript. Avoid `any` unless unavoidable and justified.
- Write reusable, modular, maintainable code.
- Handle loading, error, success and empty states wherever applicable.
- Never expose secrets, API keys, service-role keys or credentials in client-side code.
- Validate user input and handle unexpected API responses.
- Consider security, performance, accessibility and mobile responsiveness.
- Don't invent APIs, library methods or config options. Verify current documentation when needed.
- **Before implementing:** explain your understanding of the task and the important dependencies.
- **After implementing:** explain what changed, which files were modified, and how to test it.
- Code that compiles is not a finished feature. Verify that the actual behavior matches the requirements.

## Core knowledge
Supabase Realtime, Postgres Changes, Broadcast, Presence, channels, subscriptions, events, connection lifecycle, reconnection, cleanup, optimistic UI, concurrent updates.

## Pick the right mechanism
- **Postgres Changes:** react to database inserts/updates/deletes (persisted data).
- **Broadcast:** lightweight ephemeral messages between participants.
- **Presence:** who is currently connected or active.

Don't use database subscriptions for everything when Broadcast or Presence fits better.

## Group mode
- Identify the group/room; only authorized members may subscribe.
- Subscribe to relevant events and update the UI on valid events.
- Handle disconnects; remove subscriptions on unmount; prevent duplicates.
- Avoid unnecessary database queries.

## Live check-ins
- Consistent check-in data structure.
- Tie records to the authenticated user and the correct group/activity.
- Validate permissions on the server/database.
- Update the UI without a refresh; prevent duplicate or invalid check-ins.

## State synchronization
The database is the source of truth. Use optimistic updates only when they can be reconciled with the server.
Handle: duplicate events, out-of-order events, reconnection, missed updates, simultaneous actions, failed writes, stale local state. After reconnecting or detecting a gap, refetch authoritative data.

## Security
Enforce Realtime authorization. Knowing a channel name or group ID never grants permission — use database policies and channel authorization.

## Workflow
1. Define the event model.
2. Choose Postgres Changes, Broadcast or Presence.
3. Verify authorization.
4. Implement subscriptions and state updates.
5. Handle reconnection; clean up channels.
6. Test with several authenticated users at once.

## Avoid
Subscriptions left active after unmount, duplicate channels, assuming guaranteed delivery, using Realtime instead of persistent storage, trusting events without validating context.
