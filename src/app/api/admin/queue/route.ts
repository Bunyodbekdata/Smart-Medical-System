import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAuditLog, requireApiRole } from "@/lib/auth/guards";
import { parseIsoDateOrDefault } from "@/lib/formatters";
import { broadcastPublicQueueUpdate } from "@/lib/realtime/broadcast";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { walkInRegistrationSchema } from "@/lib/validators";

const patchQueueSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("confirm_arrival"),
    ticketId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("set_priority"),
    ticketId: z.string().uuid(),
    priorityLevel: z.number().int().min(0).max(2),
    reason: z.string().trim().max(300).optional().nullable(),
  }).refine(
    (d) => d.priorityLevel === 0 || (d.reason && d.reason.trim().length >= 3),
    {
      message: "Ustuvorlik o'zgarishi sababini kamida 3 ta belgi bilan kiriting",
      path: ["reason"],
    }
  ),
  z.object({
    action: z.literal("transition_status"),
    ticketId: z.string().uuid(),
    status: z.enum([
      "kutilmoqda",
      "chaqirildi",
      "qabulda",
      "yakunlandi",
      "kelmagan",
      "bekor_qilindi",
    ]),
    reason: z.string().trim().max(300).optional().nullable(),
  }),
]);

export async function GET(request: Request) {
  const auth = await requireApiRole(["admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const date = parseIsoDateOrDefault(searchParams.get("date"));
  const doctorId = searchParams.get("doctorId");
  const serviceId = searchParams.get("serviceId");
  const status = searchParams.get("status");
  const search = (searchParams.get("q") || "").trim().toLowerCase();

  const admin = createServiceRoleClient();
  const clinicId = auth.session.profile.clinic_id;

  try {
    let query = admin
      .from("queue_tickets")
      .select(
        "*, patient:patients(id, full_name, phone), doctor:doctors(id, full_name, specialization), service:services(id, name, category, price), room:rooms(id, room_number, name)"
      )
      .eq("clinic_id", clinicId)
      .eq("queue_date", date)
      .order("priority_level", { ascending: false })
      .order("sequence_number", { ascending: true });

    if (doctorId && doctorId !== "all") query = query.eq("doctor_id", doctorId);
    if (serviceId && serviceId !== "all") query = query.eq("service_id", serviceId);

    const { data: allTickets, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const ticketsRaw = allTickets ?? [];
    const counts = {
      all: ticketsRaw.length,
      kutilmoqda: ticketsRaw.filter((t) => t.status === "kutilmoqda").length,
      chaqirildi: ticketsRaw.filter((t) => t.status === "chaqirildi").length,
      qabulda: ticketsRaw.filter((t) => t.status === "qabulda").length,
      yakunlandi: ticketsRaw.filter((t) => t.status === "yakunlandi").length,
      kelmagan: ticketsRaw.filter((t) => t.status === "kelmagan").length,
      bekor_qilindi: ticketsRaw.filter((t) => t.status === "bekor_qilindi").length,
    };

    let filtered = ticketsRaw;
    if (status && status !== "all") {
      filtered = filtered.filter((t) => t.status === status);
    }
    if (search) {
      filtered = filtered.filter((t) => {
        const pName = (t.patient as { full_name?: string } | null)?.full_name?.toLowerCase() ?? "";
        const pPhone = (t.patient as { phone?: string } | null)?.phone?.toLowerCase() ?? "";
        const dName = (t.doctor as { full_name?: string } | null)?.full_name?.toLowerCase() ?? "";
        return (
          t.ticket_number.toLowerCase().includes(search) ||
          pName.includes(search) ||
          pPhone.includes(search) ||
          dName.includes(search)
        );
      });
    }

    return NextResponse.json({
      date,
      counts,
      tickets: filtered,
    });
  } catch (err) {
    console.error("[api/admin/queue GET]", err);
    return NextResponse.json({ error: "Navbatni yuklashda xatolik." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiRole(["admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Noto'g'ri JSON." }, { status: 400 });
  }

  const parsed = walkInRegistrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Ma'lumotlar noto'g'ri." },
      { status: 400 }
    );
  }

  const admin = createServiceRoleClient();
  const clinicId = auth.session.profile.clinic_id;

  try {
    const { data, error } = await admin.rpc("create_queue_ticket", {
      p_clinic_id: clinicId,
      p_patient_full_name: parsed.data.fullName,
      p_patient_phone: parsed.data.phone,
      p_doctor_id: parsed.data.doctorId,
      p_service_id: parsed.data.serviceId,
      p_source: "walk_in",
      p_consent_given: true,
      p_notes: parsed.data.notes ?? null,
      p_patient_id: parsed.data.patientId ?? null,
      p_created_by: auth.session.userId,
      p_priority_level: parsed.data.priorityLevel,
      p_priority_reason: parsed.data.priorityReason ?? null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return NextResponse.json({ error: "Chipta yaratilmadi." }, { status: 500 });
    }

    let payment = null;
    if (parsed.data.initialPayment && parsed.data.initialPayment.amount > 0) {
      const { data: payData, error: payError } = await admin.rpc("record_ticket_payment", {
        p_ticket_id: row.ticket_id,
        p_amount: parsed.data.initialPayment.amount,
        p_payment_method: parsed.data.initialPayment.paymentMethod,
        p_actor_id: auth.session.userId,
        p_is_confirmed: parsed.data.initialPayment.isConfirmed,
        p_override_reason: null,
        p_notes: parsed.data.initialPayment.notes ?? null,
      });

      if (payError) {
        return NextResponse.json(
          {
            ticket: row,
            warning: `Navbat yaratildi, lekin to'lovda xatolik: ${payError.message}`,
          },
          { status: 201 }
        );
      }
      payment = payData;
    }

    await broadcastPublicQueueUpdate({
      clinicId,
      doctorId: row.doctor_id,
      queueDate: row.queue_date,
      eventType: "ticket_created",
    });

    return NextResponse.json({ ticket: row, payment }, { status: 201 });
  } catch (err) {
    console.error("[api/admin/queue POST]", err);
    return NextResponse.json({ error: "Walk-in ro'yxatdan o'tkazishda xatolik." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireApiRole(["admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Noto'g'ri JSON." }, { status: 400 });
  }

  const parsed = patchQueueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Noto'g'ri ma'lumot." },
      { status: 400 }
    );
  }

  const admin = createServiceRoleClient();
  const clinicId = auth.session.profile.clinic_id;

  try {
    const { data: existing } = await admin
      .from("queue_tickets")
      .select("*")
      .eq("id", parsed.data.ticketId)
      .eq("clinic_id", clinicId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Navbat chiptasi topilmadi." }, { status: 404 });
    }

    if (parsed.data.action === "confirm_arrival") {
      const { data: updated, error } = await admin
        .from("queue_tickets")
        .update({
          arrival_confirmed: true,
          arrival_confirmed_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .eq("clinic_id", clinicId)
        .select("*")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      await recordAuditLog({
        clinicId,
        actorUserId: auth.session.userId,
        action: "queue.arrival_confirmed",
        entityType: "queue_ticket",
        entityId: existing.id,
        summary: `Bemor kelishi tasdiqlandi: ${existing.ticket_number}`,
        previousValues: { arrival_confirmed: existing.arrival_confirmed },
        newValues: { arrival_confirmed: true },
      });

      return NextResponse.json({ ticket: updated });
    }

    if (parsed.data.action === "set_priority") {
      const effectiveReason =
        parsed.data.reason?.trim() || "Oddiy navbatga qaytarildi";
      const { data: updated, error } = await admin
        .from("queue_tickets")
        .update({
          priority_level: parsed.data.priorityLevel,
          priority_reason: parsed.data.priorityLevel === 0 ? null : effectiveReason,
        })
        .eq("id", existing.id)
        .eq("clinic_id", clinicId)
        .select("*")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      await recordAuditLog({
        clinicId,
        actorUserId: auth.session.userId,
        action: "queue.priority_changed",
        entityType: "queue_ticket",
        entityId: existing.id,
        summary: `Navbat ustuvorligi o'zgartirildi (${existing.ticket_number}): ${existing.priority_level} -> ${parsed.data.priorityLevel}`,
        previousValues: { priority_level: existing.priority_level },
        newValues: { priority_level: parsed.data.priorityLevel },
        reason: effectiveReason,
      });

      await broadcastPublicQueueUpdate({
        clinicId,
        doctorId: existing.doctor_id,
        queueDate: existing.queue_date,
        eventType: "status_changed",
      });

      return NextResponse.json({ ticket: updated });
    }

    if (parsed.data.action === "transition_status") {
      const { data: updated, error } = await admin.rpc("transition_queue_status", {
        p_ticket_id: existing.id,
        p_new_status: parsed.data.status,
        p_actor_id: auth.session.userId,
        p_reason: parsed.data.reason ?? null,
        p_visit_notes: null,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      await broadcastPublicQueueUpdate({
        clinicId,
        doctorId: existing.doctor_id,
        queueDate: existing.queue_date,
        eventType: "status_changed",
      });

      return NextResponse.json({ ticket: updated });
    }

    return NextResponse.json({ error: "Noma'lum amal." }, { status: 400 });
  } catch (err) {
    console.error("[api/admin/queue PATCH]", err);
    return NextResponse.json({ error: "Navbatni yangilashda xatolik." }, { status: 500 });
  }
}
