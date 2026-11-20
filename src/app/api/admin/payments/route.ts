import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAuditLog, requireApiRole } from "@/lib/auth/guards";
import { getTashkentDateString } from "@/lib/formatters";
import { broadcastPublicQueueUpdate } from "@/lib/realtime/broadcast";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { paymentRecordSchema, refundRecordSchema } from "@/lib/validators";

const confirmSchema = z.object({
  action: z.literal("confirm"),
  paymentId: z.string().uuid(),
});

const refundActionSchema = refundRecordSchema.extend({
  action: z.literal("refund"),
});

export async function GET(request: Request) {
  const auth = await requireApiRole(["admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || getTashkentDateString();
  const statusFilter = searchParams.get("status") || "all";

  const admin = createServiceRoleClient();
  const clinicId = auth.session.profile.clinic_id;

  try {
    const startUtc = new Date(`${date}T00:00:00+05:00`).toISOString();
    const endUtc = new Date(`${date}T23:59:59.999+05:00`).toISOString();

    const [paymentsRes, pendingTicketsRes, settingsRes] = await Promise.all([
      admin
        .from("payments")
        .select(
          "*, patient:patients(id, full_name, phone), doctor:doctors(id, full_name), service:services(id, name), ticket:queue_tickets(id, ticket_number, total_due, paid_amount, payment_status, room:rooms(room_number)), accepted_by_profile:user_profiles!payments_accepted_by_fkey(id, full_name), refunds(*)"
        )
        .eq("clinic_id", clinicId)
        .gte("paid_at", startUtc)
        .lte("paid_at", endUtc)
        .order("paid_at", { ascending: false }),
      admin
        .from("queue_tickets")
        .select(
          "*, patient:patients(id, full_name, phone), doctor:doctors(id, full_name), service:services(id, name), room:rooms(id, room_number)"
        )
        .eq("clinic_id", clinicId)
        .eq("queue_date", date)
        .neq("status", "bekor_qilindi")
        .in("payment_status", ["unpaid", "partial"])
        .order("sequence_number", { ascending: true }),
      admin
        .from("clinic_settings")
        .select("clinic_name, address, phone, logo_url, receipt_header, receipt_footer")
        .eq("clinic_id", clinicId)
        .maybeSingle(),
    ]);

    let payments = paymentsRes.data ?? [];
    if (statusFilter === "confirmed") {
      payments = payments.filter((p) => p.is_confirmed);
    } else if (statusFilter === "unconfirmed") {
      payments = payments.filter((p) => !p.is_confirmed);
    }

    return NextResponse.json({
      date,
      payments,
      pendingTickets: pendingTicketsRes.data ?? [],
      clinicSettings: settingsRes.data ?? null,
    });
  } catch (err) {
    console.error("[api/admin/payments GET]", err);
    return NextResponse.json({ error: "To'lovlarni yuklashda xatolik." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiRole(["admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Noto'g'ri JSON." }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  const clinicId = auth.session.profile.clinic_id;

  try {
    if (body.action === "confirm") {
      const parsed = confirmSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "To'lov ID noto'g'ri." }, { status: 400 });
      }

      const { data: existing } = await admin
        .from("payments")
        .select("*")
        .eq("id", parsed.data.paymentId)
        .eq("clinic_id", clinicId)
        .single();

      if (!existing) {
        return NextResponse.json({ error: "To'lov topilmadi." }, { status: 404 });
      }

      const { data: updated, error } = await admin
        .from("payments")
        .update({
          is_confirmed: true,
          confirmed_at: new Date().toISOString(),
          confirmed_by: auth.session.userId,
        })
        .eq("id", existing.id)
        .select("*")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      await admin.rpc("sync_ticket_payment_totals", { p_ticket_id: existing.queue_ticket_id });
      await admin.rpc("sync_doctor_earning_for_ticket", {
        p_ticket_id: existing.queue_ticket_id,
        p_actor_id: auth.session.userId,
      });

      await recordAuditLog({
        clinicId,
        actorUserId: auth.session.userId,
        action: "payment.confirmed",
        entityType: "payment",
        entityId: existing.id,
        summary: `To'lov tasdiqlandi: ${existing.receipt_number}`,
        previousValues: { is_confirmed: existing.is_confirmed },
        newValues: { is_confirmed: true },
      });

      return NextResponse.json({ payment: updated });
    }

    if (body.action === "refund") {
      const parsed = refundActionSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Qaytarish ma'lumotlari noto'g'ri." },
          { status: 400 }
        );
      }

      const { data: payRow } = await admin
        .from("payments")
        .select("id, clinic_id, queue_ticket_id, doctor_id")
        .eq("id", parsed.data.paymentId)
        .eq("clinic_id", clinicId)
        .single();

      if (!payRow) {
        return NextResponse.json({ error: "To'lov topilmadi." }, { status: 404 });
      }

      const { data: refund, error } = await admin.rpc("record_payment_refund", {
        p_payment_id: parsed.data.paymentId,
        p_amount: parsed.data.amount,
        p_refund_method: parsed.data.refundMethod,
        p_reason: parsed.data.reason,
        p_authorized_by: auth.session.userId,
        p_created_by: auth.session.userId,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      await broadcastPublicQueueUpdate({
        clinicId,
        doctorId: payRow.doctor_id,
        queueDate: getTashkentDateString(),
        eventType: "payment_updated",
      });

      return NextResponse.json({ refund }, { status: 201 });
    }

    // Default: record a new payment
    const parsed = paymentRecordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "To'lov ma'lumotlari noto'g'ri." },
        { status: 400 }
      );
    }

    const { data: ticket } = await admin
      .from("queue_tickets")
      .select("id, clinic_id, doctor_id, queue_date")
      .eq("id", parsed.data.ticketId)
      .eq("clinic_id", clinicId)
      .single();

    if (!ticket) {
      return NextResponse.json({ error: "Navbat chiptasi topilmadi." }, { status: 404 });
    }

    const { data: payment, error } = await admin.rpc("record_ticket_payment", {
      p_ticket_id: ticket.id,
      p_amount: parsed.data.amount,
      p_payment_method: parsed.data.paymentMethod,
      p_actor_id: auth.session.userId,
      p_is_confirmed: parsed.data.isConfirmed,
      p_override_reason: parsed.data.overrideReason ?? null,
      p_notes: parsed.data.notes ?? null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const { data: enrichedPayment } = await admin
      .from("payments")
      .select(
        "*, patient:patients(id, full_name, phone), doctor:doctors(id, full_name), service:services(id, name), ticket:queue_tickets(id, ticket_number, total_due, paid_amount, payment_status, room:rooms(room_number)), accepted_by_profile:user_profiles!payments_accepted_by_fkey(id, full_name)"
      )
      .eq("id", payment.id)
      .single();

    await broadcastPublicQueueUpdate({
      clinicId,
      doctorId: ticket.doctor_id,
      queueDate: ticket.queue_date,
      eventType: "payment_updated",
    });

    return NextResponse.json({ payment: enrichedPayment ?? payment }, { status: 201 });
  } catch (err) {
    console.error("[api/admin/payments POST]", err);
    return NextResponse.json({ error: "To'lovni saqlashda xatolik." }, { status: 500 });
  }
}
