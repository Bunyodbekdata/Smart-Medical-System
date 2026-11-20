import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAuditLog, requireApiRole } from "@/lib/auth/guards";
import { summarizeClinicFinances } from "@/lib/domain/finance-rules";
import { getTashkentDateString } from "@/lib/formatters";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { commissionRuleSchema, expenseSchema } from "@/lib/validators";

const payoutSchema = z.object({
  action: z.literal("payout"),
  doctorId: z.string().uuid("Shifokorni tanlang"),
  amount: z.number().positive("To'lov summasi 0 dan katta bo'lishi kerak"),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(300).optional().nullable(),
});

const toggleRuleSchema = z.object({
  action: z.literal("toggle_rule"),
  ruleId: z.string().uuid(),
  isActive: z.boolean(),
});

export async function GET(request: Request) {
  const auth = await requireApiRole(["super_admin"]);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const todayStr = getTashkentDateString();
  const fromDate = searchParams.get("from") || `${todayStr.slice(0, 7)}-01`;
  const toDate = searchParams.get("to") || todayStr;

  const fromUtc = new Date(`${fromDate}T00:00:00+05:00`).toISOString();
  const toUtc = new Date(`${toDate}T23:59:59.999+05:00`).toISOString();

  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();

  try {
    const [
      paymentsRes,
      refundsRes,
      ticketsRes,
      expensesRes,
      rulesRes,
      earningsRes,
      doctorsRes,
      servicesRes,
    ] = await Promise.all([
      admin
        .from("payments")
        .select(
          "id, receipt_number, amount, payment_method, is_confirmed, paid_at, patient:patients(full_name), doctor:doctors(full_name), service:services(name)"
        )
        .eq("clinic_id", clinicId)
        .gte("paid_at", fromUtc)
        .lte("paid_at", toUtc)
        .order("paid_at", { ascending: false }),
      admin
        .from("refunds")
        .select("id, refund_number, amount, refund_method, reason, refunded_at")
        .eq("clinic_id", clinicId)
        .gte("refunded_at", fromUtc)
        .lte("refunded_at", toUtc)
        .order("refunded_at", { ascending: false }),
      admin
        .from("queue_tickets")
        .select("id, total_due, paid_amount, status, queue_date")
        .eq("clinic_id", clinicId)
        .gte("queue_date", fromDate)
        .lte("queue_date", toDate),
      admin
        .from("expenses")
        .select("*, responsible_user:user_profiles!expenses_responsible_user_id_fkey(id, full_name)")
        .eq("clinic_id", clinicId)
        .gte("expense_date", fromDate)
        .lte("expense_date", toDate)
        .order("expense_date", { ascending: false }),
      admin
        .from("commission_rules")
        .select("*, doctor:doctors(id, full_name), service:services(id, name)")
        .eq("clinic_id", clinicId)
        .order("effective_from", { ascending: false })
        .order("created_at", { ascending: false }),
      admin
        .from("doctor_earnings")
        .select("*, doctor:doctors(id, full_name, specialization)")
        .eq("clinic_id", clinicId)
        .gte("effective_date", fromDate)
        .lte("effective_date", toDate)
        .order("effective_date", { ascending: false })
        .order("created_at", { ascending: false }),
      admin
        .from("doctors")
        .select("id, full_name, specialization, is_active")
        .eq("clinic_id", clinicId)
        .order("full_name", { ascending: true }),
      admin
        .from("services")
        .select("id, name, price")
        .eq("clinic_id", clinicId)
        .order("name", { ascending: true }),
    ]);

    const payments = paymentsRes.data ?? [];
    const refunds = refundsRes.data ?? [];
    const tickets = ticketsRes.data ?? [];
    const expenses = expensesRes.data ?? [];
    const earnings = earningsRes.data ?? [];
    const doctors = doctorsRes.data ?? [];

    const summary = summarizeClinicFinances({
      payments,
      refunds,
      tickets,
      earnings,
      expenses,
    });

    // Per-doctor earnings summary across selected period
    const doctorSummaryMap = new Map<
      string,
      {
        doctorId: string;
        doctorName: string;
        specialization: string;
        clinicRevenue: number;
        allocated: number;
        paidOut: number;
        balanceOwed: number;
      }
    >();

    for (const d of doctors) {
      doctorSummaryMap.set(d.id, {
        doctorId: d.id,
        doctorName: d.full_name,
        specialization: d.specialization,
        clinicRevenue: 0,
        allocated: 0,
        paidOut: 0,
        balanceOwed: 0,
      });
    }

    for (const e of earnings) {
      const row = doctorSummaryMap.get(e.doctor_id);
      if (!row) continue;
      if (e.entry_type === "payout") {
        row.paidOut += Math.abs(Number(e.doctor_amount));
      } else {
        row.allocated += Number(e.doctor_amount);
        if (e.entry_type === "accrual") {
          row.clinicRevenue += Number(e.gross_amount);
        } else if (e.entry_type === "refund_adjustment") {
          row.clinicRevenue = Math.max(0, row.clinicRevenue);
        }
      }
      row.balanceOwed = Number((row.allocated - row.paidOut).toFixed(2));
    }

    return NextResponse.json({
      period: { from: fromDate, to: toDate },
      summary,
      doctorSummaries: Array.from(doctorSummaryMap.values()),
      expenses,
      commissionRules: rulesRes.data ?? [],
      earningsLedger: earnings.slice(0, 100),
      payments: payments.slice(0, 80),
      refunds: refunds.slice(0, 50),
      doctors,
      services: servicesRes.data ?? [],
    });
  } catch (err) {
    console.error("[api/super-admin/finance GET]", err);
    return NextResponse.json({ error: "Moliyaviy hisobotni yuklashda xatolik." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiRole(["super_admin"]);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Noto'g'ri JSON." }, { status: 400 });
  }

  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();

  try {
    if (body.action === "create_expense") {
      const parsed = expenseSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Xarajat ma'lumotlari noto'g'ri." },
          { status: 400 }
        );
      }

      const { data: expense, error } = await admin
        .from("expenses")
        .insert({
          clinic_id: clinicId,
          title: parsed.data.title,
          category: parsed.data.category,
          amount: parsed.data.amount,
          expense_date: parsed.data.expenseDate,
          description: parsed.data.description ?? null,
          responsible_user_id: parsed.data.responsibleUserId || auth.session.userId,
          created_by: auth.session.userId,
        })
        .select("*")
        .single();

      if (error || !expense) {
        return NextResponse.json({ error: error?.message || "Xarajat saqlanmadi." }, { status: 400 });
      }

      await recordAuditLog({
        clinicId,
        actorUserId: auth.session.userId,
        action: "expense.created",
        entityType: "expense",
        entityId: expense.id,
        summary: `Xarajat kiritildi: ${expense.title} (${expense.amount} UZS)`,
      });

      return NextResponse.json({ expense }, { status: 201 });
    }

    if (body.action === "create_commission_rule") {
      const parsed = commissionRuleSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Komissiya qoidasi noto'g'ri." },
          { status: 400 }
        );
      }

      const { data: rule, error } = await admin
        .from("commission_rules")
        .insert({
          clinic_id: clinicId,
          doctor_id: parsed.data.doctorId || null,
          service_id: parsed.data.serviceId || null,
          commission_type: parsed.data.commissionType,
          commission_value: parsed.data.commissionValue,
          effective_from: parsed.data.effectiveFrom,
          notes: parsed.data.notes ?? null,
          is_active: parsed.data.isActive,
          created_by: auth.session.userId,
        })
        .select("*")
        .single();

      if (error || !rule) {
        return NextResponse.json({ error: error?.message || "Qoida saqlanmadi." }, { status: 400 });
      }

      await recordAuditLog({
        clinicId,
        actorUserId: auth.session.userId,
        action: "commission_rule.created",
        entityType: "commission_rule",
        entityId: rule.id,
        summary: `Yangi komissiya qoidasi yaratildi (${rule.commission_type}: ${rule.commission_value})`,
        newValues: rule,
      });

      return NextResponse.json({ rule }, { status: 201 });
    }

    if (body.action === "toggle_rule") {
      const parsed = toggleRuleSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Qoida ID noto'g'ri." }, { status: 400 });
      }

      const { data: rule, error } = await admin
        .from("commission_rules")
        .update({ is_active: parsed.data.isActive })
        .eq("id", parsed.data.ruleId)
        .eq("clinic_id", clinicId)
        .select("*")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      await recordAuditLog({
        clinicId,
        actorUserId: auth.session.userId,
        action: "commission_rule.updated",
        entityType: "commission_rule",
        entityId: rule.id,
        summary: `Komissiya qoidasi holati o'zgartirildi: ${rule.is_active ? "Faol" : "Nofaol"}`,
      });

      return NextResponse.json({ rule });
    }

    if (body.action === "payout") {
      const parsed = payoutSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "To'lov ma'lumotlari noto'g'ri." },
          { status: 400 }
        );
      }

      const { data: entry, error } = await admin
        .from("doctor_earnings")
        .insert({
          clinic_id: clinicId,
          doctor_id: parsed.data.doctorId,
          entry_type: "payout",
          gross_amount: 0,
          doctor_amount: parsed.data.amount,
          effective_date: parsed.data.effectiveDate,
          notes: parsed.data.notes || "Shifokorga ulush to'landi",
          created_by: auth.session.userId,
        })
        .select("*")
        .single();

      if (error || !entry) {
        return NextResponse.json({ error: error?.message || "To'lov saqlanmadi." }, { status: 400 });
      }

      await recordAuditLog({
        clinicId,
        actorUserId: auth.session.userId,
        action: "doctor_payout.created",
        entityType: "doctor_earning",
        entityId: entry.id,
        summary: `Shifokorga ulush to'lab berildi: ${parsed.data.amount} UZS`,
      });

      return NextResponse.json({ entry }, { status: 201 });
    }

    return NextResponse.json({ error: "Noma'lum amal." }, { status: 400 });
  } catch (err) {
    console.error("[api/super-admin/finance POST]", err);
    return NextResponse.json({ error: "Moliyaviy amalni bajarishda xatolik." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireApiRole(["super_admin"]);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const expenseId = searchParams.get("expenseId");
  if (!expenseId) {
    return NextResponse.json({ error: "Xarajat ID ko'rsatilmagan." }, { status: 400 });
  }

  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();

  const { data: existing } = await admin
    .from("expenses")
    .select("*")
    .eq("id", expenseId)
    .eq("clinic_id", clinicId)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Xarajat topilmadi." }, { status: 404 });
  }

  await admin.from("expenses").delete().eq("id", expenseId).eq("clinic_id", clinicId);
  await recordAuditLog({
    clinicId,
    actorUserId: auth.session.userId,
    action: "expense.deleted",
    entityType: "expense",
    entityId: expenseId,
    summary: `Xarajat o'chirildi: ${existing.title} (${existing.amount} UZS)`,
    previousValues: existing,
  });

  return NextResponse.json({ ok: true });
}
