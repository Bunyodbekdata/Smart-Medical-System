import { SuperAdminServicesClient } from "@/components/super-admin/SuperAdminServicesClient";
import { requirePageRole } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function SuperAdminServicesPage() {
  await requirePageRole(["super_admin"]);
  return <SuperAdminServicesClient />;
}
