import type { ProductTruth } from "../../lib/truth/schemas.ts";
import type { VerificationReport } from "../../lib/verification/schema.ts";
export const truth: ProductTruth = {
  schemaVersion: 1,
  title: "Blue saree",
  category: "saree",
  missingEvidence: [],
  facts: [
    {
      id: "color",
      attribute: "color",
      value: "Blue",
      merchantClaims: [{ attribute: "color", value: "Blue", quote: "blue" }],
      visualEvidence: [
        {
          attribute: "color",
          value: "Blue body",
          sourceAssetIds: ["11111111-1111-4111-8111-111111111111"],
          region: "body",
          uncertainty: null,
        },
      ],
      inference: null,
      unverifiableReason: null,
      conflict: null,
      verificationScope: "appearance",
      defining: true,
    },
    {
      id: "composition",
      attribute: "material composition",
      value: "Pure silk",
      merchantClaims: [
        {
          attribute: "material composition",
          value: "Pure silk",
          quote: "pure silk",
        },
      ],
      visualEvidence: [],
      inference: null,
      unverifiableReason: "Composition cannot be established from photos.",
      conflict: null,
      verificationScope: "claim_only",
      defining: false,
    },
  ],
};
export const report: VerificationReport = {
  schemaVersion: 1,
  summary: "Blue appearance preserved; composition unknown.",
  attributes: [
    {
      factId: "color",
      status: "PASS",
      explanation: "Blue body is preserved.",
      sourceAssetIds: ["11111111-1111-4111-8111-111111111111"],
      originalRegion: "body",
      generatedRegion: "body",
    },
    {
      factId: "composition",
      status: "NOT VERIFIABLE",
      explanation: "A photo cannot prove pure silk.",
      sourceAssetIds: [],
      originalRegion: null,
      generatedRegion: null,
    },
  ],
};
