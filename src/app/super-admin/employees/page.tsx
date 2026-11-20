import { SuperAdminEmployeesClient } from "@/components/super-admin/SuperAdminEmployeesClient";
import { requirePageRole } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function SuperAdminEmployeesPage() {
  await requirePageRole(["super_admin"]);
  return <SuperAdminEmployeesClient />;
}
