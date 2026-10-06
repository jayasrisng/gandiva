import { NextResponse } from "next/server";
import { drainJobs } from "@/lib/jobs/runner";
export async function POST(request: Request) {
  const secret = process.env.JOB_RUNNER_SECRET;
  if (!secret)
    return NextResponse.json(
      { error: "External runner is not configured." },
      { status: 503 },
    );
  if (request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await drainJobs(3);
  return NextResponse.json({ ok: true });
}
