import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAuditLog, requireApiRole } from "@/lib/auth/guards";
import { createServiceRoleClient } from "@/lib/supabase/server";

const scheduleItemSchema = z
  .object({
    dayOfWeek: z.number().int().min(1).max(7),
    startTime: z.string().regex(/^\d{2}:\d{2}/),
    endTime: z.string().regex(/^\d{2}:\d{2}/),
    breakStart: z.string().optional().nullable(),
    breakEnd: z.string().optional().nullable(),
    isWorking: z.boolean(),
  })
  .refine(
    (s) => !s.isWorking || s.endTime.slice(0, 5) > s.startTime.slice(0, 5),
    { message: "Ish tugash vaqti boshlanish vaqtidan keyin bo'lishi kerak" }
  );

const createDoctorSchema = z.object({
  fullName: z.string().trim().min(3, "Shifokor ismi kamida 3 ta belgi").max(120),
  specialization: z.string().trim().min(2, "Mutaxassislikni kiriting").max(120),
  experienceYears: z.number().int().min(0).max(70),
  biography: z.string().trim().max(1000).optional().nullable(),
  photoUrl: z.string().trim().max(500).optional().nullable(),
  roomId: z.string().uuid().optional().nullable(),
  consultationPrice: z.number().min(0),
  queuePrefix: z.string().trim().max(4).optional().nullable(),
  separateQueue: z.boolean().default(false),
  availabilityStatus: z.enum(["available", "busy", "break", "off_duty"]).default("available"),
  serviceIds: z.array(z.string().uuid()).default([]),
  schedules: z.array(scheduleItemSchema).optional(),
  account: z
    .object({
      email: z.string().email("To'g'ri email kiriting"),
      username: z.string().trim().min(3).max(50).optional().nullable(),
      password: z.string().min(8, "Parol kamida 8 ta belgidan iborat bo'lishi kerak"),
      phone: z.string().trim().max(25).optional().nullable(),
    })
    .optional()
    .nullable(),
});

const patchDoctorSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update_profile"),
    doctorId: z.string().uuid(),
    fullName: z.string().trim().min(3).max(120),
    specialization: z.string().trim().min(2).max(120),
    experienceYears: z.number().int().min(0).max(70),
    biography: z.string().trim().max(1000).optional().nullable(),
    photoUrl: z.string().trim().max(500).optional().nullable(),
    roomId: z.string().uuid().optional().nullable(),
    consultationPrice: z.number().min(0),
    queuePrefix: z.string().trim().max(4).optional().nullable(),
    separateQueue: z.boolean().default(false),
    availabilityStatus: z.enum(["available", "busy", "break", "off_duty"]),
    serviceIds: z.array(z.string().uuid()),
    schedules: z.array(scheduleItemSchema).optional(),
  }),
  z.object({
    action: z.literal("toggle_active"),
    doctorId: z.string().uuid(),
    isActive: z.boolean(),
  }),
  z.object({
    action: z.literal("reset_password"),
    doctorId: z.string().uuid(),
    newPassword: z.string().min(8, "Yangi parol kamida 8 ta belgi bo'lishi kerak"),
  }),
  z.object({
    action: z.literal("create_account"),
    doctorId: z.string().uuid(),
    email: z.string().email(),
    username: z.string().trim().min(3).max(50).optional().nullable(),
    password: z.string().min(8),
  }),
]);

export async function GET() {
  const auth = await requireApiRole(["super_admin"]);
  if (!auth.ok) return auth.response;

  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();

  try {
    const [doctorsRes, roomsRes, servicesRes] = await Promise.all([
      admin
        .from("doctors")
        .select(
          "*, room:rooms(*), user_profile:user_profiles(id, email, username, is_active, last_login_at), doctor_services(id, service_id, custom_price, is_active, service:services(id, name, price)), doctor_schedules(*)"
        )
        .eq("clinic_id", clinicId)
        .order("full_name", { ascending: true }),
      admin
        .from("rooms")
        .select("*")
        .eq("clinic_id", clinicId)
        .order("room_number", { ascending: true }),
      admin
        .from("services")
        .select("*")
        .eq("clinic_id", clinicId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    return NextResponse.json({
      doctors: doctorsRes.data ?? [],
      rooms: roomsRes.data ?? [],
      services: servicesRes.data ?? [],
    });
  } catch (err) {
    console.error("[api/super-admin/doctors GET]", err);
    return NextResponse.json({ error: "Shifokorlarni yuklashda xatolik." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiRole(["super_admin"]);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Noto'g'ri JSON." }, { status: 400 });
  }

  const parsed = createDoctorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Ma'lumotlar noto'g'ri." },
      { status: 400 }
    );
  }

  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();
  let createdUserId: string | null = null;

  try {
    if (parsed.data.account) {
      const normEmail = parsed.data.account.email.trim().toLowerCase();
      const normUsername = parsed.data.account.username?.trim().toLowerCase() || null;

      const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
        email: normEmail,
        password: parsed.data.account.password,
        email_confirm: true,
        app_metadata: { clinic_id: clinicId, role: "doctor" },
      });

      if (authErr || !authUser.user) {
        return NextResponse.json(
          { error: authErr?.message || "Shifokor hisobini yaratib bo'lmadi." },
          { status: 400 }
        );
      }
      createdUserId = authUser.user.id;

      const { error: profErr } = await admin.from("user_profiles").insert({
        id: createdUserId,
        clinic_id: clinicId,
        role: "doctor",
        full_name: parsed.data.fullName,
        username: normUsername,
        email: normEmail,
        phone: parsed.data.account.phone || null,
        is_active: true,
      });

      if (profErr) {
        await admin.auth.admin.deleteUser(createdUserId);
        return NextResponse.json({ error: profErr.message }, { status: 400 });
      }
    }

    const { data: doctor, error: docErr } = await admin
      .from("doctors")
      .insert({
        clinic_id: clinicId,
        user_id: createdUserId,
        full_name: parsed.data.fullName,
        specialization: parsed.data.specialization,
        experience_years: parsed.data.experienceYears,
        biography: parsed.data.biography ?? null,
        photo_url: parsed.data.photoUrl ?? null,
        room_id: parsed.data.roomId ?? null,
        consultation_price: parsed.data.consultationPrice,
        queue_prefix: parsed.data.queuePrefix ? parsed.data.queuePrefix.toUpperCase() : null,
        separate_queue: parsed.data.separateQueue,
        availability_status: parsed.data.availabilityStatus,
        is_active: true,
      })
      .select("*")
      .single();

    if (docErr || !doctor) {
      if (createdUserId) await admin.auth.admin.deleteUser(createdUserId);
      return NextResponse.json({ error: docErr?.message || "Shifokor saqlanmadi." }, { status: 400 });
    }

    if (parsed.data.serviceIds.length > 0) {
      await admin.from("doctor_services").insert(
        parsed.data.serviceIds.map((serviceId) => ({
          clinic_id: clinicId,
          doctor_id: doctor.id,
          service_id: serviceId,
          is_active: true,
        }))
      );
    }

    const schedulesToInsert =
      parsed.data.schedules && parsed.data.schedules.length > 0
        ? parsed.data.schedules.map((s) => ({
            clinic_id: clinicId,
            doctor_id: doctor.id,
            day_of_week: s.dayOfWeek,
            start_time: s.startTime,
            end_time: s.endTime,
            break_start: s.breakStart || null,
            break_end: s.breakEnd || null,
            is_working: s.isWorking,
          }))
        : [1, 2, 3, 4, 5, 6].map((day) => ({
            clinic_id: clinicId,
            doctor_id: doctor.id,
            day_of_week: day,
            start_time: "09:00",
            end_time: "18:00",
            break_start: "13:00",
            break_end: "14:00",
            is_working: true,
          }));

    await admin.from("doctor_schedules").insert(schedulesToInsert);

    await recordAuditLog({
      clinicId,
      actorUserId: auth.session.userId,
      action: "doctor.created",
      entityType: "doctor",
      entityId: doctor.id,
      summary: `Yangi shifokor qo'shildi: ${doctor.full_name} (${doctor.specialization})`,
      newValues: { full_name: doctor.full_name, has_account: Boolean(createdUserId) },
    });

    return NextResponse.json({ doctor }, { status: 201 });
  } catch (err) {
    if (createdUserId) {
      await admin.auth.admin.deleteUser(createdUserId).catch(() => {});
    }
    console.error("[api/super-admin/doctors POST]", err);
    return NextResponse.json({ error: "Shifokor yaratishda xatolik." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireApiRole(["super_admin"]);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Noto'g'ri JSON." }, { status: 400 });
  }

  const parsed = patchDoctorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Noto'g'ri ma'lumot." },
      { status: 400 }
    );
  }

  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();

  try {
    const { data: doctor } = await admin
      .from("doctors")
      .select("*")
      .eq("id", parsed.data.doctorId)
      .eq("clinic_id", clinicId)
      .single();

    if (!doctor) {
      return NextResponse.json({ error: "Shifokor topilmadi." }, { status: 404 });
    }

    if (parsed.data.action === "toggle_active") {
      await admin
        .from("doctors")
        .update({ is_active: parsed.data.isActive })
        .eq("id", doctor.id);

      if (doctor.user_id) {
        await admin
          .from("user_profiles")
          .update({ is_active: parsed.data.isActive })
          .eq("id", doctor.user_id);
      }

      await recordAuditLog({
        clinicId,
        actorUserId: auth.session.userId,
        action: "doctor.status_changed",
        entityType: "doctor",
        entityId: doctor.id,
        summary: `Shifokor holati o'zgartirildi: ${doctor.full_name} -> ${parsed.data.isActive ? "Faol" : "Faol emas"}`,
        previousValues: { is_active: doctor.is_active },
        newValues: { is_active: parsed.data.isActive },
      });

      return NextResponse.json({ ok: true });
    }

    if (parsed.data.action === "reset_password") {
      if (!doctor.user_id) {
        return NextResponse.json(
          { error: "Ushbu shifokorga tizim hisobi biriktirilmagan." },
          { status: 400 }
        );
      }

      const { error } = await admin.auth.admin.updateUserById(doctor.user_id, {
        password: parsed.data.newPassword,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      await recordAuditLog({
        clinicId,
        actorUserId: auth.session.userId,
        action: "user.password_reset",
        entityType: "doctor",
        entityId: doctor.id,
        summary: `Shifokor paroli yangilandi: ${doctor.full_name}`,
      });

      return NextResponse.json({ ok: true });
    }

    if (parsed.data.action === "create_account") {
      if (doctor.user_id) {
        return NextResponse.json(
          { error: "Shifokorda allaqachon tizim hisobi mavjud." },
          { status: 400 }
        );
      }

      const normEmail = parsed.data.email.trim().toLowerCase();
      const normUsername = parsed.data.username?.trim().toLowerCase() || null;

      const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
        email: normEmail,
        password: parsed.data.password,
        email_confirm: true,
        app_metadata: { clinic_id: clinicId, role: "doctor" },
      });
      if (authErr || !authUser.user) {
        return NextResponse.json({ error: authErr?.message || "Hisob yaratilmadi." }, { status: 400 });
      }

      const { error: profErr } = await admin.from("user_profiles").insert({
        id: authUser.user.id,
        clinic_id: clinicId,
        role: "doctor",
        full_name: doctor.full_name,
        username: normUsername,
        email: normEmail,
        is_active: doctor.is_active,
      });

      if (profErr) {
        await admin.auth.admin.deleteUser(authUser.user.id);
        return NextResponse.json({ error: profErr.message }, { status: 400 });
      }

      await admin.from("doctors").update({ user_id: authUser.user.id }).eq("id", doctor.id);

      await recordAuditLog({
        clinicId,
        actorUserId: auth.session.userId,
        action: "user.created",
        entityType: "doctor",
        entityId: doctor.id,
        summary: `Shifokorga tizim hisobi yaratildi: ${doctor.full_name}`,
      });

      return NextResponse.json({ ok: true });
    }

    // Update profile + services + schedules
    const d = parsed.data;
    const { error: updErr } = await admin
      .from("doctors")
      .update({
        full_name: d.fullName,
        specialization: d.specialization,
        experience_years: d.experienceYears,
        biography: d.biography ?? null,
        photo_url: d.photoUrl ?? null,
        room_id: d.roomId ?? null,
        consultation_price: d.consultationPrice,
        queue_prefix: d.queuePrefix ? d.queuePrefix.toUpperCase() : null,
        separate_queue: d.separateQueue,
        availability_status: d.availabilityStatus,
      })
      .eq("id", doctor.id);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 400 });
    }

    if (doctor.user_id) {
      await admin
        .from("user_profiles")
        .update({ full_name: d.fullName })
        .eq("id", doctor.user_id);
    }

    // Sync doctor_services while preserving existing custom_price overrides
    const { data: existingLinks } = await admin
      .from("doctor_services")
      .select("service_id, custom_price")
      .eq("doctor_id", doctor.id);

    const customPriceMap = new Map<string, number | null>();
    for (const link of existingLinks ?? []) {
      customPriceMap.set(
        link.service_id,
        link.custom_price === null || link.custom_price === undefined
          ? null
          : Number(link.custom_price)
      );
    }

    await admin.from("doctor_services").delete().eq("doctor_id", doctor.id);
    if (d.serviceIds.length > 0) {
      const uniqueServiceIds = Array.from(new Set(d.serviceIds));
      await admin.from("doctor_services").insert(
        uniqueServiceIds.map((serviceId) => ({
          clinic_id: clinicId,
          doctor_id: doctor.id,
          service_id: serviceId,
          custom_price: customPriceMap.get(serviceId) ?? null,
          is_active: true,
        }))
      );
    }

    if (d.schedules && d.schedules.length > 0) {
      for (const s of d.schedules) {
        await admin.from("doctor_schedules").upsert(
          {
            clinic_id: clinicId,
            doctor_id: doctor.id,
            day_of_week: s.dayOfWeek,
            start_time: s.startTime,
            end_time: s.endTime,
            break_start: s.breakStart || null,
            break_end: s.breakEnd || null,
            is_working: s.isWorking,
          },
          { onConflict: "doctor_id,day_of_week" }
        );
      }
      await recordAuditLog({
        clinicId,
        actorUserId: auth.session.userId,
        action: "doctor.schedule_updated",
        entityType: "doctor",
        entityId: doctor.id,
        summary: `Shifokor profili va ish jadvali yangilandi: ${d.fullName}`,
      });
    } else {
      await recordAuditLog({
        clinicId,
        actorUserId: auth.session.userId,
        action: "doctor.updated",
        entityType: "doctor",
        entityId: doctor.id,
        summary: `Shifokor profili yangilandi: ${d.fullName}`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/super-admin/doctors PATCH]", err);
    return NextResponse.json({ error: "Yangilashda xatolik." }, { status: 500 });
  }
}
