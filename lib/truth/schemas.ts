import { z } from "zod";
export const claimSchema = z.object({
  attribute: z.string(),
  value: z.string(),
  quote: z.string(),
});
export const observationSchema = z.object({
  attribute: z.string(),
  value: z.string(),
  sourceAssetIds: z.array(z.string()),
  region: z.string().nullable(),
  uncertainty: z.string().nullable(),
});
export const factSchema = z.object({
  id: z.string(),
  attribute: z.string(),
  value: z.string().nullable(),
  merchantClaims: z.array(claimSchema),
  visualEvidence: z.array(observationSchema),
  inference: z.string().nullable(),
  unverifiableReason: z.string().nullable(),
  conflict: z.string().nullable(),
  verificationScope: z.enum(["appearance", "claim_only"]),
  defining: z.boolean(),
});
export const truthSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().min(1).max(200),
  category: z.string(),
  facts: z.array(factSchema).min(1).max(60),
  missingEvidence: z.array(z.string()),
});
export const claimsSchema = z.object({ claims: z.array(claimSchema) });
export const observationsSchema = z.object({
  observations: z.array(observationSchema),
  missingEvidence: z.array(z.string()),
});
export type ProductTruth = z.infer<typeof truthSchema>;
export type TruthFact = z.infer<typeof factSchema>;

// A merchant correction establishes a claim, never new photographic evidence.
export function merchantRevision(
  truth: ProductTruth,
  edits: Record<string, string>,
): ProductTruth {
  return truthSchema.parse({
    ...truth,
    facts: truth.facts.map((fact) => {
      if (!(fact.id in edits) || edits[fact.id] === (fact.value ?? ""))
        return fact;
      const value = edits[fact.id].trim() || null;
      return {
        ...fact,
        value,
        merchantClaims: [
          ...fact.merchantClaims,
          {
            attribute: fact.attribute,
            value: value ?? "Unknown",
            quote: value ?? "Unknown",
          },
        ],
        // Preserve disagreement instead of promoting the correction into visual evidence.
        conflict: fact.visualEvidence.length
          ? "Merchant revised the value. Existing photographic observations are retained and may differ."
          : fact.conflict,
      };
    }),
  });
}
export function validateEvidence(
  truth: ProductTruth,
  sourceIds: string[],
  text: string,
) {
  const ids = new Set(sourceIds);
  if (new Set(truth.facts.map((f) => f.id)).size !== truth.facts.length)
    throw new Error("Duplicate truth attribute IDs.");
  for (const fact of truth.facts) {
    for (const evidence of fact.visualEvidence) {
      if (
        !evidence.sourceAssetIds.length ||
        evidence.sourceAssetIds.some((id) => !ids.has(id))
      )
        throw new Error("Visual evidence references an unknown source.");
    }
    for (const claim of fact.merchantClaims) {
      if (!claim.quote.trim() || !text.includes(claim.quote))
        throw new Error(
          "Merchant claim does not quote the supplied description.",
        );
    }
    if (
      fact.value &&
      !fact.merchantClaims.length &&
      !fact.visualEvidence.length &&
      !fact.inference
    )
      throw new Error("Unsupported truth attribute.");
  }
}
