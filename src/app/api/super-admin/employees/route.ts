import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAuditLog, requireApiRole } from "@/lib/auth/guards";
import { createServiceRoleClient } from "@/lib/supabase/server";

const createEmployeeSchema = z.object({
  fullName: z.string().trim().min(3, "F.I.Sh. kamida 3 ta belgi").max(120),
  username: z.string().trim().min(3, "Login kamida 3 ta belgi").max(50),
  email: z.string().email("To'g'ri email kiriting"),
  phone: z.string().trim().max(25).optional().nullable(),
  password: z.string().min(8, "Parol kamida 8 ta belgi bo'lishi kerak"),
  role: z.enum(["admin", "super_admin"]).default("admin"),
});

const patchEmployeeSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    userId: z.string().uuid(),
    fullName: z.string().trim().min(3).max(120),
    username: z.string().trim().min(3).max(50),
    phone: z.string().trim().max(25).optional().nullable(),
    role: z.enum(["admin", "super_admin"]),
    isActive: z.boolean(),
  }),
  z.object({
    action: z.literal("reset_password"),
    userId: z.string().uuid(),
    newPassword: z.string().min(8, "Yangi parol kamida 8 ta belgi bo'lishi kerak"),
  }),
]);

export async function GET() {
  const auth = await requireApiRole(["super_admin"]);
  if (!auth.ok) return auth.response;

  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();

  try {
    const [profilesRes, recentLogsRes] = await Promise.all([
      admin
        .from("user_profiles")
        .select("*")
        .eq("clinic_id", clinicId)
        .in("role", ["admin", "super_admin"])
        .order("created_at", { ascending: false }),
      admin
        .from("audit_logs")
        .select("id, actor_user_id, actor_name, action, summary, created_at")
        .eq("clinic_id", clinicId)
        .not("actor_user_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(80),
    ]);

    return NextResponse.json({
      employees: profilesRes.data ?? [],
      activityHistory: recentLogsRes.data ?? [],
    });
  } catch (err) {
    console.error("[api/super-admin/employees GET]", err);
    return NextResponse.json({ error: "Xodimlarni yuklashda xatolik." }, { status: 500 });
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

  const parsed = createEmployeeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Ma'lumotlar noto'g'ri." },
      { status: 400 }
    );
  }

  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();

  try {
    const normalizedEmail = parsed.data.email.trim().toLowerCase();
    const normalizedUsername = parsed.data.username.trim().toLowerCase();

    const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password: parsed.data.password,
      email_confirm: true,
      app_metadata: { clinic_id: clinicId, role: parsed.data.role },
    });

    if (authErr || !authUser.user) {
      return NextResponse.json(
        { error: authErr?.message || "Xodim hisobini yaratib bo'lmadi." },
        { status: 400 }
      );
    }

    const { data: profile, error: profErr } = await admin
      .from("user_profiles")
      .insert({
        id: authUser.user.id,
        clinic_id: clinicId,
        role: parsed.data.role,
        full_name: parsed.data.fullName,
        username: normalizedUsername,
        email: normalizedEmail,
        phone: parsed.data.phone ?? null,
        is_active: true,
      })
      .select("*")
      .single();

    if (profErr || !profile) {
      await admin.auth.admin.deleteUser(authUser.user.id);
      return NextResponse.json({ error: profErr?.message || "Profil saqlanmadi." }, { status: 400 });
    }

    await recordAuditLog({
      clinicId,
      actorUserId: auth.session.userId,
      action: "user.created",
      entityType: "user_profile",
      entityId: profile.id,
      summary: `Yangi xodim yaratildi: ${profile.full_name} (${profile.role})`,
      newValues: { role: profile.role, email: profile.email, username: profile.username },
    });

    return NextResponse.json({ employee: profile }, { status: 201 });
  } catch (err) {
    console.error("[api/super-admin/employees POST]", err);
    return NextResponse.json({ error: "Xodim yaratishda xatolik." }, { status: 500 });
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

  const parsed = patchEmployeeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Ma'lumotlar noto'g'ri." },
      { status: 400 }
    );
  }

  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();

  try {
    const { data: target } = await admin
      .from("user_profiles")
      .select("*")
      .eq("id", parsed.data.userId)
      .eq("clinic_id", clinicId)
      .single();

    if (!target) {
      return NextResponse.json({ error: "Xodim topilmadi." }, { status: 404 });
    }

    if (parsed.data.action === "reset_password") {
      const { error } = await admin.auth.admin.updateUserById(target.id, {
        password: parsed.data.newPassword,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      await recordAuditLog({
        clinicId,
        actorUserId: auth.session.userId,
        action: "user.password_reset",
        entityType: "user_profile",
        entityId: target.id,
        summary: `Xodim paroli yangilandi: ${target.full_name}`,
      });

      return NextResponse.json({ ok: true });
    }

    // Guard against Super Admin deactivating themselves accidentally
    if (target.id === auth.session.userId && !parsed.data.isActive) {
      return NextResponse.json(
        { error: "O'zingizning faol hisobingizni o'chira olmaysiz." },
        { status: 400 }
      );
    }

    const { data: updated, error } = await admin
      .from("user_profiles")
      .update({
        full_name: parsed.data.fullName,
        username: parsed.data.username.trim().toLowerCase(),
        phone: parsed.data.phone ?? null,
        role: parsed.data.role,
        is_active: parsed.data.isActive,
      })
      .eq("id", target.id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await admin.auth.admin.updateUserById(target.id, {
      app_metadata: { clinic_id: clinicId, role: parsed.data.role },
    });

    await recordAuditLog({
      clinicId,
      actorUserId: auth.session.userId,
      action: "user.updated",
      entityType: "user_profile",
      entityId: target.id,
      summary: `Xodim ma'lumotlari yangilandi: ${updated.full_name}`,
      previousValues: { role: target.role, is_active: target.is_active },
      newValues: { role: updated.role, is_active: updated.is_active },
    });

    return NextResponse.json({ employee: updated });
  } catch (err) {
    console.error("[api/super-admin/employees PATCH]", err);
    return NextResponse.json({ error: "Xodimni yangilashda xatolik." }, { status: 500 });
  }
}
