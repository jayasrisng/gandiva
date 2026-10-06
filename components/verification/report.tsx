import type { Verification, TruthVersion } from "@/lib/products/repository";
export function VerificationReport({
  verification,
  truth,
}: {
  verification: Verification;
  truth: TruthVersion;
}) {
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            INDEPENDENT COMPARISON / RUN {verification.version}
          </p>
          <h2>Verification results</h2>
        </div>
        <span className="badge">{verification.status}</span>
      </div>
      {verification.report ? (
        <>
          <p>{verification.report.summary}</p>
          <div className="verification-list">
            {verification.report.attributes.map((item) => (
              <article key={item.factId}>
                <div>
                  <strong>
                    {truth.record.facts.find((f) => f.id === item.factId)
                      ?.attribute || item.factId}
                  </strong>
                  <span
                    className={`badge ${item.status.toLowerCase().replaceAll(" ", "-")}`}
                  >
                    {item.status}
                  </span>
                </div>
                <p>{item.explanation}</p>
                {item.originalRegion && (
                  <small>Original: {item.originalRegion}</small>
                )}
                {item.generatedRegion && (
                  <small>Generated: {item.generatedRegion}</small>
                )}
              </article>
            ))}
          </div>
          <p className="muted">
            PASS means the available visual evidence supports preservation. It
            is not a material, origin, or authenticity certification.
          </p>
        </>
      ) : (
        <p className="notice">
          {verification.status === "failed"
            ? "Verification failed to run. This is not an attribute verdict. Retry verification."
            : "Comparing originals, confirmed truth, and this generated image…"}
        </p>
      )}
    </section>
  );
}
