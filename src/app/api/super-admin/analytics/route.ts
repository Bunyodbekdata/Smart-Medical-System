import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/guards";
import { formatDateDDMMYYYY, getTashkentDateString } from "@/lib/formatters";
import { createServiceRoleClient } from "@/lib/supabase/server";

function getTashkentDateOfTimestamp(ts: string): string {
  return getTashkentDateString(new Date(ts));
}

export async function GET() {
  const auth = await requireApiRole(["super_admin"]);
  if (!auth.ok) return auth.response;

  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();

  try {
    const todayStr = getTashkentDateString();
    const monthPrefix = todayStr.slice(0, 7);

    const nowTashkent = new Date(`${todayStr}T00:00:00+05:00`);
    const fourteenDaysAgo = new Date(nowTashkent);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
    const start14Str = getTashkentDateString(fourteenDaysAgo);

    const sixMonthsAgo = new Date(nowTashkent);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    const start6MoStr = getTashkentDateString(sixMonthsAgo);
    const start6MoUtc = new Date(`${start6MoStr}T00:00:00+05:00`).toISOString();

    const [
      patientsCountRes,
      patientsListRes,
      doctorsRes,
      servicesRes,
      ticketsRes,
      paymentsRes,
      refundsRes,
      consultationsCountRes,
    ] = await Promise.all([
      admin
        .from("patients")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId),
      admin
        .from("patients")
        .select("id, created_at")
        .eq("clinic_id", clinicId)
        .gte("created_at", start6MoUtc),
      admin
        .from("doctors")
        .select("id, full_name, specialization, is_active")
        .eq("clinic_id", clinicId),
      admin
        .from("services")
        .select("id, name, is_active")
        .eq("clinic_id", clinicId),
      admin
        .from("queue_tickets")
        .select("id, queue_date, status, service_id, doctor_id, paid_amount")
        .eq("clinic_id", clinicId)
        .gte("queue_date", start6MoStr),
      admin
        .from("payments")
        .select("id, amount, payment_method, is_confirmed, paid_at")
        .eq("clinic_id", clinicId)
        .eq("is_confirmed", true)
        .gte("paid_at", start6MoUtc),
      admin
        .from("refunds")
        .select("id, amount, refunded_at")
        .eq("clinic_id", clinicId)
        .gte("refunded_at", start6MoUtc),
      admin
        .from("consultations")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .eq("status", "completed"),
    ]);

    const doctors = doctorsRes.data ?? [];
    const services = servicesRes.data ?? [];
    const tickets = ticketsRes.data ?? [];
    const payments = paymentsRes.data ?? [];
    const refunds = refundsRes.data ?? [];
    const recentPatients = patientsListRes.data ?? [];

    const todayTickets = tickets.filter((t) => t.queue_date === todayStr);
    const todayPayments = payments
      .filter((p) => getTashkentDateOfTimestamp(p.paid_at) === todayStr)
      .reduce((s, p) => s + Number(p.amount), 0);
    const todayRefunds = refunds
      .filter((r) => getTashkentDateOfTimestamp(r.refunded_at) === todayStr)
      .reduce((s, r) => s + Number(r.amount), 0);

    const monthPayments = payments
      .filter((p) => getTashkentDateOfTimestamp(p.paid_at).startsWith(monthPrefix))
      .reduce((s, p) => s + Number(p.amount), 0);
    const monthRefunds = refunds
      .filter((r) => getTashkentDateOfTimestamp(r.refunded_at).startsWith(monthPrefix))
      .reduce((s, r) => s + Number(r.amount), 0);

    // 1. Daily revenue + patient growth (last 14 days)
    const dailyMap = new Map<
      string,
      { date: string; label: string; revenue: number; visits: number; newPatients: number }
    >();
    for (let i = 0; i < 14; i++) {
      const d = new Date(fourteenDaysAgo);
      d.setDate(d.getDate() + i);
      const iso = getTashkentDateString(d);
      dailyMap.set(iso, {
        date: iso,
        label: formatDateDDMMYYYY(iso).slice(0, 5),
        revenue: 0,
        visits: 0,
        newPatients: 0,
      });
    }

    for (const p of payments) {
      const d = getTashkentDateOfTimestamp(p.paid_at);
      const bucket = dailyMap.get(d);
      if (bucket) bucket.revenue += Number(p.amount);
    }
    for (const r of refunds) {
      const d = getTashkentDateOfTimestamp(r.refunded_at);
      const bucket = dailyMap.get(d);
      if (bucket) bucket.revenue = Math.max(0, bucket.revenue - Number(r.amount));
    }
    for (const t of tickets) {
      if (t.queue_date >= start14Str) {
        const bucket = dailyMap.get(t.queue_date);
        if (bucket && t.status !== "bekor_qilindi") bucket.visits += 1;
      }
    }
    for (const pt of recentPatients) {
      const d = getTashkentDateOfTimestamp(pt.created_at);
      const bucket = dailyMap.get(d);
      if (bucket) bucket.newPatients += 1;
    }

    // 2. Monthly revenue (last 6 months)
    const monthMap = new Map<string, { month: string; revenue: number; visits: number }>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(nowTashkent);
      d.setMonth(d.getMonth() - i);
      const mKey = getTashkentDateString(d).slice(0, 7);
      monthMap.set(mKey, { month: `${mKey.slice(5, 7)}.${mKey.slice(0, 4)}`, revenue: 0, visits: 0 });
    }
    for (const p of payments) {
      const mKey = getTashkentDateOfTimestamp(p.paid_at).slice(0, 7);
      const b = monthMap.get(mKey);
      if (b) b.revenue += Number(p.amount);
    }
    for (const r of refunds) {
      const mKey = getTashkentDateOfTimestamp(r.refunded_at).slice(0, 7);
      const b = monthMap.get(mKey);
      if (b) b.revenue = Math.max(0, b.revenue - Number(r.amount));
    }
    for (const t of tickets) {
      const mKey = t.queue_date.slice(0, 7);
      const b = monthMap.get(mKey);
      if (b && t.status !== "bekor_qilindi") b.visits += 1;
    }

    // 3. Service popularity
    const serviceMap = new Map(services.map((s) => [s.id, s.name]));
    const srvCounts = new Map<string, { name: string; count: number; revenue: number }>();
    for (const t of tickets) {
      if (t.status === "bekor_qilindi") continue;
      const name = serviceMap.get(t.service_id) ?? "Boshqa";
      const cur = srvCounts.get(t.service_id) ?? { name, count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += Number(t.paid_amount ?? 0);
      srvCounts.set(t.service_id, cur);
    }
    const totalSrvCount = Array.from(srvCounts.values()).reduce((s, v) => s + v.count, 0) || 1;
    const servicePopularity = Array.from(srvCounts.values())
      .sort((a, b) => b.count - a.count)
      .map((s) => ({
        ...s,
        percentage: Math.round((s.count / totalSrvCount) * 100),
      }));

    // 4. Doctor performance
    const doctorMap = new Map(doctors.map((d) => [d.id, d.full_name]));
    const docStats = new Map<string, { name: string; completed: number; revenue: number }>();
    for (const t of tickets) {
      if (t.status !== "yakunlandi") continue;
      const name = doctorMap.get(t.doctor_id) ?? "Shifokor";
      const cur = docStats.get(t.doctor_id) ?? { name, completed: 0, revenue: 0 };
      cur.completed += 1;
      cur.revenue += Number(t.paid_amount ?? 0);
      docStats.set(t.doctor_id, cur);
    }

    // 5. Payment methods (current month)
    const methodTotals = { cash: 0, card: 0, transfer: 0 };
    for (const p of payments) {
      if (getTashkentDateOfTimestamp(p.paid_at).startsWith(monthPrefix)) {
        if (p.payment_method === "cash") methodTotals.cash += Number(p.amount);
        if (p.payment_method === "card") methodTotals.card += Number(p.amount);
        if (p.payment_method === "transfer") methodTotals.transfer += Number(p.amount);
      }
    }

    return NextResponse.json({
      kpis: {
        totalPatients: patientsCountRes.count ?? 0,
        todayPatients: todayTickets.length,
        totalDoctors: doctors.filter((d) => d.is_active).length,
        todayRevenue: Math.max(0, todayPayments - todayRefunds),
        monthlyRevenue: Math.max(0, monthPayments - monthRefunds),
        totalConsultations: consultationsCountRes.count ?? 0,
        activeServices: services.filter((s) => s.is_active).length,
      },
      charts: {
        dailyRevenue: Array.from(dailyMap.values()),
        monthlyRevenue: Array.from(monthMap.values()),
        servicePopularity,
        doctorPerformance: Array.from(docStats.values()).sort((a, b) => b.revenue - a.revenue),
        paymentMethods: [
          { method: "Naqd pul", key: "cash", amount: methodTotals.cash },
          { method: "Bank kartasi", key: "card", amount: methodTotals.card },
          { method: "Bank o'tkazmasi", key: "transfer", amount: methodTotals.transfer },
        ],
      },
    });
  } catch (err) {
    console.error("[api/super-admin/analytics GET]", err);
    return NextResponse.json({ error: "Analitikani yuklashda xatolik." }, { status: 500 });
  }
}
