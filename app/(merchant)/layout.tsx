import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";
export const dynamic = "force-dynamic";
export default async function MerchantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL)
    return (
      <main className="setup">
        <Link className="brand" href="/">
          gandiva
        </Link>
        <h1>Your studio is ready for setup.</h1>
        <p>
          Configure a dedicated Gandiva Supabase project and apply the migration
          in <code>supabase/migrations</code>. Add its keys and your OpenAI key
          to <code>.env.local</code>, then restart the development server.
        </p>
        <p>
          See the project README for the Gandiva setup steps.
        </p>
        <Link href="/">Back to Gandiva</Link>
      </main>
    );
  const user = await getAuthenticatedUser();
  if (!user) redirect("/auth/sign-in");
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/dashboard" className="brand">
          gandiva<span>PRODUCT TRUTH STUDIO</span>
        </Link>
        <nav>
          <Link href="/dashboard">▦ &nbsp; My products</Link>
          <Link href="/products/new">＋ &nbsp; Add a product</Link>
        </nav>
        <div className="sidebar-note">
          <span className="eyebrow">THE GANDIVA PROMISE</span>
          <p>
            Preserve the product.
            <br />
            Disclose the uncertainty.
          </p>
        </div>
        <div className="account">
          <span>{user.user_metadata.business_name || user.email}</span>
          <SignOutButton />
        </div>
      </aside>
      <main className="workspace">{children}</main>
    </div>
  );
}
