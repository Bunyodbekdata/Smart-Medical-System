import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { broadcastPublicQueueUpdate } from "@/lib/realtime/broadcast";
import { getDefaultClinicSlug, isSupabaseServiceConfigured } from "@/lib/supabase/env";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { onlineQueueRegistrationSchema } from "@/lib/validators";

export async function POST(request: Request) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json(
      { error: "Tizim ma'lumotlar bazasi hali sozlanmagan." },
      { status: 503 }
    );
  }

  const forwarded = request.headers.get("x-forwarded-for");
  const clientIp = forwarded?.split(",")[0]?.trim() || "local";
  const rate = checkRateLimit(`online-queue:${clientIp}`, 12, 60_000);

  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Juda ko'p so'rov yuborildi. ${rate.retryAfterSeconds} soniyadan so'ng qayta urinib ko'ring.` },
      {
        status: 429,
        headers: {
          "Retry-After": String(rate.retryAfterSeconds),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Noto'g'ri JSON so'rov." }, { status: 400 });
  }

  const parsed = onlineQueueRegistrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message || "Ma'lumotlar noto'g'ri to'ldirilgan.",
        issues: parsed.error.issues,
      },
      { status: 400 }
    );
  }

  const admin = createServiceRoleClient();

  try {
    let clinicId = parsed.data.clinicId;
    if (!clinicId) {
      const slug = getDefaultClinicSlug();
      const { data: clinic } = await admin
        .from("clinics")
        .select("id")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();

      const fallbackClinic =
        clinic ??
        (
          await admin
            .from("clinics")
            .select("id")
            .eq("is_active", true)
            .limit(1)
            .maybeSingle()
        ).data;

      if (!fallbackClinic) {
        return NextResponse.json(
          { error: "Faol klinika topilmadi." },
          { status: 404 }
        );
      }
      clinicId = fallbackClinic.id;
    }

    const { data, error } = await admin.rpc("create_queue_ticket", {
      p_clinic_id: clinicId,
      p_patient_full_name: parsed.data.fullName,
      p_patient_phone: parsed.data.phone,
      p_doctor_id: parsed.data.doctorId,
      p_service_id: parsed.data.serviceId,
      p_source: "online",
      p_consent_given: parsed.data.consentGiven,
      p_notes: parsed.data.notes ?? null,
      p_patient_id: null,
      p_created_by: null,
      p_priority_level: 0,
      p_priority_reason: null,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message || "Navbat olishda xatolik yuz berdi." },
        { status: 400 }
      );
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return NextResponse.json(
        { error: "Navbat chiptasini yaratib bo'lmadi." },
        { status: 500 }
      );
    }

    await broadcastPublicQueueUpdate({
      clinicId: clinicId!,
      doctorId: row.doctor_id,
      queueDate: row.queue_date,
      eventType: "ticket_created",
    });

    return NextResponse.json(
      {
        ticket: row,
        trackingUrl: `/queue/${row.tracking_token}`,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[api/queue/register]", err);
    return NextResponse.json(
      { error: "Serverda kutilmagan xatolik yuz berdi." },
      { status: 500 }
    );
  }
}
