import { SuperAdminFinanceClient } from "@/components/super-admin/SuperAdminFinanceClient";
import { requirePageRole } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function SuperAdminFinancePage() {
  await requirePageRole(["super_admin"]);
  return <SuperAdminFinanceClient />;
}
