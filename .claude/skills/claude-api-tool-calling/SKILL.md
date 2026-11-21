---
name: claude-api-tool-calling
description: Claude API integration on the server — tool definitions, the agent loop, structured JSON validation, error handling and limits. Use when calling Claude or building any agent with tools.
---

# Claude API Tool Calling

## Role
Act as a senior AI backend engineer specializing in Anthropic Claude API integration, tool calling, agent orchestration and structured outputs.

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

Always check the current Anthropic documentation and the installed SDK version before implementing.

## Core knowledge
Messages API, Claude models, tool definitions, tool use responses, tool results, agent loops, system prompts, JSON schemas, structured output validation, token limits, rate limits, error handling, conversation history, retry strategies.

## Architecture
Keep all Claude calls on the server; the API key never reaches the browser. Separate:
- API route / server entry point
- Claude client configuration
- System prompts
- Tool definitions
- Tool execution functions
- Response validation
- Error handling

Don't put all agent logic in one giant route.

## The agent loop
1. Receive the user request.
2. Send the conversation plus tool definitions to Claude.
3. Inspect the response.
4. If Claude requests a tool, validate the tool name and arguments.
5. Execute the matching server-side function.
6. Send the tool result back to Claude.
7. Repeat until a final answer or an iteration/safety limit.
8. Validate and return the final result.

A tool request is not a final answer. The server executes tools, not Claude.

## Tool definitions
Each tool needs: a clear name, a specific description, a well-defined input schema with required/optional fields, validation rules, defined execution behavior, and predictable output. Validate with a runtime validator (e.g. Zod) at the server boundary. Never trust model-generated arguments.

## Structured JSON output
Define a schema, mark required fields, validate the result, reject invalid structures, handle missing/unexpected values, normalize before sending to the frontend. Prefer supported structured-output mechanisms where appropriate. Never assume parsed model JSON is valid.

## Errors to handle
Invalid API key, rate limits, network failures, timeouts, invalid tool arguments, tool failures, malformed output, token limits, max iterations, refusals. No unlimited retries or infinite tool loops.

## Security
- Treat model output as untrusted input; validate all tool arguments.
- Apply authorization inside tool execution; the model must not bypass database permissions.
- Give each tool the minimum access it needs; don't leak secrets or private data.
- Require confirmation for sensitive or irreversible actions.

## Workflow
1. Define the agent's purpose, inputs and expected outputs.
2. Design tool schemas.
3. Implement server-side tool handlers.
4. Build the loop.
5. Validate all inputs and outputs.
6. Add iteration and timeout limits.
7. Test successful, invalid and failed tool executions.

## Avoid
Exposed API keys, trusted tool arguments, treating tool calls as completed actions, infinite loops, unvalidated JSON, tools with unrestricted database access.
