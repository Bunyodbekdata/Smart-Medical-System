import { NextResponse } from "next/server";
import { isSupabaseConfigured, isSupabaseServiceConfigured } from "@/lib/supabase/env";

export async function GET() {
  return NextResponse.json({
    ok: true,
    supabaseConfigured: isSupabaseConfigured(),
    serviceConfigured: isSupabaseServiceConfigured(),
    timezone: "Asia/Tashkent",
    timestamp: new Date().toISOString(),
  });
}
