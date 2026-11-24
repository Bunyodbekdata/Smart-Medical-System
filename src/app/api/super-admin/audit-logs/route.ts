import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/guards";
import { parseSafeInt, sanitizePostgrestFilter } from "@/lib/formatters";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const auth = await requireApiRole(["super_admin"]);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const action = sanitizePostgrestFilter(searchParams.get("action") || "");
  const entityType = (searchParams.get("entityType") || "").trim();
  const q = sanitizePostgrestFilter(searchParams.get("q") || "");
  const page = parseSafeInt(searchParams.get("page"), 1, 1, 10_000);
  const pageSize = parseSafeInt(searchParams.get("pageSize"), 30, 15, 100);

  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();

  try {
    let query = admin
      .from("audit_logs")
      .select("*", { count: "exact" })
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false });

    if (action && action !== "all") query = query.ilike("action", `%${action}%`);
    if (entityType && entityType !== "all") query = query.eq("entity_type", entityType);
    if (q) {
      query = query.or(`summary.ilike.%${q}%,actor_name.ilike.%${q}%,action.ilike.%${q}%`);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, count, error } = await query.range(from, to);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      logs: data ?? [],
      total: count ?? 0,
      page,
      pageSize,
    });
  } catch (err) {
    console.error("[api/super-admin/audit-logs GET]", err);
    return NextResponse.json({ error: "Audit jurnalini yuklashda xatolik." }, { status: 500 });
  }
}
