# Gandiva project and operations

## Summary

Gandiva is a private product truth studio for small businesses. Merchants supply original photos and describe a product by voice or text. Gandiva separates their claims from photographic evidence, records uncertainty, creates a commercial image, and independently checks that image before final merchant approval.

## Connected services

| Service            | Target                                          | Purpose                                                                                             |
| ------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| GitHub             | https://github.com/jayasrisng/gandiva           | Source, documentation, issues, and validation workflows                                             |
| Supabase           | `xqklzfcfcrglvamjkvry`                          | Authentication, PostgreSQL, private storage, versioned evidence, and durable jobs                   |
| Supabase API       | https://xqklzfcfcrglvamjkvry.supabase.co        | Runtime client and server connections                                                               |
| OpenAI             | Configured through server environment variables | Claim extraction, photographic observations, image editing, independent verification, transcription |
| Cloudflare Workers | Worker name `gandiva`                           | Intended hosting target and scheduled job recovery; deployment is a separate step                   |

## Setup status — October 6, 2026

The Gandiva runtime connection has been verified against this live Supabase project. The initial application schema, a metadata-only documentation migration, and a function-security hardening migration are applied and recorded in migration history. All 11 application tables are accessible through the server connection, all three storage buckets are private, and anonymous product reads are denied. The local Auth callback is `http://localhost:3000/auth/callback`.

Supabase already identifies `jayasrisng/gandiva` as its connected repository. Automatic production database deployment and paid preview branching are disabled. Cloudflare hosting and the OpenAI runtime credential still need configuration.

## V1 scope

SOURCE → CLAIMS → PRODUCT TRUTH → GENERATION → VERIFICATION → CORRECTION → APPROVAL.

- Up to six original product photos, retained privately alongside derivatives.
- English, Telugu, mixed Telugu-English, and auto-detected voice input with editable transcripts.
- Explicit merchant claims, visual evidence, inference, conflicting facts, and unverifiable attributes.
- Merchant-confirmed truth versions and reference-based commercial image generation.
- Separate PASS / WARNING / FAIL / NOT VERIFIABLE attribute reports.
- Natural-language correction, retained image/report histories, exact-version approval, and a Product Truth Passport.

Pricing, storefronts, orders, analytics, video, social publishing, advertising, campaigns, and payments are outside V1.

## Runtime configuration

Copy `.env.example` to `.env.local` if the latter does not exist. The URL and publishable key identify the Gandiva project and may be public. Fill `SUPABASE_SERVICE_ROLE_KEY` with an existing server key from this project's API Keys settings. `SUPABASE_SECRET_KEY` is also accepted by the server helper. Fill `OPENAI_API_KEY` separately. Never add either server key to `NEXT_PUBLIC_` variables or commit them.

`JOB_RUNNER_SECRET` secures the optional local runner. Run `pnpm dev` and, in another terminal, `pnpm jobs`. Cloudflare's scheduled handler provides recovery after deployment.

Configure Supabase Auth with `http://localhost:3000` as the local Site URL and `http://localhost:3000/auth/callback` as an allowed redirect. Add production URLs after hosting is configured. Keep email confirmation enabled; Google OAuth requires its own provider credentials.

## Database and provenance

`supabase/migrations/202610050001_gandiva.sql` creates the initial schema. It is an imperative migration and must be applied once. A subsequent `project_documentation` migration adds schema and table descriptions. `security_hardening` fixes the immutable-trigger search path and restricts a hosted automatic-RLS helper when present. All three migrations are recorded as applied in the connected project; do not rerun them. `supabase/verification.sql` contains read-only verification queries. The application tables are `merchant_profiles`, `products`, `product_assets`, `source_transcripts`, `product_descriptions`, `truth_versions`, `generations`, `verification_runs`, `approvals`, `passports`, and `jobs`.

Owner-based row-level security separates merchants. Authenticated clients can read their own rows; privileged writes pass through authenticated server endpoints and service-only workflow functions. Originals, generated images, and audio are in private storage buckets with signed access. Completed evidence and final passports are immutable.

The passport is a provenance record and merchant attestation. It does not certify material composition, origin, or authenticity. Hashes detect changes to recorded bytes; they do not establish whether a claim is true.

## Supabase CLI

`supabase/config.toml` configures an optional local PostgreSQL 17 stack for Gandiva. It is not a hosted-project link or a deployment instruction. To use remote CLI commands, authenticate with an appropriately scoped Supabase token, run `supabase link --project-ref xqklzfcfcrglvamjkvry`, and verify `supabase migration list` before applying any new migration. Discover command options with `--help`. Never run a remote reset against merchant data.

## Supabase agent connection

`.mcp.json` scopes the Supabase MCP server to this project's reference. It contains no access token. Authenticate the installed Supabase plugin/MCP connection through its OAuth flow if its tools are unavailable. Some Codex clients use their MCP settings or `config.toml` rather than `.mcp.json`; use the same project-scoped URL shown in that file. The agent connection does not replace the runtime application's environment keys.

## Validation and delivery

Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, and `pnpm build`. GitHub Actions runs these checks with local fixture services and does not need production secrets. Fixture-generated images are test data, not proof of image fidelity.

Before public use, validate real Maanvi photos and a non-saree product, known altered colors/borders/motifs, two separate merchant accounts, real Telugu code-switching, and iOS/Android camera/audio behavior.

Deployment is not automatic. Configure a new Cloudflare Worker with build-time public values and server-only runtime secrets, deploy the generated `dist/server/wrangler.json`, and verify scheduled job execution.

## Operational safeguards

- Failed or expired jobs stay visible; unknown provider outcomes are not silently retried.
- Regeneration retains earlier image and verification versions.
- Approval is tied to the current confirmed truth and exact image/report versions.
- Remove orphan staging objects only through an operator-reviewed cleanup that excludes registered evidence.
- Keep private uploads and credentials out of issue reports, commits, and CI logs.
