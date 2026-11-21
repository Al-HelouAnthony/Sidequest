---
name: agent-quest-planner
description: Sidequest's AI quest-planning agent — system prompt, tools, multi-stop feasible plans from verified data, structured output and replanning. Use when building or changing the quest planner.
---

# Agent Quest Planner

## Role
Act as a senior AI agent architect specializing in quest planning, multi-stop itineraries, constraint-based planning, tool orchestration and dynamic replanning.

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

Pair this with the `claude-api-tool-calling` skill for the agent loop itself.

## Purpose
Turn a user's request into a structured, feasible, multi-stop quest plan. The plan must respect real constraints and verified information — not just look attractive.

## Responsibilities
Understand the goal → extract requirements and constraints → ask for missing essential info → discover candidate stops via tools → evaluate them → build an ordered plan within time and distance limits → return structured results → replan when things change.

## System prompt must define
Identity, objective, available tools and when to use each, what must be verified, constraints that can never be violated, required output structure, replanning behavior, failure behavior. It must separate verified facts, assumptions and suggestions.

## Tools (one responsibility each)
- **Location discovery:** find candidates with structured metadata.
- **Place verification:** confirm a place exists and its details; reject unverified ones.
- **Route calculation:** real distances and travel times from a trusted routing service, for the chosen travel mode.
- **Quest generation:** turn verified locations into stops with objectives and instructions.
- **Quest validation:** check constraints, stop order, impossible schedules, missing info.
- **Quest update:** modify an existing quest with new information.

Only use tools that are actually implemented. Never pretend a tool exists or ran.

## Multi-stop planning
Consider: start location, destination preferences, number of stops, travel mode, total time, opening hours, distance, activity duration, user and group constraints, feasibility.

Each stop has: unique ID, name, address or coordinates, description, objective, estimated duration, order, relevant constraints, verification status.

Never invent locations, addresses, opening hours or travel times.

## Planning rules
Prefer feasible over complicated routes; no duplicate stops; no impossible schedules; respect explicit constraints; flag uncertain info; reject stops that fail mandatory requirements; keep plans clear and actionable. Only ask for missing info that materially changes the plan.

## Replanning
1. Identify what changed.
2. Keep unaffected constraints.
3. Find affected stops and evaluate alternatives.
4. Recalculate routes if needed; revalidate time and feasibility.
5. Return the updated plan and explain important changes.

Don't regenerate the whole plan for a small change.

## Output (conceptual — define the real schema in TypeScript + runtime validator)
```json
{
  "title": "Quest title",
  "summary": "Short plan description",
  "status": "ready",
  "stops": [
    { "id": "stop_1", "name": "Verified location", "objective": "Complete the activity",
      "address": "Verified address", "duration_minutes": 20, "order": 1 }
  ],
  "total_duration_minutes": 90,
  "warnings": []
}
```

## When no valid plan exists
Explain which constraint can't be met, what info is missing, and offer a feasible alternative. Never fabricate results to look complete.

## Avoid
Hallucinated locations, invented distances, ignored opening hours, impossible itineraries, duplicate stops, lost constraints during replanning, treating model estimates as verified routing data.
