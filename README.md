# Subcontractor Compliance Tracker

A working prototype built for Tough Leaf's ClearComply take-home assessment (Section 4: Build Challenge).

**Live demo:** https://ds4wgujh68dua.cloudfront.net
**API base URL:** https://8lr32bnqsc.execute-api.ca-west-1.amazonaws.com/prod
**Loom walkthrough:** _add link here after recording_

## What this is

A compliance manager needs to track whether subcontractors have submitted four required documents — Insurance Certificate (COI), W-9, Certified Payroll Report, and Monthly Workforce Report — across multiple active construction projects. Today that's tracked manually in spreadsheets and email.

This prototype has two logins — a compliance manager and a subcontractor — because "take action on missing items" and "how does a sub actually submit a document" are two different people's jobs, not one screen wearing two hats.

**As the compliance manager**, you can:

- **View subcontractors** — dashboard grouped by project, plus an onboarding-only view for subs not yet assigned to a project
- **View document requirements** — the four documents, their phase (onboarding vs. project-in-progress), and their cadence
- **See document status** — red/yellow/green, computed live from stored facts, never stored as a stale field
- **Identify missing documents** — a single cross-project queue, sorted by urgency
- **Take action on missing items** — send a reminder on demand (real email, not a mock), withhold/release payment, suspend/reinstate

**As a subcontractor**, you can log into a separate, narrower portal and upload your own COI, W-9, Certified Payroll, or Monthly Workforce Report as a real file (PDF or image). A real AI model reads it, extracts the fields that matter (coverage limit, expiration date, tax ID, hours, participation percentage), and runs the exact same validation rule the compliance manager's manual-entry path uses — a sub logging in only ever sees and acts on their own records.

The underlying workflow design (reminder cadences, escalation logic, and — most importantly — the rule that AI never executes a financial or contractual consequence on its own) comes from the reasoning in Sections 1–3 of this same take-home (see `career/output/tough-leaf/take-home-answers.md` in the candidate's working repo, not included here). This repo is the technical build that makes that design real and demoable.

## Architecture

- **Frontend:** React + TypeScript + Vite + Tailwind, hosted on S3 + CloudFront
- **Backend:** Node.js + TypeScript on AWS Lambda (Serverless Framework v3), one service (`services/compliance`), API Gateway REST
- **Database:** DynamoDB, single-table design (`compliance-tracker-prod`), 2 GSIs
- **Email:** real AWS SES send (not a mock)
- **File storage:** S3, uploads trigger an event-driven Lambda (no polling)
- **AI document reading:** AWS Bedrock, Claude Haiku, tool-use for structured field extraction (not regex-parsed prose)
- **Auth:** HTTP Basic Auth, two identities — see below

```
frontend/               React SPA — compliance dashboard + a separate sub-facing portal
services/compliance/    Lambda handlers, one file per route
packages/shared/        Domain types, DynamoDB client, cascade/status engines, SES wrapper,
                         Basic Auth middleware, S3 presign helper, Bedrock extraction
infrastructure/         S3 + CloudFront (serverless.yml)
scripts/                seed.mjs (base data), seed-scenarios.mjs (historic scenario data),
                         set-sub-passwords.mjs (adds login credentials without disturbing seeded state)
```

### Auth — two logins, deliberately simple

"Just HTTP auth is fine" was the actual instruction, so that's what this is: no OAuth, no sessions, no tokens — the browser (or curl) sends `Authorization: Basic base64(user:pass)` on every request, checked directly in Lambda middleware.

- **Compliance manager** — one shared login (`packages/shared/src/middleware/basicAuth.ts` → `withComplianceAuth`), credentials pulled from SSM at deploy time, not hardcoded in the repo.
- **Subcontractor** — one login *per sub* (`withSubAuth`), username is the subId itself, password hashed with PBKDF2 and stored on that sub's own DynamoDB record. A sub can only ever act on their own resources — the path's `subId` must match the authenticated identity or the request is rejected with 403, verified directly (`curl`-ing another sub's record with valid-but-mismatched credentials returns 403, not 200).

### Document upload — the actual flow a sub follows

1. Sub logs in, picks a file, frontend calls `POST /sub-portal/{subId}/documents/{docType}/upload-url` (sub-authenticated) → gets back a **presigned S3 PUT URL**.
2. Browser uploads the file **directly to S3** — it never passes through a Lambda, so there's no payload-size limit or double-handling.
3. The S3 `ObjectCreated` event triggers `processUploadedDocument` (wired via a manually-authored `NotificationConfiguration` + `AWS::Lambda::Permission`, since the bucket is an explicit resource rather than one Serverless Framework creates and owns itself).
4. That Lambda fetches the object, base64-encodes it, and sends it to **Claude Haiku via Bedrock** using **tool-use** (a forced tool call), not prompt-and-hope-for-JSON — guarantees a parseable structured response instead of a fragile regex match against prose.
5. The extracted fields run through the identical `validateOnboardingDoc` / `validateRecurringDoc` functions the manual-entry endpoints use, so a real upload and a typed-in submission are judged by the same rule, never a diverging one.

Verified live end-to-end: a synthetic test COI image with "Policy Expiration Date: 2027-06-30" written on it, uploaded through the real flow, came back with `expiresAt: "2027-06-30"` extracted correctly by the model — not a canned response.

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

# Compliance-manager login credentials (read by serverless.yml at deploy time)
aws ssm put-parameter --name "/compliance-tracker/prod/compliance-username" --value "<username>" --type String --region ca-west-1
aws ssm put-parameter --name "/compliance-tracker/prod/compliance-password" --value "<password>" --type String --region ca-west-1

# Deploy (single environment, no dev/prod split — everything is "prod")
cd infrastructure && npx serverless deploy --stage prod && cd ..
cd services/compliance && npx serverless deploy --stage prod && cd ../..

# Seed data (only on a fresh table — see note below)
node scripts/seed.mjs
node scripts/seed-scenarios.mjs

# Deploy frontend
./deploy-FE.sh
```

**Sub portal login:** every seeded subcontractor logs in with their subId as the username. On a fresh deploy, `seed.mjs` sets each sub's password to `Passw0rd!` directly. If you need to (re)set passwords on an *already-seeded* table without disturbing the scenario data (`seed.mjs` does a full upsert and would reset `onboardingStatus` back to its default), run `node scripts/set-sub-passwords.mjs` instead — it touches only the `passwordHash` attribute.

Local iteration: `npm run dev` (serverless-offline + Vite) against the deployed table.

## AI usage & scope decisions

**AI tools used:** Claude (via Claude Code), for the full build — architecture, all Lambda handlers, the cascade/status engine logic, seed data, and this README. I directed every decision (data model shape, which endpoints exist, the human-gated-action principle, what's in vs. out of scope); Claude wrote the code to those specs and I reviewed and corrected it along the way — including catching and fixing a real bug in the recurring-cascade logic (an extra reminder step that wasn't in my original workflow design) and an SES configuration issue that only surfaced when I tested a real send end-to-end.

**What I built myself vs. what came from the model:** The workflow design itself — the reminder cadences, the escalation thresholds, the human-approval principle, the red/yellow/green model — is entirely mine, worked out in Sections 1–3 of this assessment before any code was written. This repo is that design translated into a real, deployed system. I made the scope calls below explicitly, not by default.

**Deliberately out of scope, and why:**

- **Auth is HTTP Basic, not OAuth/JWT.** Explicitly the right call for this build, not a corner cut — two simple personas, no session/refresh-token complexity earns its keep here. A real production version would likely move to Google OAuth + JWT (a pattern I've built before); swapping it in is a drop-in change, since the middleware already has the same shape (CORS + error handling, an authenticated identity passed into the handler) a real auth wrapper would have.
- **No EventBridge nightly schedule.** The reminder/escalation logic lives in one pure function per cascade type, exposed here as an on-demand HTTP endpoint so a real email can be triggered and verified live in the Loom walkthrough. In production, an EventBridge scheduled rule would call the same function nightly — this is a small, mechanical addition once the logic itself is proven, not a design gap.
- **Single AWS environment, no dev/prod split.** Kept deliberately simple for a demo prototype rather than adding infrastructure that wouldn't get exercised.

**Real challenges I hit and fixed while building this, not smoothed over:**

- Testing the first real SES send failed with a `ConfigurationSetDoesNotExist` error — a configuration set referenced by an existing project of mine (used as an architectural reference) turned out not to actually exist in this AWS account, even though the IAM policy granting permission to use it did. Traced it, removed the hard dependency on a configuration set, reran the send successfully. An IAM grant referencing a resource ARN doesn't guarantee that resource exists.
- My first pass at the recurring-document upload/S3-notification wiring assumed Serverless Framework's built-in `s3` function-event type would work on an explicitly-declared bucket resource — it doesn't cleanly, since Serverless expects to own buckets it manages that way. Fixed by wiring the `NotificationConfiguration` and `AWS::Lambda::Permission` by hand instead.
- The Bedrock extraction path uses tool-use (a forced tool call) rather than asking the model to describe fields in prose and regex-matching the answer — a more fragile pattern I'd used in an earlier project. Worth the small extra setup for a guaranteed-parseable response.

## What's next

- Real auth (Google OAuth + JWT), if this needed to support more than two simple roles
- EventBridge nightly schedule calling the existing cascade-check functions automatically, instead of on-demand
- Live expiry tracking for insurance certificates specifically (distinct from the reminder-cascade-driven onboarding status)
- Predictive layer: which subs are ready for a project coming up in a month; which subs need proactive attention based on historical compliance patterns — deliberately sequenced after this reactive core, since both need data (future project staffing plans; accumulated compliance history) that doesn't exist until this system has actually been running
