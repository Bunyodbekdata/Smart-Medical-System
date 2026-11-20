import { redirect } from "next/navigation";
import { DoctorSettingsClient } from "@/components/doctor/DoctorSettingsClient";
import { requirePageRole } from "@/lib/auth/guards";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DoctorSettingsPage() {
  const session = await requirePageRole(["doctor"]);
  if (!session.doctor) {
    redirect("/staff/login");
  }

  const admin = createServiceRoleClient();
  const [{ data: doctorRow }, { data: schedules }] = await Promise.all([
    admin
      .from("doctors")
      .select("*, room:rooms(*)")
      .eq("id", session.doctor.id)
      .maybeSingle(),
    admin
      .from("doctor_schedules")
      .select("*")
      .eq("doctor_id", session.doctor.id)
      .order("day_of_week", { ascending: true }),
  ]);

  return (
    <DoctorSettingsClient
      profile={session.profile}
      initialDoctor={(doctorRow ?? session.doctor) as typeof session.doctor}
      schedules={schedules ?? []}
    />
  );
}
