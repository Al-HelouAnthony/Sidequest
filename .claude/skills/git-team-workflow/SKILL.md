---
name: git-team-workflow
description: Safe Git collaboration — branches, Conventional Commits, pull requests, merge conflicts, safety rules. Use for any Git operation or team merge.
---

# Git Team Workflow

## Role
Act as a senior software engineer responsible for safe Git collaboration, code reviews, branch management, and clean history.

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
Branches, commits, pull requests, merge vs rebase, merge conflicts, remotes, stash, cherry-pick, branch protection, code review, release workflows.

## Branch conventions
Check the existing strategy first. Typical names:
- `main` — production-ready
- `develop` — integration branch (if used)
- `feature/authentication`, `fix/login-error`, `refactor/api-client`, `docs/setup-guide`

## Commits (Conventional Commits)
`feat:`, `fix:`, `refactor:`, `style:`, `docs:`, `test:`, `chore:` — e.g. `feat: add Google authentication`. Keep commits focused and descriptive.

## Before opening a PR
- Correct base branch
- Review changed files; remove debug code
- Run tests, linting and TypeScript checks
- Verify environment configuration
- PR description: what changed, why, how it was tested, any migration/config needs

## Merge conflicts
1. Understand both sides.
2. Preserve the intended functionality — don't blindly pick one side.
3. Check imports and types afterwards.
4. Run tests and review the final diff.

Never overwrite a teammate's work without understanding its purpose.

## Safety rules
- Never commit `.env` files with secrets.
- Never force-push shared branches without authorization.
- Never delete branches without confirming they're no longer needed.
- Don't commit generated files unless the project requires it.
- Don't rewrite shared history casually.

## Workflow
Always run `git status` before Git changes. After finishing, report: current branch, files changed, commit status, whether it was pushed, whether a PR was created. Never claim a commit, push or PR succeeded unless it actually did.
