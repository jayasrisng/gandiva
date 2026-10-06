import { createAdminClient } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/auth";
import { truthSchema } from "@/lib/truth/schemas";
import { verificationSchema } from "@/lib/verification/schema";
import type { ProductTruth } from "@/lib/truth/schemas";
import type { VerificationReport } from "@/lib/verification/schema";
export type Asset = {
  id: string;
  product_id: string;
  owner_id: string;
  kind: string;
  bucket: string;
  path: string;
  mime: string;
  size_bytes: number;
  sha256: string;
  parent_asset_id: string | null;
  created_at: string;
  url?: string;
};
export type TruthVersion = {
  id: string;
  version: number;
  description_id: string;
  source_asset_ids: string[];
  record: ProductTruth;
  confirmed_at: string | null;
  metadata: unknown;
  created_at: string;
};
export type Generation = {
  id: string;
  version: number;
  truth_version_id: string;
  parent_generation_id: string | null;
  output_asset_id: string | null;
  status: string;
  direction: string;
  correction: {
    text: string;
    rawTranscript?: string | null;
    audioAssetId?: string | null;
  } | null;
  metadata: unknown;
  created_at: string;
};
export type Verification = {
  id: string;
  generation_id: string;
  truth_version_id: string;
  version: number;
  status: string;
  report: VerificationReport | null;
  metadata: unknown;
  created_at: string;
};
export type Description = {
  id: string;
  text: string;
  raw_transcript: string | null;
  language: string;
  model: string | null;
  audio_asset_id: string | null;
  created_at: string;
};
export type Product = {
  id: string;
  owner_id: string;
  name: string;
  category: string;
  status: string;
  current_truth_id: string | null;
  created_at: string;
};
export type Job = {
  idempotency_key: string;
  id: string;
  product_id: string;
  owner_id: string;
  kind: string;
  status: string;
  payload: Record<string, string>;
  lease_token: string;
  error: string | null;
  attempts: number;
  created_at: string;
};
export type Workflow = {
  product: Product;
  assets: Asset[];
  truths: TruthVersion[];
  generations: Generation[];
  verifications: Verification[];
  descriptions: Description[];
  jobs: Job[];
  passports: Array<{
    id: string;
    snapshot: Record<string, unknown>;
    manifest_sha256: string;
    created_at: string;
  }>;
  approvals: Array<Record<string, unknown>>;
};
export function db() {
  const client = createAdminClient();
  if (!client)
    throw new HttpError(
      503,
      "Gandiva storage is not configured. Set up a dedicated Supabase project.",
    );
  return client;
}
export function checked<T>(result: {
  data: T;
  error: { message: string } | null;
}): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  return result.data as NonNullable<T>;
}
export async function ownedProduct(
  owner: string,
  id: string,
): Promise<Product> {
  const product = checked(
    await db()
      .from("products")
      .select("*")
      .eq("id", id)
      .eq("owner_id", owner)
      .maybeSingle(),
  );
  if (!product) throw new HttpError(404, "Product not found.");
  return product;
}
export async function workflow(
  owner: string,
  id: string,
  withUrls = true,
): Promise<Workflow> {
  const product = await ownedProduct(owner, id); // Scope before reading any children with a privileged client.
  const tables = [
    "product_assets",
    "truth_versions",
    "generations",
    "verification_runs",
    "product_descriptions",
    "jobs",
    "passports",
    "approvals",
  ];
  const results = await Promise.all(
    tables.map((table) =>
      db()
        .from(table)
        .select("*")
        .eq("product_id", id)
        .eq("owner_id", owner)
        .order("created_at"),
    ),
  );
  const [
    assets,
    truths,
    generations,
    verifications,
    descriptions,
    jobs,
    passports,
    approvals,
  ] = results.map(checked);
  for (const truth of truths) truth.record = truthSchema.parse(truth.record);
  for (const verification of verifications)
    if (verification.report)
      verification.report = verificationSchema.parse(verification.report);
  if (withUrls)
    await Promise.all(
      assets.map(async (asset: Asset) => {
        const data = checked(
          await db()
            .storage.from(asset.bucket)
            .createSignedUrl(asset.path, 3600),
        );
        asset.url = data.signedUrl;
      }),
    );
  return {
    product,
    assets,
    truths,
    generations,
    verifications,
    descriptions,
    jobs,
    passports,
    approvals,
  } as Workflow;
}
export async function bytes(asset: Asset) {
  const blob = checked(
    await db().storage.from(asset.bucket).download(asset.path),
  );
  return new Uint8Array(await blob.arrayBuffer());
}
export async function sha256(data: Uint8Array | string) {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function sourceImages(state: Workflow, truth?: TruthVersion) {
  const originals = state.assets.filter(
    (a) =>
      a.kind === "original" &&
      (!truth || truth.source_asset_ids.includes(a.id)),
  );
  return Promise.all(
    originals.map(async (asset) => {
      const supported = ["image/jpeg", "image/png", "image/webp"].includes(
        asset.mime,
      );
      const derivative = state.assets.find(
        (a) => a.parent_asset_id === asset.id && a.kind === "derivative",
      );
      const input = supported ? asset : derivative;
      if (!input)
        throw new Error(
          "This camera format needs a browser-generated JPG derivative.",
        );
      return { id: asset.id, bytes: await bytes(input), mime: input.mime };
    }),
  );
}
