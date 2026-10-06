// Optional local worker. Cloudflare cron is the production recovery path.
const secret = process.env.JOB_RUNNER_SECRET;
if (!secret) {
  console.error(
    "Set JOB_RUNNER_SECRET in .env.local before starting the runner.",
  );
  process.exit(1);
}
const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
let stopped = false;
process.on("SIGINT", () => {
  stopped = true;
});
process.on("SIGTERM", () => {
  stopped = true;
});
console.log("Gandiva local job runner started.");
while (!stopped) {
  try {
    const response = await fetch(`${origin}/api/jobs/run`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    });
    if (!response.ok) console.error("Runner returned HTTP", response.status);
  } catch (error) {
    console.error("Runner could not connect:", error.message);
  }
  if (!stopped) await new Promise((resolve) => setTimeout(resolve, 3000));
}
