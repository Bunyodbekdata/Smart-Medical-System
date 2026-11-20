import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getRoleHomeRoute } from "@/lib/formatters";
import { isSupabaseConfigured, isSupabaseServiceConfigured } from "@/lib/supabase/env";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { Doctor, UserProfile, UserRole } from "@/types/database";

export interface StaffSession {
  userId: string;
  profile: UserProfile;
  doctor: Doctor | null;
}

export function hasRoleAccess(role: UserRole | null | undefined, allowedRoles: UserRole[]): boolean {
  if (!role) return false;
  return allowedRoles.includes(role);
}

export async function getCurrentStaffSession(): Promise<StaffSession | null> {
  if (!isSupabaseConfigured() || !isSupabaseServiceConfigured()) {
    return null;
  }

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return null;
    }

    const adminClient = createServiceRoleClient();
    const { data: profile, error: profileError } = await adminClient
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .eq("is_active", true)
      .single<UserProfile>();

    if (profileError || !profile) {
      return null;
    }

    let doctor: Doctor | null = null;
    if (profile.role === "doctor") {
      const { data: docData } = await adminClient
        .from("doctors")
        .select("*, room:rooms(*)")
        .eq("user_id", profile.id)
        .eq("clinic_id", profile.clinic_id)
        .eq("is_active", true)
        .single<Doctor>();
      doctor = docData ?? null;
    }

    return {
      userId: user.id,
      profile,
      doctor,
    };
  } catch {
    return null;
  }
}

export async function requirePageRole(allowedRoles: UserRole[]): Promise<StaffSession> {
  const session = await getCurrentStaffSession();
  if (!session) {
    redirect("/staff/login");
  }
  if (!hasRoleAccess(session.profile.role, allowedRoles)) {
    redirect(getRoleHomeRoute(session.profile.role));
  }
  if (session.profile.role === "doctor" && !session.doctor) {
    redirect("/staff/login?error=doctor_profile_missing");
  }
  return session;
}

export type ApiAuthResult =
  | { ok: true; session: StaffSession }
  | { ok: false; response: NextResponse };

export async function requireApiRole(allowedRoles: UserRole[]): Promise<ApiAuthResult> {
  if (!isSupabaseConfigured() || !isSupabaseServiceConfigured()) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Tizim ma'lumotlar bazasi hali sozlanmagan." },
        { status: 503 }
      ),
    };
  }

  const session = await getCurrentStaffSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Avtorizatsiya talab qilinadi. Iltimos, tizimga kiring." },
        { status: 401 }
      ),
    };
  }

  if (!hasRoleAccess(session.profile.role, allowedRoles)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Sizda ushbu amalni bajarish uchun ruxsat yo'q." },
        { status: 403 }
      ),
    };
  }

  if (session.profile.role === "doctor" && !session.doctor) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Shifokor profili biriktirilmagan. Rahbariyatga murojaat qiling." },
        { status: 403 }
      ),
    };
  }

  return { ok: true, session };
}

export async function recordAuditLog(params: {
  clinicId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  reason?: string | null;
}) {
  if (!isSupabaseServiceConfigured()) return;
  try {
    const admin = createServiceRoleClient();
    await admin.rpc("write_audit_log", {
      p_clinic_id: params.clinicId,
      p_actor_user_id: params.actorUserId,
      p_action: params.action,
      p_entity_type: params.entityType,
      p_entity_id: params.entityId ?? null,
      p_summary: params.summary,
      p_previous_values: params.previousValues ?? null,
      p_new_values: params.newValues ?? null,
      p_reason: params.reason ?? null,
    });
  } catch (err) {
    console.error("[audit-log] Failed to record audit log:", err);
  }
}
