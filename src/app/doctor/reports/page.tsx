import { DoctorReportsClient } from "@/components/doctor/DoctorReportsClient";
import { requirePageRole } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function DoctorReportsPage() {
  await requirePageRole(["doctor"]);
  return <DoctorReportsClient />;
}
