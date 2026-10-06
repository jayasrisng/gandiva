"use client";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import type { Workflow } from "@/lib/products/repository";
import { post, readResponse } from "@/lib/client/api";
import { TruthEditor } from "@/components/truth/truth-editor";
import { VerificationReport } from "@/components/verification/report";
import { PassportView } from "@/components/passport/passport-view";
import { AddSources } from "@/components/capture/add-sources";
import { VoiceInput } from "@/components/capture/voice-input";
import { approvalIssues } from "@/lib/verification/policy";
export function ProductWorkflow({ initial }: { initial: Workflow }) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState(
    initial.product.status === "approved"
      ? "passport"
      : initial.truths.find((t) => t.id === initial.product.current_truth_id)
            ?.confirmed_at
        ? initial.generations.length
          ? "review"
          : "studio"
        : "truth",
  );
  const [selected, setSelected] = useState(
    initial.generations.at(-1)?.id || "",
  );
  const [sourceIndex, setSourceIndex] = useState(0);
  const [direction, setDirection] = useState(
    "Clean neutral studio background and soft balanced lighting. Keep the original product view.",
  );
  const [correction, setCorrection] = useState("");
  const [correctionSource, setCorrectionSource] = useState<{
    audioAssetId: string;
    rawTranscript: string;
  } | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [recordingKey] = useState(() => crypto.randomUUID());
  const [accepted, setAccepted] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const id = state.product.id;
  const active = state.jobs.some((j) =>
    ["queued", "running"].includes(j.status),
  );
  const truth = state.truths.find(
    (t) => t.id === state.product.current_truth_id,
  );
  const generation =
    state.generations.find((g) => g.id === selected) ||
    state.generations.at(-1);
  const verification = state.verifications
    .filter((v) => v.generation_id === generation?.id)
    .at(-1);
  const generationTruth = state.truths.find(
    (t) => t.id === generation?.truth_version_id,
  );
  const originals = state.assets.filter((a) => a.kind === "original");
  const source = originals[Math.min(sourceIndex, originals.length - 1)];
  const sourcePreview =
    source &&
    (!["image/jpeg", "image/png", "image/webp"].includes(source.mime)
      ? state.assets.find(
          (a) => a.parent_asset_id === source.id && a.kind === "derivative",
        )
      : source);
  const output = state.assets.find((a) => a.id === generation?.output_asset_id);
  const blockers =
    truth && verification?.report
      ? approvalIssues(truth.record, verification.report)
      : ["Complete verification before final approval."];
  if (generation && generation.truth_version_id !== truth?.id)
    blockers.push(
      "This image belongs to an earlier truth version. Generate against current truth.",
    );
  const unresolved =
    verification?.report?.attributes.filter((a) =>
      ["WARNING", "NOT VERIFIABLE"].includes(a.status),
    ) || [];
  const refresh = useCallback(async () => {
    const next = await readResponse<Workflow>(
      await fetch(`/api/products/${id}`, { cache: "no-store" }),
    );
    setState(next);
    return next;
  }, [id]);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      void refresh().catch((e) =>
        setError(e instanceof Error ? e.message : "Unable to refresh."),
      );
    }, 5000);
    return () => clearInterval(timer);
  }, [active, refresh]);
  async function action(name: string, body: unknown, then?: () => void) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await post(`/api/products/${id}/${name}`, body);
      await refresh();
      setAccepted(false);
      setWarnings([]);
      then?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    if (!truth) return;
    await action(
      "generate",
      { key: crypto.randomUUID(), truthId: truth.id, direction },
      () => {
        setSelected("");
        setTab("review");
        setMessage(
          "Your image is queued. Verification follows as a separate job.",
        );
      },
    );
  }
  const lastError =
    state.jobs.at(-1)?.status === "failed" ? state.jobs.at(-1) : undefined;
  return (
    <>
      <header className="page-header">
        <div>
          <Link className="breadcrumb" href="/dashboard">
            ← My products
          </Link>
          <p className="eyebrow">PRODUCT RECORD</p>
          <h1>{state.product.name}</h1>
          <p>Original sources → confirmed truth → verified presentation</p>
        </div>
        <span className="badge">
          {state.product.status.replaceAll("_", " ")}
        </span>
      </header>
      <nav className="workflow-tabs" aria-label="Product workflow">
        {[
          ["truth", "01 Product Truth"],
          ["studio", "02 Studio"],
          ["review", "03 Review & correct"],
          ["passport", "04 Passport"],
        ].map(([key, label]) => (
          <button
            className={tab === key ? "active" : ""}
            key={key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {active && (
        <div className="job-banner" role="status">
          <span className="spinner" />
          <div>
            <strong>
              {state.jobs
                .filter((j) => ["queued", "running"].includes(j.status))
                .map(
                  (j) =>
                    `${j.kind === "analyze" ? "Building Product Truth" : j.kind === "generate" ? "Creating commercial image" : "Comparing product details"} · ${j.status}`,
                )
                .join(", ")}
            </strong>
            <small>
              Your sources and versions are saved. You can return to this
              product later.
            </small>
          </div>
        </div>
      )}
      {lastError && !active && (
        <div className="error">
          <strong>A task did not complete.</strong> {lastError.error}
          <div className="actions">
            {lastError.kind === "analyze" && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  action("analyze", {
                    key: crypto.randomUUID(),
                    descriptionId: lastError.payload.descriptionId,
                  })
                }
              >
                Retry analysis
              </button>
            )}
            {lastError.kind === "generate" && truth?.confirmed_at && (
              <button className="secondary" disabled={busy} onClick={generate}>
                Create a new image attempt
              </button>
            )}
            {lastError.kind === "verify" &&
              generation &&
              truth?.confirmed_at && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    action("verify", {
                      key: crypto.randomUUID(),
                      truthId: truth.id,
                      generationId: generation.id,
                    })
                  }
                >
                  Retry verification
                </button>
              )}
          </div>
        </div>
      )}
      {tab === "truth" && (
        <>
          <section className="panel source-strip">
            <div className="section-heading">
              <h2>Original source evidence</h2>
              <span className="badge">{originals.length} photos</span>
            </div>
            <div className="source-thumbs">
              {originals.map((asset, n) => {
                const preview = [
                  "image/jpeg",
                  "image/png",
                  "image/webp",
                ].includes(asset.mime)
                  ? asset
                  : state.assets.find((a) => a.parent_asset_id === asset.id);
                return (
                  <a
                    key={asset.id}
                    href={asset.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img src={preview?.url} alt={`Original source ${n + 1}`} />
                    <small>Source {n + 1}</small>
                  </a>
                );
              })}
            </div>
            <AddSources
              productId={id}
              truthId={state.product.current_truth_id}
              remaining={6 - originals.length}
              disabled={busy || active}
              onAdded={refresh}
            />
            <details>
              <summary>Merchant words and retained recordings</summary>
              {state.descriptions.map((d) => (
                <article className="description" key={d.id}>
                  <small>
                    {d.language} · {new Date(d.created_at).toLocaleString()}
                  </small>
                  <p>{d.text}</p>
                  {d.raw_transcript && (
                    <details>
                      <summary>Unedited transcript</summary>
                      <p>{d.raw_transcript}</p>
                    </details>
                  )}
                  {d.audio_asset_id && (
                    <audio
                      controls
                      src={
                        state.assets.find((a) => a.id === d.audio_asset_id)?.url
                      }
                    />
                  )}
                </article>
              ))}
            </details>
          </section>
          {truth ? (
            <TruthEditor
              key={truth.id}
              truth={truth}
              assets={state.assets}
              busy={busy || active}
              onSave={(edits, note) =>
                action("truth", { truthId: truth.id, edits, note })
              }
              onConfirm={() =>
                action("confirm", { truthId: truth.id, confirmed: true }, () =>
                  setTab("studio"),
                )
              }
            />
          ) : (
            <section className="empty">
              <h2>
                {active
                  ? "Reading your sources…"
                  : "Product Truth is not ready."}
              </h2>
              <p>
                Your photos and description will be assessed separately, then
                reconciled for your review.
              </p>
            </section>
          )}
        </>
      )}
      {tab === "studio" && (
        <section className="panel studio-panel">
          <p className="eyebrow">COMMERCIAL IMAGE / REAL PRODUCT</p>
          <h2>A better setting. The same product.</h2>
          <p>
            Start with one image. Lighting, background, and framing can change;
            defining product details stay locked.
          </p>
          {!truth?.confirmed_at && (
            <div className="notice">
              Review and confirm Product Truth before generating.{" "}
              <button className="link-button" onClick={() => setTab("truth")}>
                Review truth →
              </button>
            </div>
          )}
          <label>
            Presentation direction
            <textarea
              rows={4}
              value={direction}
              maxLength={2000}
              onChange={(e) => setDirection(e.target.value)}
              disabled={busy || active}
            />
          </label>
          <div className="preservation-locks">
            <span className="eyebrow">LOCKED PRODUCT DETAILS</span>
            {truth?.record.facts
              .filter((f) => f.defining)
              .map((f) => (
                <span className="lock-chip" key={f.id}>
                  ⌑ {f.attribute}: {f.value || "Unknown"}
                </span>
              ))}
          </div>
          <p className="muted">
            Unknown or hidden surfaces should remain unexposed. Generation can
            still make mistakes; every output gets a separate comparison.
          </p>
          <button
            disabled={
              busy || active || !truth?.confirmed_at || !direction.trim()
            }
            onClick={generate}
          >
            {busy ? "Saving…" : "Generate one commercial image ↗"}
          </button>
        </section>
      )}
      {tab === "review" && (
        <>
          {state.generations.length > 0 ? (
            <>
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">VERSIONED IMAGE REVIEW</p>
                    <h2>Look closely at what changed.</h2>
                  </div>
                  <label className="version-select">
                    Image version
                    <select
                      value={generation?.id || ""}
                      onChange={(e) => {
                        setSelected(e.target.value);
                        setAccepted(false);
                        setWarnings([]);
                        setCorrection("");
                        setCorrectionSource(null);
                      }}
                    >
                      {state.generations.map((g) => (
                        <option value={g.id} key={g.id}>
                          v{g.version} · truth v
                          {
                            state.truths.find(
                              (t) => t.id === g.truth_version_id,
                            )?.version
                          }{" "}
                          · {g.status}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="comparison">
                  <article>
                    <div className="comparison-title">
                      <span>ORIGINAL</span>
                      <select
                        aria-label="Original photo"
                        value={sourceIndex}
                        onChange={(e) => setSourceIndex(Number(e.target.value))}
                      >
                        {originals.map((a, n) => (
                          <option key={a.id} value={n}>
                            Source {n + 1}
                          </option>
                        ))}
                      </select>
                    </div>
                    <a href={source?.url} target="_blank" rel="noreferrer">
                      <img
                        src={sourcePreview?.url}
                        alt="Original merchant product photo"
                      />
                    </a>
                  </article>
                  <article>
                    <div className="comparison-title">
                      <span>AI GENERATED · v{generation?.version}</span>
                      {output && (
                        <a href={output.url} target="_blank" rel="noreferrer">
                          Open full image ↗
                        </a>
                      )}
                    </div>
                    {output ? (
                      <a href={output.url} target="_blank" rel="noreferrer">
                        <img
                          src={output.url}
                          alt={`Generated product image version ${generation?.version}`}
                        />
                      </a>
                    ) : (
                      <div className="image-pending">
                        {generation?.status === "failed"
                          ? "Generation did not complete."
                          : "Your commercial image will appear here."}
                      </div>
                    )}
                  </article>
                </div>
                <p className="muted">
                  Open either image at full size to inspect small details. The
                  generated image remains clearly labeled.
                </p>
              </section>
              {verification && generationTruth && (
                <VerificationReport
                  verification={verification}
                  truth={generationTruth}
                />
              )}
              {output && truth?.confirmed_at && (
                <section className="panel">
                  <div className="section-heading">
                    <h2>Something changed?</h2>
                    <button
                      className="secondary"
                      disabled={
                        busy ||
                        active ||
                        generation?.truth_version_id !== truth.id
                      }
                      onClick={() =>
                        action("verify", {
                          key: crypto.randomUUID(),
                          truthId: truth.id,
                          generationId: generation?.id,
                        })
                      }
                    >
                      Run verification again
                    </button>
                  </div>
                  <p>
                    Explain what is wrong. The next version uses your original
                    photos, confirmed truth, and this correction.
                  </p>
                  <VoiceInput
                    key={generation?.id}
                    sessionKey={recordingKey}
                    language="mixed"
                    disabled={busy || active}
                    onActivity={setVoiceBusy}
                    onTranscript={(source) => {
                      void (async () => {
                        setBusy(true);
                        try {
                          const saved = await post<{ assetId: string }>(
                            `/api/products/${id}/recording`,
                            {
                              key: recordingKey,
                              file: source.upload,
                              text: source.rawTranscript,
                            },
                          );
                          setCorrection(source.rawTranscript);
                          setCorrectionSource({
                            audioAssetId: saved.assetId,
                            rawTranscript: source.rawTranscript,
                          });
                          await refresh();
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : "Could not retain recording.",
                          );
                        } finally {
                          setBusy(false);
                        }
                      })();
                    }}
                  />
                  <label>
                    Correction
                    <textarea
                      rows={3}
                      maxLength={4000}
                      value={correction}
                      onChange={(e) => setCorrection(e.target.value)}
                      placeholder="The border became too wide. Keep the original two gold bands…"
                      disabled={busy || active}
                    />
                  </label>
                  <button
                    disabled={busy || active || voiceBusy || !correction.trim()}
                    onClick={() =>
                      action(
                        "correct",
                        {
                          key: crypto.randomUUID(),
                          truthId: truth.id,
                          parentId: generation?.id,
                          direction: generation?.direction || direction,
                          correction: { text: correction, ...correctionSource },
                        },
                        () => {
                          setSelected("");
                          setCorrection("");
                          setCorrectionSource(null);
                          setAccepted(false);
                          setWarnings([]);
                          setMessage(
                            "Correction saved. A new version will be generated and verified.",
                          );
                        },
                      )
                    }
                  >
                    Correct and create a new version →
                  </button>
                </section>
              )}
              {verification?.status === "completed" && truth && (
                <section className="panel approval-panel">
                  <p className="eyebrow">FINAL MERCHANT APPROVAL</p>
                  <h2>Can you stand behind this image?</h2>
                  {blockers.length > 0 ? (
                    <div className="warning">
                      <strong>Resolve before approval</strong>
                      <ul>
                        {blockers.map((item, n) => (
                          <li key={n}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <>
                      {unresolved.map((item) => (
                        <label className="check" key={item.factId}>
                          <input
                            type="checkbox"
                            checked={warnings.includes(item.factId)}
                            onChange={(e) =>
                              setWarnings((current) =>
                                e.target.checked
                                  ? [...current, item.factId]
                                  : current.filter((x) => x !== item.factId),
                              )
                            }
                          />
                          I acknowledge{" "}
                          {
                            truth.record.facts.find((f) => f.id === item.factId)
                              ?.attribute
                          }
                          : {item.status.toLowerCase()} — {item.explanation}
                        </label>
                      ))}
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={accepted}
                          onChange={(e) => setAccepted(e.target.checked)}
                        />
                        I compared the original and generated images and confirm
                        that this image accurately represents my real product.
                      </label>
                      <button
                        disabled={
                          busy ||
                          active ||
                          !accepted ||
                          unresolved.some((a) => !warnings.includes(a.factId))
                        }
                        onClick={() =>
                          action(
                            "approve",
                            {
                              truthId: truth.id,
                              generationId: generation?.id,
                              verificationId: verification.id,
                              confirmed: true,
                              warnings,
                            },
                            () => setTab("passport"),
                          )
                        }
                      >
                        Approve image & create Passport →
                      </button>
                    </>
                  )}
                </section>
              )}
              <details className="panel">
                <summary>Generation and verification history</summary>
                <ol>
                  {state.generations.map((g) => (
                    <li key={g.id}>
                      <strong>Image v{g.version}</strong> · {g.status} ·{" "}
                      {new Date(g.created_at).toLocaleString()}
                      {g.correction && (
                        <p>Merchant correction: {g.correction.text}</p>
                      )}
                      {state.verifications
                        .filter((v) => v.generation_id === g.id)
                        .map((v) => (
                          <p key={v.id}>
                            Verification run {v.version} · {v.status} ·{" "}
                            {v.report?.summary}
                          </p>
                        ))}
                    </li>
                  ))}
                </ol>
              </details>
            </>
          ) : (
            <section className="empty">
              <h2>Your commercial image belongs here.</h2>
              <p>
                Confirm Product Truth, then generate an image in the studio.
              </p>
              <button
                onClick={() => setTab(truth?.confirmed_at ? "studio" : "truth")}
              >
                Continue →
              </button>
            </section>
          )}
        </>
      )}
      {tab === "passport" &&
        (state.passports.length ? (
          state.passports.map((passport) => (
            <PassportView key={passport.id} passport={passport} />
          ))
        ) : (
          <section className="empty">
            <span className="empty-symbol">◇</span>
            <h2>A record you can stand behind.</h2>
            <p>
              Your Passport is created after verification and final merchant
              approval.
              <br />
              It includes sources, claims, visual support, uncertainty, every
              version, and your decision.
            </p>
            <button onClick={() => setTab("review")}>
              Review your image →
            </button>
          </section>
        ))}
    </>
  );
}
