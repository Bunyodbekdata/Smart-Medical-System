import { SuperAdminOverviewClient } from "@/components/super-admin/SuperAdminOverviewClient";
import { requirePageRole } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function SuperAdminDashboardPage() {
  const session = await requirePageRole(["super_admin"]);
  return <SuperAdminOverviewClient clinicId={session.profile.clinic_id} />;
}
