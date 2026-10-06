import type {
  Workflow,
  TruthVersion,
  Generation,
  Verification,
} from "@/lib/products/repository";
import { sha256 } from "@/lib/products/repository";
export async function assemble(
  state: Workflow,
  truth: TruthVersion,
  generation: Generation,
  verification: Verification,
) {
  const manifest = {
    schemaVersion: 1,
    productId: state.product.id,
    truthId: truth.id,
    generationId: generation.id,
    verificationId: verification.id,
    assets: state.assets.map((a) => ({
      id: a.id,
      sha256: a.sha256,
      kind: a.kind,
      parentAssetId: a.parent_asset_id,
    })),
    truthSha256: await sha256(JSON.stringify(truth.record)),
    reportSha256: await sha256(JSON.stringify(verification.report)),
  };
  const snapshot = {
    schemaVersion: 1,
    title: state.product.name,
    disclosure:
      "This passport records merchant statements, photographic observations and AI comparison results. It does not certify material composition, origin or authenticity.",
    manifest,
    product: state.product,
    sources: state.assets.map((asset) => {
      const copy = { ...asset };
      delete copy.url;
      return copy;
    }),
    descriptions: state.descriptions,
    truthHistory: state.truths,
    confirmedTruth: truth,
    generationHistory: state.generations,
    verificationHistory: state.verifications,
    selectedGeneration: generation,
    selectedVerification: verification,
    priorApprovals: state.approvals,
  };
  return { snapshot, hash: await sha256(JSON.stringify(manifest)) };
}
