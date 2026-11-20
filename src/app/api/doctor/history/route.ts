import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/guards";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const auth = await requireApiRole(["doctor"]);
  if (!auth.ok) return auth.response;

  const doctor = auth.session.doctor!;
  const clinicId = auth.session.profile.clinic_id;
  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("q") || "").trim().toLowerCase();

  const admin = createServiceRoleClient();

  try {
    const { data, error } = await admin
      .from("consultations")
      .select(
        "*, patient:patients(id, full_name, phone, birth_date), service:services(id, name), ticket:queue_tickets(id, ticket_number, queue_date, total_due, paid_amount, payment_status, status)"
      )
      .eq("clinic_id", clinicId)
      .eq("doctor_id", doctor.id)
      .order("started_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let consultations = data ?? [];
    if (search) {
      consultations = consultations.filter((c) => {
        const p = c.patient as unknown as { full_name?: string; phone?: string } | null;
        const t = c.ticket as unknown as { ticket_number?: string } | null;
        return (
          (p?.full_name?.toLowerCase().includes(search) ?? false) ||
          (p?.phone?.toLowerCase().includes(search) ?? false) ||
          (t?.ticket_number?.toLowerCase().includes(search) ?? false)
        );
      });
    }

    return NextResponse.json({ consultations });
  } catch (err) {
    console.error("[api/doctor/history GET]", err);
    return NextResponse.json({ error: "Qabullar tarixini yuklashda xatolik." }, { status: 500 });
  }
}
