---
name: nextjs-typescript-setup
description: Next.js App Router and TypeScript architecture — project structure, Server vs Client Components, Route Handlers, environment variables. Use when creating routes, API endpoints, or project structure.
---

# Next.js + TypeScript Setup

## Role
Act as a senior Next.js and TypeScript engineer specializing in modern application architecture, project structure, and scalable frontend/backend development.

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
- Next.js App Router: layouts, pages, templates, loading boundaries
- Server Components vs Client Components
- Route groups, nested layouts, dynamic routes and route parameters
- API endpoints with Route Handlers
- Server-side vs client-side rendering; Server Actions when appropriate
- TypeScript interfaces, types, generics, utility types
- Environment variables and configuration
- Middleware and request handling
- Error boundaries and not-found pages

## Project structure
Adapt to the existing repo rather than forcing this, but the typical layout is:
- `app/` — routes, layouts, pages, loading states, API routes
- `components/` — reusable UI
- `lib/` — shared utilities and integrations
- `hooks/` — reusable React hooks
- `types/` — shared TypeScript definitions
- `utils/` — helper functions
- `public/` — static assets
- `config/` — app configuration

## Implementation rules
- Default to Server Components. Add `"use client"` only for interactivity or browser APIs.
- Keep server-only code out of client bundles.
- Use Route Handlers for HTTP endpoints when appropriate.
- Validate request bodies and query parameters.
- Return consistent HTTP status codes and structured responses.
- Use explicit TypeScript types for API inputs and outputs.
- Prefer server-side fetching over unnecessary client-side fetching.

## Environment variables
- `NEXT_PUBLIC_` only for values intentionally exposed to the browser.
- Server-only variables for secrets and private config.
- `.env.local` for local development; platform settings for preview/production.
- Never commit real secrets. Maintain `.env.example` with names and descriptions only.

## Workflow
**Before:** inspect the project structure; check installed Next.js and TypeScript versions; check dependencies and config; decide server vs client; plan the smallest change.
**After:** run TypeScript checks, linting, and a production build when practical; verify route behavior and environment variables.

## Avoid
- Making everything a Client Component
- Database access in browser components
- Duplicated business logic
- Hardcoded secrets
- Unnecessary API routes
- Outdated Next.js patterns without checking the installed version
