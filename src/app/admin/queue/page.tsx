import { AdminQueueClient } from "@/components/admin/AdminQueueClient";
import { requirePageRole } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function AdminQueuePage() {
  const session = await requirePageRole(["admin", "super_admin"]);
  return <AdminQueueClient clinicId={session.profile.clinic_id} />;
}
