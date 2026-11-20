import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAuditLog, requireApiRole } from "@/lib/auth/guards";
import { createServiceRoleClient } from "@/lib/supabase/server";

const roomSchema = z.object({
  id: z.string().uuid().optional(),
  roomNumber: z.string().trim().min(1, "Xona raqamini kiriting").max(20),
  name: z.string().trim().max(100).optional().nullable(),
  floor: z.string().trim().max(40).optional().nullable(),
  isActive: z.boolean().default(true),
});

export async function GET() {
  const auth = await requireApiRole(["super_admin", "admin"]);
  if (!auth.ok) return auth.response;

  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();

  const { data, error } = await admin
    .from("rooms")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("room_number", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rooms: data ?? [] });
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

  const parsed = roomSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Noto'g'ri xona ma'lumotlari." },
      { status: 400 }
    );
  }

  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();

  const { data: room, error } = await admin
    .from("rooms")
    .insert({
      clinic_id: clinicId,
      room_number: parsed.data.roomNumber,
      name: parsed.data.name ?? null,
      floor: parsed.data.floor ?? null,
      is_active: parsed.data.isActive,
    })
    .select("*")
    .single();

  if (error || !room) {
    return NextResponse.json({ error: error?.message || "Xona yaratilmadi." }, { status: 400 });
  }

  await recordAuditLog({
    clinicId,
    actorUserId: auth.session.userId,
    action: "room.created",
    entityType: "room",
    entityId: room.id,
    summary: `Yangi xona qo'shildi: ${room.room_number} (${room.name ?? ""})`,
  });

  return NextResponse.json({ room }, { status: 201 });
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

  const parsed = roomSchema.safeParse(body);
  if (!parsed.success || !parsed.data.id) {
    return NextResponse.json({ error: "Xona ID va ma'lumotlar kerak." }, { status: 400 });
  }

  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();

  const { data: room, error } = await admin
    .from("rooms")
    .update({
      room_number: parsed.data.roomNumber,
      name: parsed.data.name ?? null,
      floor: parsed.data.floor ?? null,
      is_active: parsed.data.isActive,
    })
    .eq("id", parsed.data.id)
    .eq("clinic_id", clinicId)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ room });
}
