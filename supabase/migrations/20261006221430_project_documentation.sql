-- Gandiva project documentation. Metadata only; no merchant records are changed.
comment on schema public is 'Gandiva V1 product truth and provenance studio. Repository: https://github.com/jayasrisng/gandiva. Supabase project: xqklzfcfcrglvamjkvry. Merchant claims and model assessments are not authenticity certification.';
comment on table public.merchant_profiles is 'Merchant identity and business display name. One-owner businesses in Gandiva V1.';
comment on table public.products is 'Gandiva workflow root: source, claims, confirmed Product Truth, generation, verification, correction, and approval.';
comment on table public.product_assets is 'Private source photos, derivatives, retained audio, and generated outputs with SHA-256 hashes and lineage.';
comment on table public.source_transcripts is 'Immutable transcription results from retained merchant recordings. Raw transcription is not a verified product fact.';
comment on table public.product_descriptions is 'Versioned merchant descriptions and edited transcripts; exact quote provenance for extracted claims.';
comment on table public.truth_versions is 'Versioned Product Truth separating merchant claims, photographic evidence, inference, conflict, and unverifiable attributes. Merchant confirmation is an attestation, not independent certification.';
comment on table public.generations is 'Commercial image-edit attempts bound to confirmed truth and original sources. Earlier outputs and corrections remain retained.';
comment on table public.verification_runs is 'Independent per-attribute PASS, WARNING, FAIL, or NOT VERIFIABLE assessments bound to an exact generated image and truth version.';
comment on table public.approvals is 'Merchant truth confirmations and final image approvals tied to exact versions, statements, and acknowledged uncertainty.';
comment on table public.passports is 'Immutable Product Truth Passport snapshots of sources, claims, evidence, generation/verification history, and final merchant attestation.';
comment on table public.jobs is 'Durable leased execution queue with idempotency keys and fencing; unknown provider outcomes fail visibly rather than silently repeating spend.';
