import { SuperAdminDoctorsClient } from "@/components/super-admin/SuperAdminDoctorsClient";
import { requirePageRole } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function SuperAdminDoctorsPage() {
  await requirePageRole(["super_admin"]);
  return <SuperAdminDoctorsClient />;
}
