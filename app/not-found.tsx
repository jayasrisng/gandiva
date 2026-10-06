import Link from "next/link";
export default function NotFound() {
  return (
    <main className="setup">
      <h1>Product not found.</h1>
      <p>This product may belong to another workspace.</p>
      <Link href="/dashboard">My products</Link>
    </main>
  );
}
