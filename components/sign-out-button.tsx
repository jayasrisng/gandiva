"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  async function signOut() {
    setWorking(true);
    await createBrowserSupabaseClient().auth.signOut();
    router.replace("/");
    router.refresh();
  }
  return (
    <button
      type="button"
      className={compact ? "merchant-signout compact" : "merchant-signout"}
      onClick={signOut}
      disabled={working}
    >
      {working ? "Signing out…" : "Sign out"}
    </button>
  );
}
