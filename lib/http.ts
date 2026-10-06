import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError } from "@/lib/auth";
export function apiError(error: unknown) {
  if (error instanceof HttpError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return NextResponse.json(
      { error: "Invalid request. Check the supplied fields." },
      { status: 400 },
    );
  const message = error instanceof Error ? error.message : "Request failed";
  console.error("Gandiva API", message);
  if (
    /Stale|Wait for|Confirm |required|Incomplete|Unresolved|Use latest|Unsupported pass|Acknowledge/.test(
      message,
    )
  )
    return NextResponse.json({ error: message }, { status: 409 });
  return NextResponse.json(
    {
      error:
        "Gandiva could not complete this action. Your saved history is retained.",
    },
    { status: 502 },
  );
}
export const uuid = z.string().uuid();
export const intakeKey = z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/);
