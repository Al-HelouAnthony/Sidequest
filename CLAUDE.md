# CLAUDE.md

Before doing anything in this repo, read the project context below in full. It is the single source of truth for scope, stack, schema, API and team split.

@PROJECT_CONTEXT.md

@PLAN.md

`PLAN.md` holds who owns what (Anthony, Mhammad, Adel, Oscar), the tasks with "done when" checks, and the timeline. Ask which teammate you're helping if it isn't clear.

This is Next.js 16. Its rules for agents:

@AGENTS.md

## Language: JavaScript, not TypeScript
The team chose plain JavaScript (`.js` / `.jsx`). This overrides the "TypeScript" lines in `.claude/skills/*`: follow everything else in the skills, but write JS.
- Never create `.ts` / `.tsx` files or a `tsconfig.json` (Next.js would switch the project back to TypeScript).
- The contracts are the Zod schemas in `types/`. Validate at every API boundary with them.
- Add JSDoc (`@param`, `@returns`, the `...T` typedefs from `types/`) on exported functions so the editor still helps.

## Working rules (short version, details in PROJECT_CONTEXT.md)
- Stay inside the folders owned by the person you are helping (see PLAN.md). Ask before editing shared files: `types/`, `supabase/migrations/`, `package.json`, `app/layout.jsx`.
- Code against the contracts in `types/` and the mocks in `lib/mocks/`. Never change a contract silently.
- Secrets stay server-side. Never commit `.env.local`.
- Run `npm run build` before saying something works.
- Use the matching skill in `.claude/skills/` for each task.

## Team sync points (PLAN.md §6.6), stop and tell the person every time
- **CHECK:** before building on a fact owned by a teammate, say who to ask and the exact question. Don't guess their answer.
- **APPROVE:** before merging a change to a contract (`types/*`), a shared file, or a product rule another person relies on, say who must 👍 it.
- **COMMIT + NOTIFY:** as soon as the person finishes something a teammate needs, tell them to commit + push + merge, and write the ready-to-paste notify message (template in PLAN.md §6.6) naming who must pull and what they should change.
- Anthony's per-part sync points are listed in `docs/engine-parts.md`. Follow that table when helping him.
- Commits: author is the teammate. **Never add a Claude `Co-Authored-By` line** (team decision).
