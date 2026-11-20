import { AdminReportsClient } from "@/components/admin/AdminReportsClient";
import { requirePageRole } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  await requirePageRole(["admin", "super_admin"]);
  return <AdminReportsClient />;
}
