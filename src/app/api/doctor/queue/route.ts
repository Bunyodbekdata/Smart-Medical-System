import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAuditLog, requireApiRole } from "@/lib/auth/guards";
import { getTashkentDateString } from "@/lib/formatters";
import { broadcastPublicQueueUpdate } from "@/lib/realtime/broadcast";
import { createServiceRoleClient } from "@/lib/supabase/server";

const doctorQueueActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("call_next"),
  }),
  z.object({
    action: z.literal("start_consultation"),
    ticketId: z.string().uuid(),
    visitNotes: z.string().trim().max(1000).optional().nullable(),
  }),
  z.object({
    action: z.literal("complete_consultation"),
    ticketId: z.string().uuid(),
    visitNotes: z.string().trim().max(1000).optional().nullable(),
  }),
  z.object({
    action: z.literal("mark_no_show"),
    ticketId: z.string().uuid(),
    reason: z.string().trim().max(300).optional().nullable(),
  }),
  z.object({
    action: z.literal("update_availability"),
    availabilityStatus: z.enum(["available", "busy", "break", "off_duty"]),
  }),
]);

export async function GET(request: Request) {
  const auth = await requireApiRole(["doctor"]);
  if (!auth.ok) return auth.response;

  const doctor = auth.session.doctor!;
  const clinicId = auth.session.profile.clinic_id;
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || getTashkentDateString();

  const admin = createServiceRoleClient();

  try {
    const [ticketsRes, schedulesRes] = await Promise.all([
      admin
        .from("queue_tickets")
        .select(
          "*, patient:patients(id, full_name, phone, birth_date, notes), service:services(id, name, duration_minutes, price), room:rooms(id, room_number, name)"
        )
        .eq("clinic_id", clinicId)
        .eq("doctor_id", doctor.id)
        .eq("queue_date", date)
        .order("priority_level", { ascending: false })
        .order("sequence_number", { ascending: true }),
      admin
        .from("doctor_schedules")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("doctor_id", doctor.id)
        .order("day_of_week", { ascending: true }),
    ]);

    if (ticketsRes.error) {
      return NextResponse.json({ error: ticketsRes.error.message }, { status: 500 });
    }

    const tickets = ticketsRes.data ?? [];
    const currentPatient =
      tickets.find((t) => t.status === "qabulda") ??
      tickets.find((t) => t.status === "chaqirildi") ??
      null;
    const waitingPatients = tickets.filter((t) => t.status === "kutilmoqda");

    return NextResponse.json({
      date,
      doctor,
      schedules: schedulesRes.data ?? [],
      stats: {
        todayTotal: tickets.length,
        inConsultation: tickets.filter((t) => t.status === "qabulda").length,
        waiting: waitingPatients.length,
        completed: tickets.filter((t) => t.status === "yakunlandi").length,
      },
      currentPatient,
      waitingPatients,
      allTickets: tickets,
    });
  } catch (err) {
    console.error("[api/doctor/queue GET]", err);
    return NextResponse.json({ error: "Navbatni yuklashda xatolik." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiRole(["doctor"]);
  if (!auth.ok) return auth.response;

  const doctor = auth.session.doctor!;
  const clinicId = auth.session.profile.clinic_id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Noto'g'ri JSON." }, { status: 400 });
  }

  const parsed = doctorQueueActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "So'rov noto'g'ri." },
      { status: 400 }
    );
  }

  const admin = createServiceRoleClient();

  try {
    if (parsed.data.action === "update_availability") {
      const { data: updatedDoctor, error } = await admin
        .from("doctors")
        .update({ availability_status: parsed.data.availabilityStatus })
        .eq("id", doctor.id)
        .eq("clinic_id", clinicId)
        .select("*")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      await recordAuditLog({
        clinicId,
        actorUserId: auth.session.userId,
        action: "doctor.availability_updated",
        entityType: "doctor",
        entityId: doctor.id,
        summary: `Shifokor holati o'zgartirildi: ${doctor.full_name} -> ${parsed.data.availabilityStatus}`,
      });

      return NextResponse.json({ doctor: updatedDoctor });
    }

    if (parsed.data.action === "call_next") {
      const { data: called, error } = await admin.rpc("call_next_queue_ticket", {
        p_doctor_id: doctor.id,
        p_actor_id: auth.session.userId,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      await broadcastPublicQueueUpdate({
        clinicId,
        doctorId: doctor.id,
        queueDate: called.queue_date,
        eventType: "status_changed",
      });

      return NextResponse.json({ ticket: called });
    }

    // Verify the ticket strictly belongs to this doctor
    const { data: ticket } = await admin
      .from("queue_tickets")
      .select("id, clinic_id, doctor_id, queue_date, status")
      .eq("id", parsed.data.ticketId)
      .eq("clinic_id", clinicId)
      .single();

    if (!ticket) {
      return NextResponse.json({ error: "Navbat chiptasi topilmadi." }, { status: 404 });
    }

    if (ticket.doctor_id !== doctor.id) {
      return NextResponse.json(
        { error: "Siz faqat o'zingizga biriktirilgan bemorlar navbatini boshqara olasiz." },
        { status: 403 }
      );
    }

    if (parsed.data.action === "start_consultation") {
      const { data: updated, error } = await admin.rpc("transition_queue_status", {
        p_ticket_id: ticket.id,
        p_new_status: "qabulda",
        p_actor_id: auth.session.userId,
        p_reason: "Shifokor qabulni boshladi",
        p_visit_notes: parsed.data.visitNotes ?? null,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      await broadcastPublicQueueUpdate({
        clinicId,
        doctorId: doctor.id,
        queueDate: ticket.queue_date,
        eventType: "status_changed",
      });

      return NextResponse.json({ ticket: updated });
    }

    if (parsed.data.action === "complete_consultation") {
      const { data: updated, error } = await admin.rpc("transition_queue_status", {
        p_ticket_id: ticket.id,
        p_new_status: "yakunlandi",
        p_actor_id: auth.session.userId,
        p_reason: "Shifokor qabulni yakunladi",
        p_visit_notes: parsed.data.visitNotes ?? null,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      await broadcastPublicQueueUpdate({
        clinicId,
        doctorId: doctor.id,
        queueDate: ticket.queue_date,
        eventType: "status_changed",
      });

      return NextResponse.json({ ticket: updated });
    }

    if (parsed.data.action === "mark_no_show") {
      const { data: updated, error } = await admin.rpc("transition_queue_status", {
        p_ticket_id: ticket.id,
        p_new_status: "kelmagan",
        p_actor_id: auth.session.userId,
        p_reason: parsed.data.reason || "Bemor chaqirilganda kelmadi",
        p_visit_notes: null,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      await broadcastPublicQueueUpdate({
        clinicId,
        doctorId: doctor.id,
        queueDate: ticket.queue_date,
        eventType: "status_changed",
      });

      return NextResponse.json({ ticket: updated });
    }

    return NextResponse.json({ error: "Noto'g'ri amal." }, { status: 400 });
  } catch (err) {
    console.error("[api/doctor/queue POST]", err);
    return NextResponse.json({ error: "Amalni bajarishda xatolik." }, { status: 500 });
  }
}
