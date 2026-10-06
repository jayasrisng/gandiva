"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [business, setBusiness] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const client = createBrowserSupabaseClient();
      const result =
        mode === "sign-up"
          ? await client.auth.signUp({
              email,
              password,
              options: {
                data: { business_name: business },
                emailRedirectTo: `${location.origin}/auth/callback`,
              },
            })
          : await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (!result.data.session) {
        setMessage("Check your email to confirm your account.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setBusy(true);
    try {
      const { error } =
        await createBrowserSupabaseClient().auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${location.origin}/auth/callback` },
        });
      if (error) throw error;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Google sign in failed.");
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <Link className="brand" href="/">
        gandiva<span>PRODUCT TRUTH STUDIO</span>
      </Link>
      <section className="auth-card">
        <p className="eyebrow">YOUR PRIVATE PRODUCT WORKSPACE</p>
        <h1>
          {mode === "sign-up" ? "Start with what’s real." : "Welcome back."}
        </h1>
        <p>
          Create commercial images with a clear record of your product and its
          evidence.
        </p>
        <button className="secondary" disabled={busy} onClick={google}>
          Continue with Google
        </button>
        <div className="divider">or use email</div>
        <form onSubmit={submit}>
          {mode === "sign-up" && (
            <label>
              Business name
              <input
                value={business}
                onChange={(e) => setBusiness(e.target.value)}
                required
                autoComplete="organization"
              />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={
                mode === "sign-up" ? "new-password" : "current-password"
              }
            />
          </label>
          {message && (
            <p role="status" className="notice">
              {message}
            </p>
          )}
          <button disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "sign-up"
                ? "Create workspace"
                : "Sign in"}
          </button>
        </form>
        <p>
          {mode === "sign-up" ? "Have an account?" : "New here?"}{" "}
          <Link href={mode === "sign-up" ? "/auth/sign-in" : "/auth/sign-up"}>
            {mode === "sign-up" ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </section>
    </main>
  );
}
