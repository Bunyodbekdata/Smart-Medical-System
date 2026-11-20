import { NextResponse } from "next/server";
import { recordAuditLog, requireApiRole } from "@/lib/auth/guards";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { serviceSchema } from "@/lib/validators";

export async function GET() {
  const auth = await requireApiRole(["super_admin", "admin"]);
  if (!auth.ok) return auth.response;

  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();

  const { data, error } = await admin
    .from("services")
    .select("*, doctor_services(doctor_id, is_active, doctor:doctors(id, full_name))")
    .eq("clinic_id", clinicId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ services: data ?? [] });
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

  const parsed = serviceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Ma'lumot noto'g'ri." },
      { status: 400 }
    );
  }

  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();

  const { data: service, error } = await admin
    .from("services")
    .insert({
      clinic_id: clinicId,
      name: parsed.data.name,
      category: parsed.data.category,
      description: parsed.data.description ?? null,
      icon_name: parsed.data.iconName,
      image_url: parsed.data.imageUrl ?? null,
      price: parsed.data.price,
      duration_minutes: parsed.data.durationMinutes,
      queue_prefix: parsed.data.queuePrefix.toUpperCase(),
      sort_order: parsed.data.sortOrder,
      is_active: parsed.data.isActive,
    })
    .select("*")
    .single();

  if (error || !service) {
    return NextResponse.json({ error: error?.message || "Xizmat saqlanmadi." }, { status: 400 });
  }

  await recordAuditLog({
    clinicId,
    actorUserId: auth.session.userId,
    action: "service.created",
    entityType: "service",
    entityId: service.id,
    summary: `Yangi tibbiy xizmat qo'shildi: ${service.name} (${service.price} UZS)`,
    newValues: { name: service.name, price: service.price },
  });

  return NextResponse.json({ service }, { status: 201 });
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

  const parsed = serviceSchema.safeParse(body);
  if (!parsed.success || !parsed.data.id) {
    return NextResponse.json(
      { error: parsed.success ? "Xizmat ID kerak." : parsed.error.issues[0]?.message },
      { status: 400 }
    );
  }

  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();

  const { data: existing } = await admin
    .from("services")
    .select("*")
    .eq("id", parsed.data.id)
    .eq("clinic_id", clinicId)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Xizmat topilmadi." }, { status: 404 });
  }

  const { data: updated, error } = await admin
    .from("services")
    .update({
      name: parsed.data.name,
      category: parsed.data.category,
      description: parsed.data.description ?? null,
      icon_name: parsed.data.iconName,
      image_url: parsed.data.imageUrl ?? null,
      price: parsed.data.price,
      duration_minutes: parsed.data.durationMinutes,
      queue_prefix: parsed.data.queuePrefix.toUpperCase(),
      sort_order: parsed.data.sortOrder,
      is_active: parsed.data.isActive,
    })
    .eq("id", existing.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await recordAuditLog({
    clinicId,
    actorUserId: auth.session.userId,
    action: "service.updated",
    entityType: "service",
    entityId: existing.id,
    summary: `Xizmat yangilandi: ${updated.name}`,
    previousValues: { price: existing.price, is_active: existing.is_active },
    newValues: { price: updated.price, is_active: updated.is_active },
  });

  return NextResponse.json({ service: updated });
}

export async function DELETE(request: Request) {
  const auth = await requireApiRole(["super_admin"]);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Xizmat ID ko'rsatilmagan." }, { status: 400 });
  }

  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();

  const { count } = await admin
    .from("queue_tickets")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .eq("service_id", id);

  if ((count ?? 0) > 0) {
    await admin
      .from("services")
      .update({ is_active: false })
      .eq("id", id)
      .eq("clinic_id", clinicId);

    await recordAuditLog({
      clinicId,
      actorUserId: auth.session.userId,
      action: "service.deactivated",
      entityType: "service",
      entityId: id,
      summary: "Xizmatda navbat yozuvlari borligi sababli nofaol holatga o'tkazildi",
    });

    return NextResponse.json({ ok: true, deactivated: true });
  }

  await admin.from("services").delete().eq("id", id).eq("clinic_id", clinicId);
  await recordAuditLog({
    clinicId,
    actorUserId: auth.session.userId,
    action: "service.deleted",
    entityType: "service",
    entityId: id,
    summary: "Xizmat o'chirildi",
  });

  return NextResponse.json({ ok: true, deleted: true });
}
