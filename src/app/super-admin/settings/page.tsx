import { SuperAdminSettingsClient } from "@/components/super-admin/SuperAdminSettingsClient";
import { requirePageRole } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function SuperAdminSettingsPage() {
  await requirePageRole(["super_admin"]);
  return <SuperAdminSettingsClient />;
}
