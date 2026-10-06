import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { apiError, uuid } from "@/lib/http";
import { workflow } from "@/lib/products/repository";
export async function GET(
  _request: Request,
  context: { params: Promise<{ productId: string }> },
) {
  try {
    const owner = await requireOwner();
    const id = uuid.parse((await context.params).productId);
    return NextResponse.json(await workflow(owner, id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
