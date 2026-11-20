import { SuperAdminAuditLogsClient } from "@/components/super-admin/SuperAdminAuditLogsClient";
import { requirePageRole } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function SuperAdminAuditLogsPage() {
  await requirePageRole(["super_admin"]);
  return <SuperAdminAuditLogsClient />;
}
