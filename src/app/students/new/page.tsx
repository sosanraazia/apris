import { requireRole } from "@/lib/auth";
import { Card } from "@/components/ui";
import { UploadForm } from "@/components/UploadForm";

export default async function NewStudent() {
  await requireRole("ADVISOR", "ADMIN");
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Add new student</h1>
      <Card title="Step 1 — Identity and official documents">
        <UploadForm />
      </Card>
      <p className="text-xs text-slate-500">Results are read from the official documents only. Grades cannot be typed in or edited in APRIS.</p>
    </div>
  );
}
