"use client";
import type {
  Workflow,
  TruthVersion,
  Generation,
  Verification,
  Asset,
  Description,
} from "@/lib/products/repository";
export function PassportView({
  passport,
}: {
  passport: Workflow["passports"][number];
}) {
  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { ...passport.snapshot, manifestSha256: passport.manifest_sha256 },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `gandiva-passport-${passport.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const snapshot = passport.snapshot;
  const selected = snapshot.selectedGeneration as Generation;
  const truth = snapshot.confirmedTruth as TruthVersion;
  const verification = snapshot.selectedVerification as Verification;
  const sources = snapshot.sources as Asset[];
  const descriptions = snapshot.descriptions as Description[];
  const final = snapshot.finalApproval as {
    statement: string;
    acknowledgedWarnings: string[];
  };
  return (
    <section className="panel passport">
      <p className="eyebrow">PRODUCT TRUTH PASSPORT</p>
      <h2>{String(snapshot.title)}</h2>
      <span className="badge pass">
        Merchant approved · image v{selected?.version}
      </span>
      <p>{String(snapshot.disclosure)}</p>
      <dl>
        <dt>Passport ID</dt>
        <dd>{passport.id}</dd>
        <dt>Approved</dt>
        <dd>{String(snapshot.approvedAt)}</dd>
        <dt>Approved by</dt>
        <dd>{String(snapshot.approvedBy)}</dd>
        <dt>Truth version</dt>
        <dd>v{truth.version}</dd>
        <dt>Selected verification</dt>
        <dd>
          Run {verification.version} · {verification.id}
        </dd>
        <dt>Evidence manifest SHA-256</dt>
        <dd className="hash">{passport.manifest_sha256}</dd>
      </dl>
      <div className="passport-attestation">
        <strong>Final merchant attestation</strong>
        <p>{final?.statement}</p>
        <small>
          Acknowledged uncertain attributes:{" "}
          {final?.acknowledgedWarnings.join(", ") || "None"}
        </small>
      </div>
      <h3>Product facts and their evidence</h3>
      <div className="passport-facts">
        {truth.record.facts.map((fact) => (
          <article key={fact.id}>
            <strong>
              {fact.attribute}: {fact.value || "Unknown"}
            </strong>
            <p>
              <span className="evidence-label claim">MERCHANT CLAIMS</span>{" "}
              {fact.merchantClaims.map((c) => `“${c.quote}”`).join(" · ") ||
                "Not stated"}
            </p>
            <p>
              <span className="evidence-label visible">VISUALLY SUPPORTED</span>{" "}
              {fact.visualEvidence
                .map((e) => `${e.value} (${e.sourceAssetIds.join(", ")})`)
                .join(" · ") || "No photographic support"}
            </p>
            {fact.inference && (
              <p>
                <span className="evidence-label inferred">INFERRED</span>{" "}
                {fact.inference}
              </p>
            )}
            {fact.unverifiableReason && (
              <p>
                <span className="evidence-label unknown">NOT VERIFIABLE</span>{" "}
                {fact.unverifiableReason}
              </p>
            )}
            {fact.conflict && <p className="warning">{fact.conflict}</p>}
            <p>
              <strong>
                {
                  verification.report?.attributes.find(
                    (a) => a.factId === fact.id,
                  )?.status
                }
              </strong>{" "}
              ·{" "}
              {
                verification.report?.attributes.find(
                  (a) => a.factId === fact.id,
                )?.explanation
              }
            </p>
          </article>
        ))}
      </div>
      <h3>Source record</h3>
      <ul>
        {sources.map((asset) => (
          <li key={asset.id}>
            <strong>{asset.kind}</strong> · {asset.id}
            <small className="hash">SHA-256 {asset.sha256}</small>
          </li>
        ))}
      </ul>
      <h3>Merchant descriptions</h3>
      {descriptions.map((d) => (
        <article key={d.id}>
          <p>{d.text}</p>
          {d.raw_transcript && (
            <small>Raw transcript: {d.raw_transcript}</small>
          )}
        </article>
      ))}
      <h3>Generation history</h3>
      <ol>
        {(snapshot.generationHistory as Generation[]).map((g) => (
          <li key={g.id}>
            Image v{g.version} · {g.status} · {g.created_at}
            {g.correction && <p>Merchant correction: {g.correction.text}</p>}
          </li>
        ))}
      </ol>
      <h3>Verification history</h3>
      <ol>
        {(snapshot.verificationHistory as Verification[]).map((v) => (
          <li key={v.id}>
            Run {v.version} for image {v.generation_id} · {v.status}
            <p>{v.report?.summary}</p>
          </li>
        ))}
      </ol>
      <div className="actions">
        <button onClick={download}>Download passport JSON ↓</button>
        <button className="secondary" onClick={() => window.print()}>
          Print this passport
        </button>
      </div>
      <details>
        <summary>Full provenance, prompts, and version history</summary>
        <pre>{JSON.stringify(snapshot, null, 2)}</pre>
      </details>
    </section>
  );
}
