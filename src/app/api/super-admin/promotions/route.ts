import { NextResponse } from "next/server";
import { recordAuditLog, requireApiRole } from "@/lib/auth/guards";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { promotionSchema } from "@/lib/validators";

export async function GET() {
  const auth = await requireApiRole(["super_admin", "admin"]);
  if (!auth.ok) return auth.response;

  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();

  const { data, error } = await admin
    .from("promotions")
    .select("*, service:services(id, name, price)")
    .eq("clinic_id", clinicId)
    .order("ends_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ promotions: data ?? [] });
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

  const parsed = promotionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Aksiya ma'lumotlari noto'g'ri." },
      { status: 400 }
    );
  }

  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();

  const { data: promotion, error } = await admin
    .from("promotions")
    .insert({
      clinic_id: clinicId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      image_url: parsed.data.imageUrl ?? null,
      discount_type: parsed.data.discountType,
      discount_value: parsed.data.discountValue,
      service_id: parsed.data.serviceId || null,
      starts_at: parsed.data.startsAt,
      ends_at: parsed.data.endsAt,
      is_active: parsed.data.isActive,
    })
    .select("*")
    .single();

  if (error || !promotion) {
    return NextResponse.json({ error: error?.message || "Aksiya yaratilmadi." }, { status: 400 });
  }

  await recordAuditLog({
    clinicId,
    actorUserId: auth.session.userId,
    action: "promotion.created",
    entityType: "promotion",
    entityId: promotion.id,
    summary: `Yangi chegirma/aksiya yaratildi: ${promotion.title}`,
  });

  return NextResponse.json({ promotion }, { status: 201 });
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

  const parsed = promotionSchema.safeParse(body);
  if (!parsed.success || !parsed.data.id) {
    return NextResponse.json(
      { error: parsed.success ? "Aksiya ID kerak." : parsed.error.issues[0]?.message },
      { status: 400 }
    );
  }

  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();

  const { data: promotion, error } = await admin
    .from("promotions")
    .update({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      image_url: parsed.data.imageUrl ?? null,
      discount_type: parsed.data.discountType,
      discount_value: parsed.data.discountValue,
      service_id: parsed.data.serviceId || null,
      starts_at: parsed.data.startsAt,
      ends_at: parsed.data.endsAt,
      is_active: parsed.data.isActive,
    })
    .eq("id", parsed.data.id)
    .eq("clinic_id", clinicId)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await recordAuditLog({
    clinicId,
    actorUserId: auth.session.userId,
    action: "promotion.updated",
    entityType: "promotion",
    entityId: promotion.id,
    summary: `Aksiya yangilandi: ${promotion.title}`,
  });

  return NextResponse.json({ promotion });
}

export async function DELETE(request: Request) {
  const auth = await requireApiRole(["super_admin"]);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Aksiya ID ko'rsatilmagan." }, { status: 400 });
  }

  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();

  await admin.from("promotions").delete().eq("id", id).eq("clinic_id", clinicId);
  await recordAuditLog({
    clinicId,
    actorUserId: auth.session.userId,
    action: "promotion.deleted",
    entityType: "promotion",
    entityId: id,
    summary: "Aksiya o'chirildi",
  });

  return NextResponse.json({ ok: true });
}
