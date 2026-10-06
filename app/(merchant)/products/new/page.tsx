import { CaptureForm } from "@/components/capture/capture-form";
import { requireOwner } from "@/lib/auth";
export default async function Page() {
  return <CaptureForm owner={await requireOwner()} />;
}
