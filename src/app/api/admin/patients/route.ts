import { NextResponse } from "next/server";
import { recordAuditLog, requireApiRole } from "@/lib/auth/guards";
import { normalizeUzPhone, sanitizePostgrestFilter } from "@/lib/formatters";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { z } from "zod";
import { uzPhoneSchema } from "@/lib/validators";

const createPatientSchema = z.object({
  fullName: z.string().trim().min(3, "F.I.Sh. kamida 3 ta belgi").max(120),
  phone: uzPhoneSchema,
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  consentGiven: z.boolean().default(true),
});

export async function GET(request: Request) {
  const auth = await requireApiRole(["admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const checkPhone = (searchParams.get("checkPhone") || "").trim();
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.min(50, Math.max(10, Number(searchParams.get("pageSize") || 20)));

  const admin = createServiceRoleClient();
  const clinicId = auth.session.profile.clinic_id;

  try {
    if (checkPhone) {
      const norm = normalizeUzPhone(checkPhone);
      if (norm.length < 7) {
        return NextResponse.json({ duplicates: [] });
      }
      const { data: duplicates } = await admin
        .from("patients")
        .select("id, full_name, phone, created_at")
        .eq("clinic_id", clinicId)
        .ilike("normalized_phone", `%${norm}%`)
        .limit(5);

      return NextResponse.json({ duplicates: duplicates ?? [] });
    }

    let query = admin
      .from("patients")
      .select("*", { count: "exact" })
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false });

    if (q) {
      const safeQ = sanitizePostgrestFilter(q);
      const norm = normalizeUzPhone(q);
      if (safeQ && norm.length >= 4) {
        query = query.or(`full_name.ilike.%${safeQ}%,normalized_phone.ilike.%${norm}%`);
      } else if (safeQ) {
        query = query.ilike("full_name", `%${safeQ}%`);
      } else if (norm.length >= 4) {
        query = query.ilike("normalized_phone", `%${norm}%`);
      }
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data: patients, count, error } = await query.range(from, to);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const patientIds = (patients ?? []).map((p) => p.id);
    const visitsByPatient = new Map<
      string,
      {
        visitCount: number;
        doctors: string[];
        services: string[];
        totalPaid: number;
        lastVisitAt: string | null;
      }
    >();

    if (patientIds.length > 0) {
      const { data: tickets } = await admin
        .from("queue_tickets")
        .select(
          "patient_id, paid_amount, created_at, doctor:doctors(full_name), service:services(name)"
        )
        .eq("clinic_id", clinicId)
        .in("patient_id", patientIds)
        .order("created_at", { ascending: false });

      for (const t of tickets ?? []) {
        const current = visitsByPatient.get(t.patient_id) ?? {
          visitCount: 0,
          doctors: [],
          services: [],
          totalPaid: 0,
          lastVisitAt: null,
        };
        current.visitCount += 1;
        current.totalPaid += Number(t.paid_amount ?? 0);
        if (!current.lastVisitAt) current.lastVisitAt = t.created_at;
        const docName = (t.doctor as unknown as { full_name?: string } | null)?.full_name;
        const srvName = (t.service as unknown as { name?: string } | null)?.name;
        if (docName && !current.doctors.includes(docName)) current.doctors.push(docName);
        if (srvName && !current.services.includes(srvName)) current.services.push(srvName);
        visitsByPatient.set(t.patient_id, current);
      }
    }

    const enriched = (patients ?? []).map((p) => ({
      ...p,
      summary: visitsByPatient.get(p.id) ?? {
        visitCount: 0,
        doctors: [],
        services: [],
        totalPaid: 0,
        lastVisitAt: null,
      },
    }));

    return NextResponse.json({
      patients: enriched,
      total: count ?? 0,
      page,
      pageSize,
    });
  } catch (err) {
    console.error("[api/admin/patients GET]", err);
    return NextResponse.json({ error: "Bemorlar ro'yxatini yuklashda xatolik." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiRole(["admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Noto'g'ri JSON." }, { status: 400 });
  }

  const parsed = createPatientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Noto'g'ri ma'lumot." },
      { status: 400 }
    );
  }

  const admin = createServiceRoleClient();
  const clinicId = auth.session.profile.clinic_id;
  const norm = normalizeUzPhone(parsed.data.phone);

  try {
    const { data: patient, error } = await admin
      .from("patients")
      .insert({
        clinic_id: clinicId,
        full_name: parsed.data.fullName,
        phone: parsed.data.phone,
        normalized_phone: norm,
        birth_date: parsed.data.birthDate ?? null,
        notes: parsed.data.notes ?? null,
        consent_given: parsed.data.consentGiven,
        consent_given_at: parsed.data.consentGiven ? new Date().toISOString() : null,
        created_by: auth.session.userId,
      })
      .select("*")
      .single();

    if (error || !patient) {
      return NextResponse.json({ error: error?.message || "Bemor saqlanmadi." }, { status: 400 });
    }

    await recordAuditLog({
      clinicId,
      actorUserId: auth.session.userId,
      action: "patient.created",
      entityType: "patient",
      entityId: patient.id,
      summary: `Bemor yaratildi: ${patient.full_name} (${patient.phone})`,
    });

    return NextResponse.json({ patient }, { status: 201 });
  } catch (err) {
    console.error("[api/admin/patients POST]", err);
    return NextResponse.json({ error: "Server xatosi." }, { status: 500 });
  }
}
