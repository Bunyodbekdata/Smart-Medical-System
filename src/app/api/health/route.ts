import { NextResponse } from "next/server";
import {
  getDatabaseMode,
  isSupabaseConfigured,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/env";

export async function GET() {
  return NextResponse.json({
    ok: true,
    databaseMode: getDatabaseMode(),
    supabaseConfigured: isSupabaseConfigured(),
    serviceConfigured: isSupabaseServiceConfigured(),
    timezone: "Asia/Tashkent",
    timestamp: new Date().toISOString(),
  });
}
