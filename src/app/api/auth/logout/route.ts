import { NextResponse } from "next/server";
import { getCurrentStaffSession, recordAuditLog } from "@/lib/auth/guards";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true });
  }

  try {
    const session = await getCurrentStaffSession();
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();

    if (session) {
      await recordAuditLog({
        clinicId: session.profile.clinic_id,
        actorUserId: session.profile.id,
        action: "auth.logout",
        entityType: "user_profile",
        entityId: session.profile.id,
        summary: `${session.profile.full_name} tizimdan chiqdi`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/auth/logout]", err);
    return NextResponse.json({ ok: true });
  }
}
