"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="setup">
      <h1>The studio could not load this record.</h1>
      <p>
        Check your connection and project configuration. Saved source files and
        version history are retained.
      </p>
      <button onClick={reset}>Try again</button>{" "}
      <Link href="/dashboard">My products</Link>
    </main>
  );
}
