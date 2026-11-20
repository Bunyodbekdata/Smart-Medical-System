import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/guards";
import { getTashkentDateString } from "@/lib/formatters";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function GET() {
  const auth = await requireApiRole(["admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();
  const today = getTashkentDateString();

  const [doctorsRes, servicesRes, promotionsRes, settingsRes] = await Promise.all([
    admin
      .from("doctors")
      .select("*, room:rooms(*), doctor_services(service_id, custom_price, is_active)")
      .eq("clinic_id", clinicId)
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
    admin
      .from("services")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    admin
      .from("promotions")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("is_active", true)
      .lte("starts_at", today)
      .gte("ends_at", today),
    admin
      .from("clinic_settings")
      .select("clinic_name, address, phone, logo_url, receipt_header, receipt_footer")
      .eq("clinic_id", clinicId)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    doctors: doctorsRes.data ?? [],
    services: servicesRes.data ?? [],
    promotions: promotionsRes.data ?? [],
    clinicSettings: settingsRes.data ?? null,
  });
}
