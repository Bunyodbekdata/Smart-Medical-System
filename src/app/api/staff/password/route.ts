import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAuditLog, requireApiRole } from "@/lib/auth/guards";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";

const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Joriy parolni kiriting").max(128),
    newPassword: z
      .string()
      .min(8, "Yangi parol kamida 8 ta belgidan iborat bo'lishi kerak")
      .max(128),
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: "Yangi parol joriy paroldan farq qilishi kerak",
    path: ["newPassword"],
  });

export async function POST(request: Request) {
  const auth = await requireApiRole(["doctor", "admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Noto'g'ri JSON." }, { status: 400 });
  }

  const parsed = passwordChangeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Parol ma'lumotlari noto'g'ri." },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabaseClient();
  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email: auth.session.profile.email,
    password: parsed.data.currentPassword,
  });

  if (verifyErr) {
    return NextResponse.json(
      { error: "Joriy parol noto'g'ri kiritildi." },
      { status: 400 }
    );
  }

  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.updateUserById(auth.session.userId, {
    password: parsed.data.newPassword,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await recordAuditLog({
    clinicId: auth.session.profile.clinic_id,
    actorUserId: auth.session.userId,
    action: "auth.password_changed",
    entityType: "user_profile",
    entityId: auth.session.userId,
    summary: `${auth.session.profile.full_name} o'z parolini yangiladi`,
  });

  return NextResponse.json({ ok: true });
}
