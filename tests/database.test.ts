import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { truth, report } from "./fixtures/truth.ts";
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const product = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const source = "11111111-1111-4111-8111-111111111111";
test("PostgreSQL transactions enforce the full versioned truth loop and tenant isolation", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}'); create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint); create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
 grant usage on schema public,auth,storage to authenticated; grant select on storage.objects to authenticated; grant execute on function auth.uid() to authenticated;`);
  const sql = await readFile(
    new URL("../supabase/migrations/202610050001_gandiva.sql", import.meta.url),
    "utf8",
  );
  // PGlite has core gen_random_uuid(); the extension installation is a Supabase setup step.
  await db.exec(sql.replace("create extension if not exists pgcrypto;", ""));
  await db.query("insert into auth.users(id) values($1),($2)", [owner, other]);
  const rpc = async (name: string, args: unknown[]) => {
    const placeholders = args.map((_, i) => `$${i + 1}`).join(",");
    return (
      await db.query<Record<string, unknown>>(
        `select public.${name}(${placeholders}) result`,
        args,
      )
    ).rows[0]?.result;
  };
  const scalar = async (sql: string, args: unknown[] = []) =>
    (await db.query<Record<string, unknown>>(sql, args)).rows[0];
  await t.test(
    "intake is atomic and deduplicates concurrent-session retries",
    async () => {
      const assets = [
        {
          id: source,
          kind: "original",
          bucket: "product-images",
          path: `${owner}/${product}/${source}.jpg`,
          mime: "image/jpeg",
          size_bytes: 100,
          sha256: "hash",
          parent_asset_id: null,
        },
      ];
      const args = [
        owner,
        product,
        "intake-12345",
        JSON.stringify(assets),
        JSON.stringify({ text: "blue pure silk", language: "mixed" }),
      ];
      assert.equal(await rpc("gandiva_intake", args), product);
      assert.equal(await rpc("gandiva_intake", args), product);
      assert.equal(
        (await scalar("select count(*)::int count from products"))?.count,
        1,
      );
    },
  );
  const claim = async () =>
    (
      await db.query<Record<string, unknown>>(
        "select * from gandiva_claim_job()",
      )
    ).rows[0];
  let job = await claim();
  assert.ok(job);
  await rpc("gandiva_finish_job", [
    job.id,
    job.lease_token,
    JSON.stringify({ truth, metadata: {}, sourceIds: [source] }),
    null,
  ]);
  let current = await scalar("select * from truth_versions");
  assert.ok(current);
  await t.test("generation requires confirmed current truth", async () => {
    await assert.rejects(
      () =>
        rpc("gandiva_enqueue", [
          owner,
          product,
          "generate",
          "generate-123",
          JSON.stringify({ truthId: current!.id, direction: "Studio" }),
        ]),
      /Confirm/,
    );
    await rpc("gandiva_confirm_truth", [owner, product, current!.id]);
    await assert.rejects(
      () =>
        db.query("update truth_versions set record=$1 where id=$2", [
          JSON.stringify({ ...truth, title: "Invented" }),
          current!.id,
        ]),
      /immutable/,
    );
  });
  await rpc("gandiva_enqueue", [
    owner,
    product,
    "generate",
    "generation-12345",
    JSON.stringify({ truthId: current.id, direction: "Neutral studio" }),
  ]);
  job = await claim();
  const firstGeneration = (job.payload as Record<string, unknown>).generationId;
  await rpc("gandiva_finish_job", [
    job.id,
    job.lease_token,
    JSON.stringify({ prompt: "Preserve blue", model: "test" }),
    JSON.stringify({
      id: "22222222-2222-4222-8222-222222222222",
      path: `${owner}/${product}/generated/v1.png`,
      mime: "image/png",
      size_bytes: 100,
      sha256: "output-hash",
    }),
  ]);
  job = await claim();
  const verificationId = (job.payload as Record<string, unknown>)
    .verificationId;
  await rpc("gandiva_finish_job", [
    job.id,
    job.lease_token,
    JSON.stringify({ report, metadata: { model: "verifier" } }),
    null,
  ]);
  await t.test("verification completion is fenced and retained", async () => {
    await assert.rejects(
      () =>
        rpc("gandiva_finish_job", [
          job.id,
          job.lease_token,
          JSON.stringify({ report, metadata: {} }),
          null,
        ]),
      /Stale/,
    );
    await assert.rejects(
      () =>
        db.query("update verification_runs set report=$1 where id=$2", [
          JSON.stringify({ ...report, summary: "Changed" }),
          verificationId,
        ]),
      /immutable/,
    );
  });
  await t.test(
    "database approval rejects changed, hidden, foreign and duplicate evidence",
    async () => {
      for (const [label, attributes, pattern] of [
        [
          "changed",
          [{ ...report.attributes[0], status: "FAIL" }, report.attributes[1]],
          /Unresolved/,
        ],
        [
          "hidden",
          [
            { ...report.attributes[0], status: "NOT VERIFIABLE" },
            report.attributes[1],
          ],
          /Unresolved/,
        ],
        [
          "unsupported",
          [report.attributes[0], { ...report.attributes[1], status: "PASS" }],
          /Unsupported/,
        ],
        [
          "foreign",
          [
            {
              ...report.attributes[0],
              sourceAssetIds: ["99999999-9999-4999-8999-999999999999"],
            },
            report.attributes[1],
          ],
          /Foreign/,
        ],
        [
          "duplicate",
          [report.attributes[0], report.attributes[0]],
          /duplicate/,
        ],
      ] as const) {
        await db.exec("begin");
        try {
          const row = await scalar(
            "insert into verification_runs(product_id,owner_id,generation_id,truth_version_id,version,status,report) values($1,$2,$3,$4,2,'completed',$5) returning id",
            [
              product,
              owner,
              firstGeneration,
              current!.id,
              JSON.stringify({ ...report, attributes }),
            ],
          );
          await assert.rejects(
            () =>
              rpc("gandiva_approve", [
                owner,
                product,
                current!.id,
                firstGeneration,
                row!.id,
                ["composition"],
                "{}",
                "hash",
              ]),
            pattern,
            label,
          );
        } finally {
          await db.exec("rollback");
        }
      }
    },
  );
  await t.test(
    "unverifiable claims require explicit acknowledgment",
    async () => {
      const args = [
        owner,
        product,
        current!.id,
        firstGeneration,
        verificationId,
        [],
        JSON.stringify({ manifest: {} }),
        "manifest-hash",
      ];
      await assert.rejects(() => rpc("gandiva_approve", args), /Acknowledge/);
      args[5] = ["composition"];
      const passport = await rpc("gandiva_approve", args);
      assert.ok(passport);
      assert.equal(
        (await scalar("select status from products where id=$1", [product]))
          ?.status,
        "approved",
      );
    },
  );
  await t.test(
    "correcting an image keeps the first output and its verification",
    async () => {
      await rpc("gandiva_enqueue", [
        owner,
        product,
        "generate",
        "correction-12345",
        JSON.stringify({
          truthId: current!.id,
          parentId: firstGeneration,
          direction: "Studio",
          correction: { text: "Preserve exact border" },
        }),
      ]);
      assert.equal(
        (await scalar("select count(*)::int count from generations"))?.count,
        2,
      );
      assert.equal(
        (await scalar("select count(*)::int count from verification_runs"))
          ?.count,
        1,
      );
      assert.equal(
        (
          await scalar(
            "select count(*)::int count from product_assets where kind='generated'",
          )
        )?.count,
        1,
      );
    },
  );
  job = await claim();
  await rpc("gandiva_fail_job", [
    job.id,
    job.lease_token,
    "Provider unavailable",
  ]);
  await t.test(
    "a truth revision invalidates stale generation approval",
    async () => {
      const newTruth = await rpc("gandiva_save_truth", [
        owner,
        product,
        current!.id,
        JSON.stringify({ ...truth, title: "Corrected blue saree" }),
        "Merchant revision",
      ]);
      await assert.rejects(
        () =>
          rpc("gandiva_approve", [
            owner,
            product,
            current!.id,
            firstGeneration,
            verificationId,
            ["composition"],
            "{}",
            "hash",
          ]),
        /Stale/,
      );
      current = await scalar("select * from truth_versions where id=$1", [
        newTruth,
      ]);
      assert.equal(current!.confirmed_at, null);
    },
  );
  await t.test(
    "new detail photos invalidate current truth without deleting history",
    async () => {
      await db.exec("begin");
      try {
        const photoId = "33333333-3333-4333-8333-333333333333";
        const assets = [
          {
            id: photoId,
            kind: "original",
            bucket: "product-images",
            path: `${owner}/${product}/${photoId}.jpg`,
            mime: "image/jpeg",
            size_bytes: 100,
            sha256: "detail-hash",
            parent_asset_id: null,
          },
        ];
        await rpc("gandiva_add_sources", [
          owner,
          product,
          current!.id,
          "detail-source-key",
          JSON.stringify(assets),
          current!.description_id,
        ]);
        assert.equal(
          (
            await scalar("select current_truth_id from products where id=$1", [
              product,
            ])
          )?.current_truth_id,
          null,
        );
        assert.equal(
          (await scalar("select count(*)::int count from truth_versions"))
            ?.count,
          2,
        );
        assert.equal(
          (await scalar("select count(*)::int count from passports"))?.count,
          1,
        );
        await assert.rejects(
          () => rpc("gandiva_confirm_truth", [owner, product, current!.id]),
          /Stale/,
        );
      } finally {
        await db.exec("rollback");
      }
    },
  );
  await t.test(
    "RLS hides every product record and private object from another merchant",
    async () => {
      await db.query(
        "insert into storage.objects(bucket_id,name) values($1,$2)",
        ["product-images", `${owner}/${product}/photo.jpg`],
      );
      await db.exec("set role authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        other,
      ]);
      for (const table of [
        "products",
        "product_assets",
        "truth_versions",
        "generations",
        "verification_runs",
        "approvals",
        "passports",
        "jobs",
      ])
        assert.equal(
          (await db.query(`select * from ${table}`)).rows.length,
          0,
          table,
        );
      assert.equal(
        (await db.query("select * from storage.objects")).rows.length,
        0,
      );
      await assert.rejects(
        () =>
          db.query("select gandiva_confirm_truth($1,$2,$3)", [
            owner,
            product,
            current!.id,
          ]),
        /permission denied/,
      );
      await assert.rejects(
        () => db.query("insert into products(owner_id) values($1)", [other]),
        /permission denied/,
      );
      await db.exec("reset role");
    },
  );
  await t.test(
    "expired leases fail visibly instead of repeating a provider spend",
    async () => {
      await rpc("gandiva_confirm_truth", [owner, product, current!.id]);
      await rpc("gandiva_enqueue", [
        owner,
        product,
        "generate",
        "generation-expired",
        JSON.stringify({ truthId: current!.id, direction: "Studio" }),
      ]);
      const expired = await claim();
      await db.query(
        "update jobs set lease_until=now()-interval '1 second' where id=$1",
        [expired.id],
      );
      assert.equal(
        (await db.query("select * from gandiva_claim_job()")).rows.length,
        0,
      );
      assert.equal(
        (await scalar("select status from jobs where id=$1", [expired.id]))
          ?.status,
        "failed",
      );
      await assert.rejects(
        () =>
          rpc("gandiva_finish_job", [
            expired.id,
            expired.lease_token,
            "{}",
            null,
          ]),
        /Stale/,
      );
    },
  );
});
