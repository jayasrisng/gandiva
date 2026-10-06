"use client";
import { useState } from "react";
import type { TruthVersion, Asset } from "@/lib/products/repository";
export function TruthEditor({
  truth,
  assets,
  busy,
  onSave,
  onConfirm,
}: {
  truth: TruthVersion;
  assets: Asset[];
  busy: boolean;
  onSave: (edits: Record<string, string>, note: string) => Promise<void>;
  onConfirm: () => Promise<void>;
}) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const changed = Object.entries(edits).some(
    ([id, value]) =>
      value !== (truth.record.facts.find((f) => f.id === id)?.value ?? ""),
  );
  return (
    <section className="panel truth-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">PRODUCT TRUTH / VERSION {truth.version}</p>
          <h2>What we know. How we know it.</h2>
        </div>
        <span className={`badge ${truth.confirmed_at ? "pass" : ""}`}>
          {truth.confirmed_at ? "Merchant confirmed" : "Draft for review"}
        </span>
      </div>
      <p>
        Confirmation records your review. It does not turn a merchant claim into
        independently verified evidence.
      </p>
      <div className="truth-facts">
        {truth.record.facts.map((fact) => (
          <article key={fact.id} className="truth-fact">
            <div className="fact-title">
              <strong>{fact.attribute}</strong>
              {fact.defining && <span className="badge">Defining detail</span>}
            </div>
            <label>
              Product value
              <input
                aria-label={`Value for ${fact.attribute}`}
                value={edits[fact.id] ?? fact.value ?? ""}
                placeholder="Unknown"
                disabled={busy}
                onChange={(e) =>
                  setEdits((current) => ({
                    ...current,
                    [fact.id]: e.target.value,
                  }))
                }
              />
            </label>
            <div className="evidence-grid">
              <div>
                <span className="evidence-label claim">MERCHANT CLAIM</span>
                {fact.merchantClaims.length ? (
                  fact.merchantClaims.map((claim, n) => (
                    <p key={n}>
                      “{claim.quote}”<small>{claim.value}</small>
                    </p>
                  ))
                ) : (
                  <p className="muted">Not explicitly stated</p>
                )}
              </div>
              <div>
                <span className="evidence-label visible">
                  VISUALLY SUPPORTED
                </span>
                {fact.visualEvidence.length ? (
                  fact.visualEvidence.map((e, n) => (
                    <div key={n}>
                      <p>
                        {e.value}
                        {e.uncertainty && <small>{e.uncertainty}</small>}
                      </p>
                      <div className="evidence-links">
                        {e.sourceAssetIds.map((id) => (
                          <a
                            key={id}
                            target="_blank"
                            rel="noreferrer"
                            href={assets.find((a) => a.id === id)?.url}
                          >
                            Source{" "}
                            {assets
                              .filter((a) => a.kind === "original")
                              .findIndex((a) => a.id === id) + 1}{" "}
                            ↗
                          </a>
                        ))}
                      </div>
                      {e.region && <small>{e.region}</small>}
                    </div>
                  ))
                ) : (
                  <p className="muted">No photographic support</p>
                )}
              </div>
            </div>
            {fact.inference && (
              <p className="evidence-note">
                <span className="evidence-label inferred">INFERRED</span>{" "}
                {fact.inference}
              </p>
            )}
            {fact.unverifiableReason && (
              <p className="evidence-note">
                <span className="evidence-label unknown">NOT VERIFIABLE</span>{" "}
                {fact.unverifiableReason}
              </p>
            )}
            {fact.conflict && (
              <p className="warning">
                <strong>Conflicting evidence:</strong> {fact.conflict}
              </p>
            )}
          </article>
        ))}
      </div>
      {truth.record.missingEvidence.length > 0 && (
        <div className="notice">
          <strong>More evidence would help</strong>
          <ul>
            {truth.record.missingEvidence.map((item, n) => (
              <li key={n}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {changed && (
        <>
          <label>
            Revision note
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={4000}
              placeholder="Explain the change in your own words."
            />
          </label>
          <button disabled={busy} onClick={() => onSave(edits, note)}>
            Save a new truth version
          </button>
          <p className="muted">
            Your changes are recorded as merchant statements; existing visual
            evidence remains attached.
          </p>
        </>
      )}
      {!truth.confirmed_at && !changed && (
        <div className="confirmation">
          <label className="check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I reviewed this record and understand which facts are my claims and
            which have photographic support.
          </label>
          <button disabled={busy || !confirmed} onClick={onConfirm}>
            Confirm Product Truth →
          </button>
        </div>
      )}
      {truth.confirmed_at && (
        <p className="muted">
          Editing creates a new draft version and requires a new confirmation,
          verification, and final approval.
        </p>
      )}
    </section>
  );
}
