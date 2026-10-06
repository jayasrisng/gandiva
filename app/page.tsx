import Link from "next/link";
export default function Home() {
  return (
    <main className="landing">
      <nav>
        <Link className="brand" href="/">
          gandiva<span>PRODUCT TRUTH STUDIO</span>
        </Link>
        <Link href="/auth/sign-in" className="button secondary">
          Sign in
        </Link>
      </nav>
      <section className="hero">
        <p className="eyebrow">REAL PRODUCTS. CLEAR EVIDENCE.</p>
        <h1>
          Beautiful images.
          <br />
          <em>Grounded in truth.</em>
        </h1>
        <p>
          Start with your product photos and your own words. Review what is
          claimed, what is visible, and what remains unknown—then create a
          commercial image you can stand behind.
        </p>
        <Link className="button" href="/auth/sign-up">
          Create your workspace ↗
        </Link>
        <Link className="text-link" href="/auth/sign-in">
          Already have an account? Sign in
        </Link>
      </section>
      <section className="landing-flow">
        {[
          "Source",
          "Claims",
          "Product Truth",
          "Generation",
          "Verification",
          "Correction",
          "Approval",
        ].map((stage, n) => (
          <div key={stage}>
            <span>0{n + 1}</span>
            <strong>{stage}</strong>
          </div>
        ))}
      </section>
      <section className="landing-note">
        <h2>Your product stays the source of truth.</h2>
        <p>
          Merchant statements stay separate from photographic evidence. Every
          generated version gets its own comparison report, and your final
          approval becomes part of a Product Truth Passport.
        </p>
        <small>
          Photographic comparison does not certify material composition, origin,
          or authenticity.
        </small>
      </section>
    </main>
  );
}
