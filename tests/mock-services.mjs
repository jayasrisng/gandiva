// Local integration harness ONLY. Never imported by application or deployment code.
// No external network, no live Supabase project, no provider billing.
import http from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  truth as fixtureTruth,
  report as fixtureReport,
} from "./fixtures/truth.ts";
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export async function mockServices(port = 4100) {
  const db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}'); create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint); create table storage.objects(id uuid primary key,bucket_id text,name text); create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;`,
  );
  const migrationDirectory = new URL(
    "../supabase/migrations/",
    import.meta.url,
  );
  for (const name of (await readdir(migrationDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(new URL(name, migrationDirectory), "utf8");
    await db.exec(sql.replace("create extension if not exists pgcrypto;", ""));
  }
  await db.query("insert into auth.users(id) values($1)", [owner]);
  const objects = new Map();
  let lastSourceId = "11111111-1111-4111-8111-111111111111";
  const user = {
    id: owner,
    aud: "authenticated",
    role: "authenticated",
    email: "fixture@gandiva.test",
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { business_name: "Maanvi · local test fixture" },
    identities: [],
    created_at: new Date().toISOString(),
  };
  const token =
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ) +
    "." +
    Buffer.from(
      JSON.stringify({
        sub: owner,
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
        role: "authenticated",
      }),
    ).toString("base64url") +
    ".test";
  const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const path = decodeURIComponent(url.pathname);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    const json = (data, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    try {
      const body = () => (raw.length ? JSON.parse(raw.toString()) : {});
      if (path.startsWith("/auth/v1/")) {
        if (path.endsWith("/user")) return json(user);
        if (path.endsWith("/logout")) return json({});
        return json({
          access_token: token,
          refresh_token: "fixture-refresh",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          token_type: "bearer",
          user,
        });
      }
      if (path.startsWith("/rest/v1/rpc/")) {
        const name = path.split("/").pop();
        if (!/^gandiva_[a-z_]+$/.test(name))
          throw new Error("Unknown test RPC");
        const input = body();
        const keys = Object.keys(input);
        const values = keys.map((k) =>
          k !== "p_warnings" &&
          typeof input[k] === "object" &&
          input[k] !== null
            ? JSON.stringify(input[k])
            : input[k],
        );
        if (name === "gandiva_claim_job")
          return json(
            (await db.query("select * from gandiva_claim_job()")).rows,
          );
        const result = await db.query(
          `select public.${name}(${keys.map((k, n) => `${k}=>$${n + 1}`).join(",")}) result`,
          values,
        );
        return json(result.rows[0]?.result ?? null);
      }
      if (path.startsWith("/rest/v1/")) {
        const table = path.split("/").pop();
        if (
          ![
            "products",
            "product_assets",
            "product_descriptions",
            "source_transcripts",
            "truth_versions",
            "generations",
            "verification_runs",
            "jobs",
            "approvals",
            "passports",
          ].includes(table)
        )
          throw new Error("Unknown fixture table");
        let rows;
        if (req.method === "POST") {
          const input = body();
          const items = Array.isArray(input) ? input : [input];
          rows = [];
          for (const item of items) {
            const keys = Object.keys(item);
            const values = keys.map((k) =>
              typeof item[k] === "object" && item[k] !== null
                ? JSON.stringify(item[k])
                : item[k],
            );
            const result = await db.query(
              `insert into ${table}(${keys.join(",")}) values(${keys.map((_, n) => `$${n + 1}`).join(",")}) returning *`,
              values,
            );
            rows.push(...result.rows);
          }
        } else {
          const filters = [];
          const values = [];
          for (const [key, value] of url.searchParams) {
            if (["select", "order", "limit"].includes(key)) continue;
            if (!/^[a-z_]+$/.test(key) || !value.startsWith("eq."))
              throw new Error("Unsupported test filter");
            values.push(value.slice(3));
            filters.push(`${key}=$${values.length}`);
          }
          const order = url.searchParams.get("order")?.split(".");
          const orderSql =
            order && /^[a-z_]+$/.test(order[0])
              ? ` order by ${order[0]} ${order[1] === "desc" ? "desc" : "asc"}`
              : "";
          const limit = url.searchParams.get("limit");
          const limitSql =
            limit && /^\d+$/.test(limit) ? ` limit ${limit}` : "";
          rows = (
            await db.query(
              `select * from ${table}${filters.length ? " where " + filters.join(" and ") : ""}${orderSql}${limitSql}`,
              values,
            )
          ).rows;
        }
        return json(
          req.headers.accept?.includes("vnd.pgrst.object")
            ? (rows[0] ?? null)
            : rows,
        );
      }
      if (path.startsWith("/storage/v1/")) {
        const objectPath = path.slice("/storage/v1".length);
        if (objectPath === "/object/move") {
          const b = body();
          const from = `${b.bucketId}/${b.sourceKey}`;
          const to = `${b.bucketId}/${b.destinationKey}`;
          if (!objects.has(from)) throw new Error("Missing staged object");
          objects.set(to, objects.get(from));
          objects.delete(from);
          return json({ message: "Successfully moved" });
        }
        if (objectPath.startsWith("/object/upload/sign/")) {
          const key = objectPath.slice("/object/upload/sign/".length);
          if (req.method === "POST")
            return json({
              url: `/object/upload/sign/${key}?token=fixture-token`,
            });
          if (objects.has(key)) throw new Error("Cannot overwrite source");
          let bytes = raw;
          let mime = req.headers["content-type"] || "image/jpeg";
          if (mime.startsWith("multipart/")) {
            const form = await new Response(raw, {
              headers: { "Content-Type": mime },
            }).formData();
            const file = [...form.values()].find((v) => v instanceof File);
            bytes = Buffer.from(await file.arrayBuffer());
            mime = file.type;
          }
          objects.set(key, { bytes, mime });
          return json({ Key: key });
        }
        if (objectPath.startsWith("/object/sign/") && req.method === "POST")
          return json({ signedURL: `${objectPath}?token=fixture-read` });
        if (objectPath.startsWith("/object/") && req.method === "POST") {
          const key = objectPath.slice("/object/".length);
          objects.set(key, { bytes: raw, mime: req.headers["content-type"] });
          return json({ Key: key });
        }
        const key = objectPath
          .replace(/^\/object\/(authenticated|sign)\//, "")
          .replace(/^\/object\//, "");
        const object = objects.get(key);
        if (!object) return json({ message: "Not found" }, 404);
        res.writeHead(200, { "Content-Type": object.mime });
        res.end(object.bytes);
        return;
      }
      if (path === "/v1/responses") {
        const input = body();
        const name = input.text.format.name;
        const content = input.input[0].content;
        const sourceLabel = content.find(
          (c) =>
            c.type === "input_text" && c.text.startsWith("SOURCE IMAGE ID: "),
        );
        if (sourceLabel)
          lastSourceId = sourceLabel.text.slice("SOURCE IMAGE ID: ".length);
        const truth = structuredClone(fixtureTruth);
        truth.title = "TEST FIXTURE · Maanvi blue saree";
        truth.facts[0].visualEvidence[0].sourceAssetIds = [lastSourceId];
        const report = structuredClone(fixtureReport);
        report.attributes[0].sourceAssetIds = [lastSourceId];
        const data =
          name === "merchant_claims"
            ? { claims: truth.facts.flatMap((f) => f.merchantClaims) }
            : name === "visual_observations"
              ? {
                  observations: truth.facts.flatMap((f) => f.visualEvidence),
                  missingEvidence: [],
                }
              : name === "product_truth"
                ? truth
                : report;
        return json({
          id: "resp_fixture",
          object: "response",
          created_at: Date.now() / 1000,
          status: "completed",
          model: "fixture",
          output: [
            {
              id: "msg_fixture",
              type: "message",
              role: "assistant",
              status: "completed",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify(data),
                  annotations: [],
                },
              ],
            },
          ],
        });
      }
      if (path === "/v1/images/edits") {
        // Copy source bytes as a deterministic mock output, not an AI result.
        const image = [...objects.entries()].find(
          ([key]) =>
            key.startsWith("product-images/") && !key.includes("/intake/"),
        )?.[1];
        if (!image) throw new Error("No fixture source");
        return json({
          created: Date.now() / 1000,
          data: [{ b64_json: image.bytes.toString("base64") }],
        });
      }
      if (path === "/v1/audio/transcriptions")
        return json({
          text: "ఇది blue saree, pure silk అని merchant చెప్పారు.",
        });
      return json({ error: "Unknown local test endpoint " + path }, 404);
    } catch (error) {
      console.error("Mock service:", path, error.message);
      json({ message: error.message, code: "MOCK_ERROR" }, 400);
    }
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    db,
    server,
    owner,
    token,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await db.close();
    },
  };
}
