# Subcontractor Compliance Tracker

A working prototype built for Tough Leaf's ClearComply take-home assessment (Section 4: Build Challenge).

**Live demo:** https://ds4wgujh68dua.cloudfront.net
**API base URL:** https://8lr32bnqsc.execute-api.ca-west-1.amazonaws.com/prod
**Loom walkthrough:** _add link here after recording_

## What this is

A compliance manager needs to track whether subcontractors have submitted four required documents — Insurance Certificate (COI), W-9, Certified Payroll Report, and Monthly Workforce Report — across multiple active construction projects. Today that's tracked manually in spreadsheets and email.

This prototype lets a compliance manager:

- **View subcontractors** — dashboard grouped by project, plus an onboarding-only view for subs not yet assigned to a project
- **View document requirements** — the four documents, their phase (onboarding vs. project-in-progress), and their cadence
- **See document status** — red/yellow/green, computed live from stored facts, never stored as a stale field
- **Identify missing documents** — a single cross-project queue, sorted by urgency
- **Take action on missing items** — send a reminder on demand (real email, not a mock), withhold/release payment, suspend/reinstate

The underlying workflow design (reminder cadences, escalation logic, and — most importantly — the rule that AI never executes a financial or contractual consequence on its own) comes from the reasoning in Sections 1–3 of this same take-home (see `career/output/tough-leaf/take-home-answers.md` in the candidate's working repo, not included here). This repo is the technical build that makes that design real and demoable.

## Architecture

- **Frontend:** React + TypeScript + Vite + Tailwind, hosted on S3 + CloudFront
- **Backend:** Node.js + TypeScript on AWS Lambda (Serverless Framework v3), one service (`services/compliance`), API Gateway REST
- **Database:** DynamoDB, single-table design (`compliance-tracker-prod`), 2 GSIs
- **Email:** real AWS SES send (not a mock) — see "AI usage & scope decisions" below
- **Auth:** intentionally none — see below

```
frontend/               React SPA
services/compliance/    Lambda handlers, one file per route
packages/shared/        Domain types, DynamoDB client, cascade/status engines, SES wrapper
infrastructure/         S3 + CloudFront (serverless.yml)
scripts/                seed.mjs (base data), seed-scenarios.mjs (historic scenario data)
```

### Data model

Two co-location strategies driven by the two real read patterns:

- `SUB#<subId>` partition — a subcontractor's global profile, COI/W-9 history, and onboarding action log (one `Query`)
- `PROJECT#<projectId>` partition — every subcontractor assigned to a project, their recurring-document history, and project-level action log (one `Query`)

Two GSIs cover the remaining access patterns: listing all subs/projects, and finding which projects a given sub is on (powers the "recurring sub" shortcut). The one cross-cutting pattern — "everything missing across the whole system" — has no dedicated index; at this demo's scale it queries both GSI1 lists then each project partition and merges in-Lambda, the same accepted tradeoff documented for a similar endpoint in an earlier project of mine.

Status color is **always computed on read**, never stored — storing it would drift the moment a day passes without a write.

### The core design decision this build is built around

AI detects, tracks, reminds, and flags. **It never withholds payment or suspends a subcontractor on its own** — both are explicit human actions in the UI, gated behind a confirm step and a named actor. A sub can cross a suspend-eligible threshold (5 late or 3 missing submissions) without being suspended — the seeded data includes a subcontractor who is exactly in that state, and a separate one with payment withheld but *not* suspended, to make the point that these are two independent levers, not one.

## Setup

```bash
npm install
npm run build --workspace=packages/shared

# Deploy (single environment, no dev/prod split — everything is "prod")
cd infrastructure && npx serverless deploy --stage prod && cd ..
cd services/compliance && npx serverless deploy --stage prod && cd ../..

# Seed data
node scripts/seed.mjs
node scripts/seed-scenarios.mjs

# Deploy frontend
./deploy-FE.sh
```

Local iteration: `npm run dev` (serverless-offline + Vite) against the deployed table.

## AI usage & scope decisions

**AI tools used:** Claude (via Claude Code), for the full build — architecture, all Lambda handlers, the cascade/status engine logic, seed data, and this README. I directed every decision (data model shape, which endpoints exist, the human-gated-action principle, what's in vs. out of scope); Claude wrote the code to those specs and I reviewed and corrected it along the way — including catching and fixing a real bug in the recurring-cascade logic (an extra reminder step that wasn't in my original workflow design) and an SES configuration issue that only surfaced when I tested a real send end-to-end.

**What I built myself vs. what came from the model:** The workflow design itself — the reminder cadences, the escalation thresholds, the human-approval principle, the red/yellow/green model — is entirely mine, worked out in Sections 1–3 of this assessment before any code was written. This repo is that design translated into a real, deployed system. I made the scope calls below explicitly, not by default.

**Deliberately out of scope, and why:**

- **No live document-upload / OCR-style AI extraction.** "AI reads for completeness" and "AI scans for relevant fields" are represented by simple, deterministic, explainable rules (e.g. a COI needs a $1M+ coverage limit and a future expiration date) rather than a real document-AI call. Building actual extraction was a bigger, separate problem than what this exercise asks for, and a rule-based stand-in is honest about what it is rather than faking a black box.
- **No real authentication.** Single persona, single environment, take-home explicitly says "does not need to be production-ready." A real implementation would use Google OAuth + JWT (a pattern I've built before) — swapping it in is a drop-in change, since the handler middleware already has the same shape (CORS + error handling) a real auth wrapper would have.
- **No EventBridge nightly schedule.** The reminder/escalation logic lives in one pure function per cascade type, exposed here as an on-demand HTTP endpoint so a real email can be triggered and verified live in the Loom walkthrough. In production, an EventBridge scheduled rule would call the same function nightly — this is a small, mechanical addition once the logic itself is proven, not a design gap.
- **Single AWS environment, no dev/prod split.** Kept deliberately simple for a demo prototype rather than adding infrastructure that wouldn't get exercised.

**A real challenge I hit and fixed while building this:** testing the first real SES send failed with a `ConfigurationSetDoesNotExist` error — a configuration set referenced by an existing project of mine (that I was using as an architectural reference) turned out not to actually exist in this AWS account, even though the IAM policy granting permission to use it did. I traced it, removed the hard dependency on a configuration set, and reran the send successfully. Worth knowing: an IAM grant referencing a resource ARN doesn't guarantee that resource exists.

## What's next

- Real document upload + AI extraction, replacing the rule-based validation stand-in
- Real auth (Google OAuth + JWT)
- EventBridge nightly schedule calling the existing cascade-check functions automatically, instead of on-demand
- Live expiry tracking for insurance certificates specifically (distinct from the reminder-cascade-driven onboarding status)
- Predictive layer: which subs are ready for a project coming up in a month; which subs need proactive attention based on historical compliance patterns — deliberately sequenced after this reactive core, since both need data (future project staffing plans; accumulated compliance history) that doesn't exist until this system has actually been running
