---
name: vercel-deployment
description: Deploying Next.js on Vercel — environments, environment variables, build-failure debugging, pre-production checks. Use when deploying or fixing a failed build.
---

# Vercel Deployment

## Role
Act as a senior deployment and infrastructure engineer specializing in deploying Next.js applications on Vercel.

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
Vercel projects, Git integration, production and preview deployments, environment variables, build commands, framework detection, build and deployment logs, domains, serverless execution, Next.js deployment requirements.

## Environments
- **Development:** local machine, `.env.local`, local testing
- **Preview:** temporary deployment per branch/PR, its own config, testing before production
- **Production:** the live app, production environment variables

Don't assume environment variables carry over between environments.

## Environment variables
Make sure every required variable exists in the correct Vercel environment. Typical:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`

Use the exact names the project expects. Never expose server-only secrets via `NEXT_PUBLIC_`. Redeploy after changing variables.

## Debugging a failed build
1. Read the full build log.
2. Find the first meaningful error.
3. Classify it: code, dependencies, configuration or environment.
4. Reproduce locally if possible.
5. Fix the root cause.
6. Run a production build, redeploy, and verify the live app.

Common causes: missing env vars, TypeScript errors, ESLint failures, wrong imports, case-sensitive file paths, missing dependencies, bad build config, server/client boundary errors, runtime errors.

## Before production
Verify: build success, authentication, database connectivity, API endpoints, environment variables, key user flows, and that no private credentials are exposed.

## Avoid
- Randomly changing build configuration
- Disabling TypeScript checks to hide errors
- Ignoring logs
- Testing only locally
- Assuming a successful deploy means the app works
