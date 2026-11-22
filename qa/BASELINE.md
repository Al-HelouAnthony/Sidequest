# Baseline (tag `qa-baseline` = `main` `f1b8723`, Sun Nov 22 ~01:40)

| Check | Result |
|---|---|
| `npm run lint` | ✅ 0 problems (14 s) |
| `npm run build` | ✅ (14 s wall, "Compiled successfully in 2.2 s" with a warm Turbopack cache) |
| `npx vitest run` | ✅ 67 files, **616 tests** (11 s) |
| Typecheck | n/a: plain JavaScript project (team decision); Zod contracts + `tests/contracts.test.js` instead |

## Routes (from the build)
Static (○): `/`, `/feed`, `/friends`, `/login`, `/me`, `/memories`, `/onboarding`, `/plans`, `/plans/preview`.
Partial prerender (◐): `/plans/[id]`. Dynamic (ƒ): every `/api/*`, `/auth/callback`, `/auth/signout`. Proxy on every non-asset path.

## Client JS (`.next/static/chunks`)
22 chunks, **1,285 KB raw / 381 KB gzip** in total. Largest: 256 KB (67 KB gz), 224 KB (70 KB gz), 161 KB (44 KB gz), 130 KB, 110 KB.
(Next 16 no longer prints per-route "First Load JS" in the build table.)

## Images
`public/places/*.jpg`: 60 files, **18 MB** in total, largest 760 KB / 560 KB / 540 KB. Served as-is with `<img>` (not `next/image`), so phones download the full file.

## Real database (read-only snapshot, `qa/backup/_summary.json`)
users 9 · friendships 30 · places 61 · busy_blocks 145 · travel_times 540 · interactions 118 · user_tag_weights 75 · events 3,962 · plans 26 · plan_members 83 · plan_photos 1 · businesses 54,937 · storage `plan-photos` 1 folder.
