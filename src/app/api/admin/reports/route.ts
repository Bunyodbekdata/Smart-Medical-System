import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/guards";
import { getTashkentDateString } from "@/lib/formatters";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const auth = await requireApiRole(["admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || getTashkentDateString();

  const admin = createServiceRoleClient();
  const clinicId = auth.session.profile.clinic_id;

  try {
    const startUtc = new Date(`${date}T00:00:00+05:00`).toISOString();
    const endUtc = new Date(`${date}T23:59:59.999+05:00`).toISOString();

    const [ticketsRes, paymentsRes, refundsRes, newPatientsRes] = await Promise.all([
      admin
        .from("queue_tickets")
        .select(
          "id, ticket_number, source, status, total_due, paid_amount, payment_status, created_at, patient:patients(full_name, phone), doctor:doctors(full_name), service:services(name)"
        )
        .eq("clinic_id", clinicId)
        .eq("queue_date", date)
        .order("created_at", { ascending: false }),
      admin
        .from("payments")
        .select(
          "id, receipt_number, amount, payment_method, is_confirmed, paid_at, patient:patients(full_name), service:services(name), doctor:doctors(full_name), accepted_by_profile:user_profiles!payments_accepted_by_fkey(id, full_name)"
        )
        .eq("clinic_id", clinicId)
        .gte("paid_at", startUtc)
        .lte("paid_at", endUtc)
        .order("paid_at", { ascending: false }),
      admin
        .from("refunds")
        .select("id, refund_number, amount, refund_method, reason, refunded_at")
        .eq("clinic_id", clinicId)
        .gte("refunded_at", startUtc)
        .lte("refunded_at", endUtc),
      admin
        .from("patients")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .gte("created_at", startUtc)
        .lte("created_at", endUtc),
    ]);

    const tickets = ticketsRes.data ?? [];
    const payments = paymentsRes.data ?? [];
    const refunds = refundsRes.data ?? [];

    const confirmedPayments = payments.filter((p) => p.is_confirmed);
    const cashTotal = confirmedPayments
      .filter((p) => p.payment_method === "cash")
      .reduce((s, p) => s + Number(p.amount), 0);
    const cardTotal = confirmedPayments
      .filter((p) => p.payment_method === "card")
      .reduce((s, p) => s + Number(p.amount), 0);
    const transferTotal = confirmedPayments
      .filter((p) => p.payment_method === "transfer")
      .reduce((s, p) => s + Number(p.amount), 0);
    const totalAccepted = cashTotal + cardTotal + transferTotal;
    const totalRefunds = refunds.reduce((s, r) => s + Number(r.amount), 0);

    const unpaidBalance = tickets
      .filter((t) => t.status !== "bekor_qilindi" && t.status !== "kelmagan")
      .reduce((s, t) => s + Math.max(0, Number(t.total_due) - Number(t.paid_amount)), 0);

    // Summarize administrator activity for the day
    const adminActivityMap = new Map<
      string,
      { adminName: string; paymentsCount: number; totalCollected: number }
    >();
    for (const p of confirmedPayments) {
      const profile = p.accepted_by_profile as unknown as {
        id: string;
        full_name: string;
      } | null;
      const key = profile?.id ?? "unknown";
      const cur = adminActivityMap.get(key) ?? {
        adminName: profile?.full_name ?? "Administrator",
        paymentsCount: 0,
        totalCollected: 0,
      };
      cur.paymentsCount += 1;
      cur.totalCollected += Number(p.amount);
      adminActivityMap.set(key, cur);
    }

    return NextResponse.json({
      date,
      summary: {
        ticketsToday: tickets.length,
        newPatientsToday: newPatientsRes.count ?? 0,
        waitingCount: tickets.filter((t) => t.status === "kutilmoqda").length,
        inConsultationCount: tickets.filter((t) => t.status === "qabulda").length,
        completedCount: tickets.filter((t) => t.status === "yakunlandi").length,
        totalAccepted,
        cashTotal,
        cardTotal,
        transferTotal,
        totalRefunds,
        netCollected: Math.max(0, totalAccepted - totalRefunds),
        unpaidBalance,
      },
      transactions: payments,
      refunds,
      unpaidTickets: tickets.filter(
        (t) =>
          t.status !== "bekor_qilindi" &&
          t.status !== "kelmagan" &&
          Number(t.total_due) > Number(t.paid_amount)
      ),
      adminActivity: Array.from(adminActivityMap.values()),
    });
  } catch (err) {
    console.error("[api/admin/reports GET]", err);
    return NextResponse.json({ error: "Hisobotni yaratishda xatolik." }, { status: 500 });
  }
}
