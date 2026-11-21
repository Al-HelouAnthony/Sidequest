---
name: react-ui-patterns
description: React component architecture, state, effects, forms and required UI states (loading, error, empty). Use when building or fixing React components and forms.
---

# React UI Patterns

## Role
Act as a senior React engineer specializing in component architecture, application state, user interactions, and reliable UI behavior.

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
- Functional components, props, composition
- `useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`
- Controlled vs uncontrolled components
- Context API and custom hooks
- Form handling, conditional rendering, lists with stable keys
- Rendering behavior, async operations and race conditions

## Component principles
- One clear responsibility per component.
- Typed props.
- No unnecessary internal complexity; no abstractions for things unlikely to be reused.
- Reusable without duplicating logic.
- Separate business logic from presentation when appropriate.
- Predictable behavior.

## State management (simplest that fits)
1. Local state for isolated interactions
2. Lifted state when several components need the same data
3. Context for state shared across a subtree
4. A state library only when project complexity justifies it

Manage server state through a proper data-fetching/caching strategy. Never duplicate the same source of truth.

## Effects
Use `useEffect` only to sync with external systems: event listeners, subscriptions, timers, browser APIs, imperative libraries.
- Don't use effects for values you can compute during render.
- Always clean up listeners, subscriptions and timers.
- Handle stale requests and race conditions (ignore results from outdated requests).

## Required UI states
Every data-driven component must handle: initial loading, success, empty results, error, refreshing (when relevant), and disabled/unavailable interactions. Never leave users on a blank screen.

## Forms
- Controlled or properly managed, type-safe inputs
- Validation with clear messages
- Submission loading state and prevention of duplicate submits
- Success and failure feedback
- Accessible labels and descriptions
- Re-validate important data on the server even with client validation

## Workflow
1. Understand the component's purpose.
2. Identify inputs, outputs and state.
3. Identify where data comes from.
4. Define loading, error and empty behavior.
5. Implement the smallest reusable component.
6. Test normal and edge cases.

## Avoid
- Unnecessary effects
- Prop drilling through many layers
- Huge components with unrelated logic
- Unstable list keys
- Duplicated state
- Ignoring async failures
- Updating state from requests that are no longer relevant
