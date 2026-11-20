import { SuperAdminPromotionsClient } from "@/components/super-admin/SuperAdminPromotionsClient";
import { requirePageRole } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function SuperAdminPromotionsPage() {
  await requirePageRole(["super_admin"]);
  return <SuperAdminPromotionsClient />;
}
