# Gandiva V1

Gandiva helps small-business owners turn real product photos and natural-language descriptions into professional commercial images with a reviewable record of evidence, changes, and merchant approval.

The first demo uses Maanvi sarees; the underlying product model also supports other categories.

**SOURCE → CLAIMS → PRODUCT TRUTH → GENERATION → VERIFICATION → CORRECTION → APPROVAL**

Gandiva uses React with App Router, the Vinext/Cloudflare runtime, Tailwind 4, Supabase authentication and private storage, signed uploads, browser camera capture, voice recording, and OpenAI models.

## Project connections

- **Repository:** [jayasrisng/gandiva](https://github.com/jayasrisng/gandiva)
- **Supabase project:** `xqklzfcfcrglvamjkvry`
- **Supabase API:** https://xqklzfcfcrglvamjkvry.supabase.co
- **Dashboard:** [Gandiva Supabase](https://supabase.com/dashboard/project/xqklzfcfcrglvamjkvry)
- **Connection and operations guide:** [docs/PROJECT.md](docs/PROJECT.md)

The connected database is initialized; see the operations guide for applied migration status. Public connection values are included in `.env.example`. Server credentials belong only in ignored local environment files or deployment secrets. The repository contains no merchant photos or private API keys.

## Run locally

Requires Node 22.13+ and pnpm.

1. Use the dedicated Gandiva Supabase project listed above.
2. On a fresh database, apply `supabase/migrations/202610050001_gandiva.sql` once in the project's SQL editor. Check migration history first; do not rerun an applied migration. It creates private buckets, tenant-scoped read policies, immutable evidence records, transactional workflow functions, and a durable job queue.
3. Copy `.env.example` to `.env.local`, keep Gandiva's URL/publishable key, and enter its server-only service role key and your OpenAI key. Model defaults are configurable; confirm your account supports them.
4. Add `http://localhost:3000/auth/callback` to Supabase Auth's redirect allowlist. Set the site URL appropriately. Enable Google OAuth only if using Google sign in; email/password works without Google.
5. Run `pnpm install`, then `pnpm dev`.
6. Create your own account and upload original product photos. There are no shared demo credentials.
7. For robust local background processing, set a random `JOB_RUNNER_SECRET` in `.env.local` and run `pnpm jobs` in another terminal. The request's `after()` callback provides a fast start, but the persisted queue and runner provide recovery.

Without credentials, the landing and authentication screens render and the merchant layout explains setup. No simulated generation is presented as a real result.

## What V1 implements

- One-owner businesses with private original photos, separate optimized derivatives, retained voice recordings, and raw/edited transcript records.
- Telugu, English, mixed-language, and auto-detect speech input, plus typed descriptions. Browser speech recognition is not treated as authoritative.
- Independent merchant-claim extraction and photo-only observations, then reconciliation into a Zod-validated truth draft. Exact quote/source references are validated; invented or omitted evidence is rejected.
- Merchant edits create new truth versions. Confirmation does not establish authenticity or composition.
- One commercial image per request, always generated through image editing with original references. Supported original files feed the model directly; HEIC/HEIF uses its linked browser-decoded derivative. Original bytes remain retained.
- Separate persisted verification jobs with PASS / WARNING / FAIL / NOT VERIFIABLE per attribute; provider errors remain failed jobs, not verdicts.
- Typed or recorded correction, original-reference regeneration, image/verification version history, and final merchant approval bound to exact versions.
- Approval blocks FAIL and NOT VERIFIABLE defining features; warnings and nonvisual unverifiable claims require acknowledgment. Claim-only attributes cannot pass photographic verification.
- Immutable Product Truth Passport snapshots, private source hashes, prompt/model history, JSON download, and printable record.

The passport is an evidence record and merchant attestation, not an independent authenticity certificate. A SHA-256 manifest detects changes to recorded evidence; it does not prove that a merchant claim is true.

## Architecture

- `app/`: authentication, dashboard, source capture, product workflow, and API routes.
- `components/`: capture/voice, truth editor, original/generated comparison, verification reports, passport.
- `lib/truth/`: independent extraction, schemas, and merchant revision semantics.
- `lib/generation/`: product-preserving image-edit prompts and provider calls.
- `lib/verification/`: separate verifier, reference validation, fail-closed approval policy.
- `lib/products/`: scoped database access, storage, hashes, upload validation.
- `lib/jobs/`: database lease acquisition, execution fencing, task completion.
- `supabase/migrations/`: private storage, RLS, version relationships, transactional approval.
- `worker/`: Cloudflare fetch handler and scheduled queue recovery.

V1 deliberately stores per-attribute claims/observations and reports in validated JSONB, with relational boundaries around versions, sources, jobs, and approvals. Category guidance supports sarees without constraining the schema to fashion.

## Jobs and reliability

Intake and generation requests persist jobs before returning. Cloudflare's minute cron drains up to three jobs per invocation, using PostgreSQL `FOR UPDATE SKIP LOCKED` and unique lease tokens. Generation completion atomically records the output and enqueues an independent verification job. Approval and truth-version changes are transactional and reject stale inputs.

A 20-minute execution lease accommodates image generation. If the process disappears, the expired job fails visibly instead of automatically repeating a potentially billable provider request with an unknown outcome. The UI can create a new generation attempt or verification run. Previous images and reports are never deleted during regeneration.

Interrupted uploads can leave unregistered staging objects; a response lost after an output upload can leave an unregistered output. These are retained rather than risking deletion of committed evidence. Establish an operator-controlled orphan cleanup policy before production volume. Registered evidence must never be included in a staging cleanup.

## Validation

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

Tests run the actual migration/functions in PGlite PostgreSQL, with minimal Auth/Storage schema stubs. They cover tenant isolation, service-only mutation, immutable records, deduplication, stale approval rejection, warning acknowledgment, correction history, and expired execution fencing. Policy tests cover invented evidence, unknown values, unsupported PASS, changed details, and non-saree products. The HTTP integration harness runs signed uploads and the entire loop through the actual application against local Supabase/OpenAI fixture services. It uses isolated local fixtures and does not spend provider credits. Its mock image output is a copied test pixel, not an AI fidelity result.

These tests do not prove a particular image model's fidelity or real-device transcription quality.

## Deploy

Gandiva builds with Vinext/Vite for Cloudflare Workers under the `gandiva` worker identity.

1. Configure a new Cloudflare Worker and Gandiva's Supabase/OpenAI secrets. Public Supabase variables must be present at build time as well as runtime; private keys remain server-only.
2. Run `pnpm build` and deploy the generated `dist/server/wrangler.json` using your configured Cloudflare account, e.g. `pnpm exec wrangler deploy --config dist/server/wrangler.json`.
3. Verify the minute cron is present and can complete an analysis → generation → verification sequence. Scheduled execution must have the same database/provider configuration as request execution.
4. Set Supabase's production auth redirect URL and test with two independent merchant accounts.
5. Validate real Maanvi photos and a non-saree product, including known altered motifs/borders and unsupported material/origin claims. Test camera, HEIC decoding, recording, Telugu code-switching, and upload interruptions on actual iOS/Android devices.

No storefront, pricing engine, analytics, video, social publishing, campaigns, or payments are included.
