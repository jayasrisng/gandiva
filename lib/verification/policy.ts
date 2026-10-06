import type { ProductTruth } from "../truth/schemas.ts";
import type { VerificationReport } from "./schema.ts";
export function approvalIssues(
  truth: ProductTruth,
  report: VerificationReport,
) {
  const issues: string[] = [];
  const ids = new Set(truth.facts.map((f) => f.id));
  if (
    new Set(report.attributes.map((a) => a.factId)).size !==
      report.attributes.length ||
    report.attributes.some((a) => !ids.has(a.factId))
  )
    issues.push("Verification contains duplicate or unknown attributes.");
  for (const fact of truth.facts) {
    const result = report.attributes.find((a) => a.factId === fact.id);
    if (!result) {
      issues.push(`Missing verification: ${fact.attribute}`);
      continue;
    }
    if (result.status === "FAIL")
      issues.push(`Changed product detail: ${fact.attribute}`);
    if (fact.defining && result.status === "NOT VERIFIABLE")
      issues.push(`Defining detail needs evidence: ${fact.attribute}`);
    if (
      result.status === "PASS" &&
      (fact.verificationScope === "claim_only" ||
        !fact.visualEvidence.length ||
        !result.sourceAssetIds.some((id) =>
          fact.visualEvidence.some((e) => e.sourceAssetIds.includes(id)),
        ))
    )
      issues.push(`Unsupported visual pass: ${fact.attribute}`);
  }
  return issues;
}
export function normalizeVerification(
  truth: ProductTruth,
  report: VerificationReport,
  sources: string[],
): VerificationReport {
  const seen = new Set<string>();
  const sourceIds = new Set(sources);
  for (const item of report.attributes) {
    if (seen.has(item.factId) || !truth.facts.some((f) => f.id === item.factId))
      throw new Error("Invalid verification attributes.");
    seen.add(item.factId);
    if (item.sourceAssetIds.some((id) => !sourceIds.has(id)))
      throw new Error("Invalid verification source reference.");
  }
  return {
    ...report,
    attributes: truth.facts.map((fact) => {
      const result = report.attributes.find((a) => a.factId === fact.id);
      if (!result)
        return {
          factId: fact.id,
          status: "NOT VERIFIABLE",
          explanation: "The verifier did not assess this attribute.",
          sourceAssetIds: [],
          originalRegion: null,
          generatedRegion: null,
        };
      if (
        fact.verificationScope === "claim_only" ||
        !fact.visualEvidence.length ||
        (result.status === "PASS" &&
          !result.sourceAssetIds.some((id) =>
            fact.visualEvidence.some((e) => e.sourceAssetIds.includes(id)),
          ))
      )
        return {
          ...result,
          status: "NOT VERIFIABLE",
          explanation:
            "No linked visual evidence establishes this claim. " +
            result.explanation,
        };
      if (fact.conflict && result.status === "PASS")
        return {
          ...result,
          status: "WARNING",
          explanation:
            "Product Truth contains unresolved conflicting evidence. " +
            result.explanation,
        };
      return result;
    }),
  };
}
