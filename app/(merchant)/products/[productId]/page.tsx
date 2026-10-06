import { notFound } from "next/navigation";
import { requireOwner, HttpError } from "@/lib/auth";
import { workflow } from "@/lib/products/repository";
import { uuid } from "@/lib/http";
import { ProductWorkflow } from "@/components/product-workflow";
export default async function ProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const id = (await params).productId;
  if (!uuid.safeParse(id).success) notFound();
  let initial;
  try {
    initial = await workflow(await requireOwner(), id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
  return <ProductWorkflow initial={initial} />;
}
