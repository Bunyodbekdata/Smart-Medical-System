import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/guards";
import { getTashkentDateString } from "@/lib/formatters";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function GET() {
  const auth = await requireApiRole(["doctor"]);
  if (!auth.ok) return auth.response;

  const doctor = auth.session.doctor!;
  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();

  try {
    const todayStr = getTashkentDateString();
    const todayDate = new Date(`${todayStr}T00:00:00+05:00`);
    const weekAgo = new Date(todayDate);
    weekAgo.setDate(weekAgo.getDate() - 6);
    const weekStartStr = getTashkentDateString(weekAgo);
    const monthStartStr = `${todayStr.slice(0, 7)}-01`;

    const [earningsRes, rulesRes, completedTicketsRes] = await Promise.all([
      admin
        .from("doctor_earnings")
        .select(
          "*, ticket:queue_tickets(id, ticket_number, total_due, paid_amount, service_id, service:services(id, name)), commission_rule:commission_rules(id, commission_type, commission_value)"
        )
        .eq("clinic_id", clinicId)
        .eq("doctor_id", doctor.id)
        .order("effective_date", { ascending: false })
        .order("created_at", { ascending: false }),
      admin
        .from("commission_rules")
        .select("*, service:services(id, name)")
        .eq("clinic_id", clinicId)
        .eq("is_active", true)
        .or(`doctor_id.eq.${doctor.id},doctor_id.is.null`)
        .order("effective_from", { ascending: false }),
      admin
        .from("queue_tickets")
        .select("id, paid_amount, queue_date, service_id, service:services(id, name)")
        .eq("clinic_id", clinicId)
        .eq("doctor_id", doctor.id)
        .eq("status", "yakunlandi"),
    ]);

    const entries = earningsRes.data ?? [];
    const completedTickets = completedTicketsRes.data ?? [];

    const accrualEntries = entries.filter((e) => e.entry_type !== "payout");
    const payoutEntries = entries.filter((e) => e.entry_type === "payout");

    const sumForSince = (sinceDate: string, maxDate = todayStr) =>
      accrualEntries
        .filter((e) => e.effective_date >= sinceDate && e.effective_date <= maxDate)
        .reduce((s, e) => s + Number(e.doctor_amount), 0);

    const dailyEarnings = sumForSince(todayStr, todayStr);
    const weeklyEarnings = sumForSince(weekStartStr, todayStr);
    const monthlyEarnings = sumForSince(monthStartStr, todayStr);

    const totalAllocated = accrualEntries.reduce((s, e) => s + Number(e.doctor_amount), 0);
    const totalPaidOut = payoutEntries.reduce((s, e) => s + Math.abs(Number(e.doctor_amount)), 0);
    const balanceOwed = Number((totalAllocated - totalPaidOut).toFixed(2));

    const totalClinicRevenue = completedTickets.reduce(
      (s, t) => s + Number(t.paid_amount ?? 0),
      0
    );

    const byServiceMap = new Map<
      string,
      { serviceName: string; consultationsCount: number; clinicRevenue: number; doctorEarned: number }
    >();

    for (const t of completedTickets) {
      const srv = t.service as unknown as { id: string; name: string } | null;
      const key = srv?.id ?? "other";
      const cur = byServiceMap.get(key) ?? {
        serviceName: srv?.name ?? "Xizmat",
        consultationsCount: 0,
        clinicRevenue: 0,
        doctorEarned: 0,
      };
      cur.consultationsCount += 1;
      cur.clinicRevenue += Number(t.paid_amount ?? 0);
      byServiceMap.set(key, cur);
    }

    for (const e of accrualEntries) {
      const ticketObj = e.ticket as unknown as {
        service_id?: string;
        service?: { id: string; name: string } | null;
      } | null;
      const key = ticketObj?.service?.id ?? ticketObj?.service_id ?? "other";
      const cur = byServiceMap.get(key) ?? {
        serviceName: ticketObj?.service?.name ?? "Xizmat",
        consultationsCount: 0,
        clinicRevenue: 0,
        doctorEarned: 0,
      };
      cur.doctorEarned += Number(e.doctor_amount);
      byServiceMap.set(key, cur);
    }

    return NextResponse.json({
      summary: {
        dailyEarnings,
        weeklyEarnings,
        monthlyEarnings,
        completedConsultations: completedTickets.length,
        totalClinicRevenue,
        totalAllocated,
        totalPaidOut,
        balanceOwed,
      },
      byService: Array.from(byServiceMap.values()),
      ledger: entries,
      commissionRules: rulesRes.data ?? [],
    });
  } catch (err) {
    console.error("[api/doctor/earnings GET]", err);
    return NextResponse.json({ error: "Daromad ma'lumotlarini yuklashda xatolik." }, { status: 500 });
  }
}
