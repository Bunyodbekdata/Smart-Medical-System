import { AdminPatientsClient } from "@/components/admin/AdminPatientsClient";
import { requirePageRole } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function SuperAdminPatientsPage() {
  await requirePageRole(["super_admin"]);
  return <AdminPatientsClient />;
}
