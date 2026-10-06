import vinext from "vinext";
import { defineConfig } from "vite";
export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  return {
    server: { watch: { useFsEvents: false, usePolling: true } },
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: {
          name: "gandiva",
          main: "./worker/index.ts",
          compatibility_date: "2026-05-22",
          compatibility_flags: ["nodejs_compat"],
          triggers: { crons: ["* * * * *"] },
        },
      }),
    ],
  };
});
