import { AdminPaymentsClient } from "@/components/admin/AdminPaymentsClient";
import { requirePageRole } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
  const session = await requirePageRole(["admin", "super_admin"]);
  return <AdminPaymentsClient clinicId={session.profile.clinic_id} />;
}
