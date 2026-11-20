import { redirect } from "next/navigation";
import { DoctorOverviewClient } from "@/components/doctor/DoctorOverviewClient";
import { requirePageRole } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function DoctorDashboardPage() {
  const session = await requirePageRole(["doctor"]);
  if (!session.doctor) {
    redirect("/staff/login");
  }

  return (
    <DoctorOverviewClient
      clinicId={session.profile.clinic_id}
      doctorId={session.doctor.id}
      initialDoctor={session.doctor}
    />
  );
}
