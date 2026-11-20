import { DoctorEarningsClient } from "@/components/doctor/DoctorEarningsClient";
import { requirePageRole } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function DoctorEarningsPage() {
  await requirePageRole(["doctor"]);
  return <DoctorEarningsClient />;
}
