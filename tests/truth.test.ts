import assert from "node:assert/strict";
import { test } from "node:test";
import {
  truthSchema,
  merchantRevision,
  validateEvidence,
} from "../lib/truth/schemas.ts";
import {
  normalizeVerification,
  approvalIssues,
} from "../lib/verification/policy.ts";
import { truth, report } from "./fixtures/truth.ts";
test("unknown values remain valid and no commerce fields are required", () => {
  assert.equal(
    truthSchema.parse({ ...truth, facts: [{ ...truth.facts[1], value: null }] })
      .facts[0].value,
    null,
  );
});
test("a merchant revision never fabricates visual evidence", () => {
  const revised = merchantRevision(truth, { color: "Purple" });
  assert.equal(revised.facts[0].value, "Purple");
  assert.deepEqual(
    revised.facts[0].visualEvidence,
    truth.facts[0].visualEvidence,
  );
  assert.equal(revised.facts[0].merchantClaims.at(-1)?.quote, "Purple");
  assert.ok(revised.facts[0].conflict);
  assert.equal(truth.facts[0].value, "Blue");
});
test("extraction rejects invented quotes and foreign evidence IDs", () => {
  assert.doesNotThrow(() =>
    validateEvidence(
      truth,
      ["11111111-1111-4111-8111-111111111111"],
      "This blue saree is pure silk",
    ),
  );
  assert.throws(() =>
    validateEvidence(truth, ["different-source"], "blue pure silk"),
  );
  assert.throws(() =>
    validateEvidence(
      truth,
      ["11111111-1111-4111-8111-111111111111"],
      "The merchant never said this",
    ),
  );
});
test("unsupported merchant claims cannot receive a visual PASS", () => {
  const normalized = normalizeVerification(
    truth,
    {
      ...report,
      attributes: report.attributes.map((a) => ({ ...a, status: "PASS" })),
    },
    ["11111111-1111-4111-8111-111111111111"],
  );
  assert.equal(normalized.attributes[1].status, "NOT VERIFIABLE");
  assert.deepEqual(approvalIssues(truth, normalized), []);
});
test("missing defining attributes and material changes block approval", () => {
  assert.ok(
    approvalIssues(truth, { ...report, attributes: report.attributes.slice(1) })
      .length,
  );
  assert.ok(
    approvalIssues(truth, {
      ...report,
      attributes: [
        { ...report.attributes[0], status: "FAIL" },
        report.attributes[1],
      ],
    }).length,
  );
  assert.ok(
    approvalIssues(truth, {
      ...report,
      attributes: [
        { ...report.attributes[0], status: "NOT VERIFIABLE" },
        report.attributes[1],
      ],
    }).length,
  );
});
test("duplicate, unknown and foreign verifier references fail closed", () => {
  assert.throws(() =>
    normalizeVerification(
      truth,
      { ...report, attributes: [report.attributes[0], report.attributes[0]] },
      ["11111111-1111-4111-8111-111111111111"],
    ),
  );
  assert.throws(() =>
    normalizeVerification(
      truth,
      {
        ...report,
        attributes: [{ ...report.attributes[0], sourceAssetIds: ["foreign"] }],
      },
      [],
    ),
  );
  assert.throws(() =>
    normalizeVerification(
      truth,
      {
        ...report,
        attributes: [{ ...report.attributes[0], factId: "invented" }],
      },
      [],
    ),
  );
});
test("a non-saree product uses the same truth and approval model", () => {
  const generic = truthSchema.parse({
    ...truth,
    title: "Blue ceramic cup",
    category: "drinkware",
    facts: [truth.facts[0]],
  });
  assert.deepEqual(
    approvalIssues(generic, { ...report, attributes: [report.attributes[0]] }),
    [],
  );
});
