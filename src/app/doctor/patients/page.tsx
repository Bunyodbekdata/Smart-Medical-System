import { DoctorPatientsClient } from "@/components/doctor/DoctorPatientsClient";
import { requirePageRole } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function DoctorPatientsPage() {
  await requirePageRole(["doctor"]);
  return <DoctorPatientsClient />;
}
