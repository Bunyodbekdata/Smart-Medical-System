import { NextResponse } from "next/server";
import { recordAuditLog } from "@/lib/auth/guards";
import { getRoleHomeRoute } from "@/lib/formatters";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { isSupabaseServiceConfigured } from "@/lib/supabase/env";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { staffLoginSchema } from "@/lib/validators";
import type { UserProfile } from "@/types/database";

export async function POST(request: Request) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json(
      { error: "Tizim ma'lumotlar bazasi sozlanmagan." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Noto'g'ri so'rov formati." }, { status: 400 });
  }

  const parsed = staffLoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Login va parolni kiriting." },
      { status: 400 }
    );
  }

  const forwarded = request.headers.get("x-forwarded-for");
  const clientIp = forwarded?.split(",")[0]?.trim() || "local";
  const identifier = parsed.data.identifier.trim().toLowerCase();
  const rateKey = `login:${clientIp}:${identifier}`;
  const rate = checkRateLimit(rateKey, 8, 5 * 60_000);

  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: `Juda ko'p muvaffaqiyatsiz urinish. ${rate.retryAfterSeconds} soniyadan so'ng qayta urinib ko'ring.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rate.retryAfterSeconds),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  const admin = createServiceRoleClient();
  const supabase = await createServerSupabaseClient();

  try {
    let emailToSignIn = identifier;

    if (!identifier.includes("@")) {
      const { data: profileByUsername } = await admin
        .from("user_profiles")
        .select("email")
        .ilike("username", identifier)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (!profileByUsername?.email) {
        return NextResponse.json(
          { error: "Login yoki parol noto'g'ri." },
          { status: 401 }
        );
      }
      emailToSignIn = profileByUsername.email;
    }

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email: emailToSignIn,
        password: parsed.data.password,
      });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: "Login yoki parol noto'g'ri." },
        { status: 401 }
      );
    }

    const { data: profile } = await admin
      .from("user_profiles")
      .select("*")
      .eq("id", authData.user.id)
      .maybeSingle<UserProfile>();

    if (!profile || !profile.is_active) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: "Sizning hisobingiz faol emas. Rahbariyatga murojaat qiling." },
        { status: 403 }
      );
    }

    if (profile.role === "doctor") {
      const { data: doctor } = await admin
        .from("doctors")
        .select("id")
        .eq("user_id", profile.id)
        .eq("is_active", true)
        .maybeSingle();

      if (!doctor) {
        await supabase.auth.signOut();
        return NextResponse.json(
          { error: "Shifokor profili faol emas yoki biriktirilmagan." },
          { status: 403 }
        );
      }
    }

    resetRateLimit(rateKey);

    await admin
      .from("user_profiles")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", profile.id);

    await recordAuditLog({
      clinicId: profile.clinic_id,
      actorUserId: profile.id,
      action: "auth.login",
      entityType: "user_profile",
      entityId: profile.id,
      summary: `${profile.full_name} (${profile.role}) tizimga kirdi`,
    });

    return NextResponse.json({
      role: profile.role,
      fullName: profile.full_name,
      redirectTo: getRoleHomeRoute(profile.role),
    });
  } catch (err) {
    console.error("[api/auth/login]", err);
    return NextResponse.json(
      { error: "Kirish jarayonida xatolik yuz berdi." },
      { status: 500 }
    );
  }
}
