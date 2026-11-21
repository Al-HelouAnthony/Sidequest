---
name: claude-vision-verification
description: Photo verification with Claude vision — task-based criteria, confidence scores, approved/rejected/needs_review decisions, anti-cheat layers. Use when building quest photo checks.
---

# Claude Vision Verification

## Role
Act as a senior AI computer-vision engineer specializing in image-based verification, Claude vision integration, confidence evaluation and fraud-resistant workflows.

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

Check the current Claude model's image capabilities and API requirements before implementing. Pair with `claude-api-tool-calling` and `supabase-storage`.

## Purpose
Decide whether a submitted photo is enough evidence that the requested activity was completed. Reject weak, irrelevant, manipulated or suspicious submissions — don't approve everything.

## Core knowledge
Claude vision, image inputs, formats and size limits, visual-analysis prompting, structured JSON, evidence verification, confidence calibration, ambiguous images, upload security, verification workflows.

## Each verification request contains
Quest/task description, expected visual evidence, the submission, relevant context, verification criteria, required output schema. The model must compare the image to the task — not just describe it.

## Criteria
- **Relevance:** does the image relate to the task?
- **Visual evidence:** is the required object, place or activity visible?
- **Completeness:** is there enough evidence?
- **Consistency:** does anything contradict the task?
- **Authenticity indicators:** visible signs of editing, duplication or inconsistencies?

Visual inspection can't prove an image is original, current, or taken by the submitter. Treat those as separate checks.

## Confidence (0–1, starting thresholds — tune with labeled examples)
- 0.90–1.00: strong evidence
- 0.70–0.89: good, some uncertainty
- 0.40–0.69: ambiguous or incomplete
- 0.00–0.39: weak or irrelevant

These are not calibrated probabilities.

## Decisions
- `approved` — requirements satisfied
- `rejected` — clearly fails
- `needs_review` — ambiguous or insufficient

Never approve when a mandatory check fails, even with high confidence. Don't auto-reject real users for poor image quality or uncertain details.

## Output (validate against an app-defined schema; keep decision, checks and warnings consistent)
```json
{
  "decision": "approved",
  "confidence": 0.94,
  "reason": "The required object is clearly visible.",
  "checks": { "relevance": true, "visual_evidence": true, "completeness": true, "consistency": true },
  "warnings": []
}
```

## Anti-cheat layers
Watch for: repeated identical submissions, reused approved images, images that don't match the task, contradicting evidence, unrelated photos, suspicious metadata/timestamps.
Combine: AI visual check + duplicate-image detection + submission history + server-side task/user validation + review for suspicious cases.
Don't rely on EXIF alone (it can be missing or faked). Don't claim AI can definitively detect screenshots, edits or reused photos by looking.

## The vision prompt should
Explain the task, define required evidence and mandatory criteria, say what counts as insufficient, tell the model not to guess, require explicit uncertainty, require the exact output structure, and separate observations from conclusions.

## Security and fairness
Validate files and size limits, verify authorization, keep credentials server-side, send no unnecessary personal info, protect stored images, make no unsupported claims, provide a review path for ambiguous cases.

## Workflow
1. Receive the submission; validate type and size.
2. Load the correct task requirements; verify the user's authorization.
3. Send image + prompt to Claude.
4. Parse and validate the response; apply decision rules.
5. Save the result and update task status.
6. Send to human review when needed.

## Avoid
Auto-approving everything, treating confidence as accuracy, unsupported authenticity claims, AI-only fraud prevention, ignoring ambiguous results, letting users influence the criteria, exposing private image URLs or credentials.
