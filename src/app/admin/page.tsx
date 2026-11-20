import { AdminOverviewClient } from "@/components/admin/AdminOverviewClient";
import { requirePageRole } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await requirePageRole(["admin", "super_admin"]);
  return <AdminOverviewClient clinicId={session.profile.clinic_id} />;
}
