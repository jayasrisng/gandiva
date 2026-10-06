import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { mockServices } from "../tests/mock-services.mjs";
const services = await mockServices();
const origin = "http://localhost:3100";
const supabase = "http://127.0.0.1:4100";
const child = spawn("pnpm", ["dev", "--port", "3100"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: supabase,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-service",
    CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
    OPENAI_API_KEY: "fixture-openai",
    OPENAI_BASE_URL: supabase + "/v1",
    JOB_RUNNER_SECRET: "fixture-runner",
  },
  detached: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stdout.on("data", (d) => {
  logs += d;
});
child.stderr.on("data", (d) => {
  logs += d;
});
let stopped = false;
async function cleanup() {
  if (stopped) return;
  stopped = true;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
  await services.close();
}
process.on("SIGINT", () => {
  void cleanup().then(() => process.exit());
});
try {
  for (let n = 0; n < 40; n++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    if (n === 39) throw new Error("Preview did not start. " + logs);
    await new Promise((r) => setTimeout(r, 500));
  }
  const cookies = [];
  const client = createServerClient(supabase, "fixture-public", {
    cookies: {
      getAll: () => cookies,
      setAll: (values) => {
        for (const value of values) {
          const prior = cookies.find((c) => c.name === value.name);
          if (prior) Object.assign(prior, value);
          else cookies.push(value);
        }
      },
    },
  });
  const auth = await client.auth.signInWithPassword({
    email: "fixture@gandiva.test",
    password: "fixture-existing-password",
  });
  if (auth.error) throw auth.error;
  const headers = {
    "Content-Type": "application/json",
    cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
  };
  const post = async (path, body) => {
    const response = await fetch(origin + path, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = await response.json();
    assert.ok(response.ok, JSON.stringify(data));
    return data;
  };
  const get = async (id) => {
    const response = await fetch(origin + `/api/products/${id}`, { headers });
    assert.ok(response.ok);
    return response.json();
  };
  const source = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const key = crypto.randomUUID();
  const tickets = await post("/api/uploads", {
    key,
    files: [
      {
        kind: "original",
        mime: "image/png",
        size: source.length,
        parentIndex: null,
      },
    ],
  });
  const ticket = tickets.uploads[0];
  const storage = createClient(supabase, "fixture-public");
  const upload = await storage.storage
    .from(ticket.bucket)
    .uploadToSignedUrl(ticket.path, ticket.token, source, {
      contentType: "image/png",
    });
  if (upload.error) throw upload.error;
  const intake = await post("/api/products", {
    key,
    files: tickets.uploads,
    description: {
      text: "This blue saree is pure silk",
      raw_transcript: null,
      language: "mixed",
      model: null,
    },
  });
  const id = intake.productId;
  const wait = async (predicate) => {
    for (let n = 0; n < 40; n++) {
      const state = await get(id);
      if (predicate(state)) return state;
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error("Workflow timed out. " + logs);
  };
  let state = await wait((s) => s.truths.length);
  const truthId = state.product.current_truth_id;
  await post(`/api/products/${id}/confirm`, { truthId, confirmed: true });
  await post(`/api/products/${id}/generate`, {
    key: crypto.randomUUID(),
    truthId,
    direction: "Neutral studio",
  });
  state = await wait((s) =>
    s.verifications.some((v) => v.status === "completed"),
  );
  const originalGeneration = state.generations[0];
  const verification = state.verifications[0];
  assert.equal(
    verification.report.attributes.find((a) => a.factId === "composition")
      .status,
    "NOT VERIFIABLE",
  );
  await post(`/api/products/${id}/correct`, {
    key: crypto.randomUUID(),
    truthId,
    parentId: originalGeneration.id,
    direction: "Neutral studio",
    correction: { text: "Keep the original blue color" },
  });
  state = await wait(
    (s) =>
      s.generations.length === 2 &&
      s.verifications.length === 2 &&
      s.verifications[1].status === "completed",
  );
  assert.equal(
    state.generations[0].output_asset_id,
    originalGeneration.output_asset_id,
  );
  assert.equal(state.assets.filter((a) => a.kind === "generated").length, 2);
  const selected = state.generations[1];
  const run = state.verifications[1];
  await post(`/api/products/${id}/approve`, {
    truthId,
    generationId: selected.id,
    verificationId: run.id,
    confirmed: true,
    warnings: ["composition"],
  });
  state = await get(id);
  assert.equal(state.product.status, "approved");
  assert.equal(state.passports.length, 1);
  assert.equal(state.passports[0].snapshot.generationHistory.length, 2);
  assert.equal(
    state.passports[0].snapshot.finalApproval.generationId,
    selected.id,
  );
  const unauthorized = await fetch(origin + `/api/products/${id}`);
  assert.equal(unauthorized.status, 401);
  console.log(
    "PASS: HTTP integration — signed upload, extraction, confirmation, generation, separate verification, correction history, approval, passport, authentication. Provider responses were local fixtures.",
  );
  if (process.argv.includes("--serve")) {
    console.log(
      `Local fixture browser test: ${origin}/auth/sign-in (fixture@gandiva.test / fixture-existing-password). Product: ${id}`,
    );
    await new Promise(() => {});
  }
} catch (error) {
  console.error(error);
  console.error(logs);
  process.exitCode = 1;
} finally {
  await cleanup();
}
