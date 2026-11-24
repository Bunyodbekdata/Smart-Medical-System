import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAuditLog, requireApiRole } from "@/lib/auth/guards";
import { createServiceRoleClient } from "@/lib/supabase/server";

const settingsUpdateSchema = z.object({
  clinic_name: z.string().trim().min(2).max(120),
  logo_url: z.string().trim().max(500).nullable().optional(),
  tagline: z.string().trim().min(2).max(200),
  hero_title: z.string().trim().min(5).max(200),
  hero_subtitle: z.string().trim().min(5).max(400),
  hero_image_url: z.string().trim().max(500).nullable().optional(),
  about_title: z.string().trim().min(2).max(160),
  about_description: z.string().trim().min(10).max(2000),
  mission: z.string().trim().min(5).max(800),
  equipment_summary: z.string().trim().min(5).max(1000),
  working_hours_summary: z.string().trim().min(3).max(300),
  address: z.string().trim().min(3).max(300),
  phone: z.string().trim().min(7).max(40),
  email: z.string().email(),
  map_link: z.string().trim().max(500).nullable().optional(),
  map_embed_url: z.string().trim().max(800).nullable().optional(),
  social_links: z
    .object({
      telegram: z.string().max(300).optional(),
      instagram: z.string().max(300).optional(),
      facebook: z.string().max(300).optional(),
      youtube: z.string().max(300).optional(),
    })
    .optional(),
  currency: z.string().trim().min(2).max(10).default("UZS"),
  timezone: z.string().trim().min(3).max(60).default("Asia/Tashkent"),
  default_queue_prefix: z.string().trim().min(1).max(4).default("A"),
  daily_queue_reset: z.boolean().default(true),
  no_show_timeout_minutes: z.number().int().min(1).max(240).default(15),
  allow_online_queue: z.boolean().default(true),
  receipt_header: z.string().trim().max(300),
  receipt_footer: z.string().trim().max(400),
  stats_doctors_override: z.number().int().min(0).nullable().optional(),
  stats_services_override: z.number().int().min(0).nullable().optional(),
  stats_patients_override: z.number().int().min(0).nullable().optional(),
  stats_experience_years: z.number().int().min(0).max(150).default(8),
  stats_positive_rate: z.number().min(0).max(100).default(98),
});

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function hasValidImageMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 12) return false;
  if (mimeType === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }
  if (mimeType === "image/webp") {
    return (
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  return false;
}

export async function GET() {
  const auth = await requireApiRole(["super_admin"]);
  if (!auth.ok) return auth.response;

  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();

  const [settingsRes, roomsRes] = await Promise.all([
    admin.from("clinic_settings").select("*").eq("clinic_id", clinicId).maybeSingle(),
    admin.from("rooms").select("*").eq("clinic_id", clinicId).order("room_number", { ascending: true }),
  ]);

  return NextResponse.json({
    settings: settingsRes.data,
    rooms: roomsRes.data ?? [],
  });
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

  const parsed = settingsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Sozlamalar noto'g'ri." },
      { status: 400 }
    );
  }

  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();

  const { data: existing } = await admin
    .from("clinic_settings")
    .select("*")
    .eq("clinic_id", clinicId)
    .maybeSingle();

  const payload = {
    ...parsed.data,
    default_queue_prefix: parsed.data.default_queue_prefix.toUpperCase(),
  };

  const { data: updated, error } = await admin
    .from("clinic_settings")
    .update(payload)
    .eq("clinic_id", clinicId)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await admin
    .from("clinics")
    .update({ name: parsed.data.clinic_name })
    .eq("id", clinicId);

  await recordAuditLog({
    clinicId,
    actorUserId: auth.session.userId,
    action: "clinic_settings.updated",
    entityType: "clinic_settings",
    entityId: updated.id,
    summary: "Klinika sozlamalari yangilandi",
    previousValues: existing
      ? {
          clinic_name: existing.clinic_name,
          default_queue_prefix: existing.default_queue_prefix,
          daily_queue_reset: existing.daily_queue_reset,
        }
      : null,
    newValues: {
      clinic_name: updated.clinic_name,
      default_queue_prefix: updated.default_queue_prefix,
      daily_queue_reset: updated.daily_queue_reset,
    },
  });

  return NextResponse.json({ settings: updated });
}

export async function POST(request: Request) {
  const auth = await requireApiRole(["super_admin"]);
  if (!auth.ok) return auth.response;

  const clinicId = auth.session.profile.clinic_id;
  const admin = createServiceRoleClient();

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const folder = String(formData.get("folder") || "general").replace(/[^a-z0-9_-]/gi, "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Rasm fayli tanlanmagan." }, { status: 400 });
    }

    const safeExt = MIME_TO_EXT[file.type];
    if (!safeExt) {
      return NextResponse.json(
        { error: "Faqat JPG, PNG yoki WebP formatdagi rasmlarni yuklash mumkin." },
        { status: 400 }
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Rasm hajmi 5 MB dan oshmasligi kerak." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!hasValidImageMagicBytes(buffer, file.type)) {
      return NextResponse.json(
        { error: "Yuklangan fayl haqiqiy rasm emas yoki shikastlangan." },
        { status: 400 }
      );
    }

    const safeFolder = folder || "general";
    const filePath = `${clinicId}/${safeFolder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;

    const { error: uploadError } = await admin.storage
      .from("clinic-media")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `Rasmni yuklashda xatolik: ${uploadError.message}` },
        { status: 400 }
      );
    }

    const { data: urlData } = admin.storage.from("clinic-media").getPublicUrl(filePath);
    return NextResponse.json({ url: urlData.publicUrl });
  } catch (err) {
    console.error("[api/super-admin/settings POST upload]", err);
    return NextResponse.json({ error: "Fayl yuklashda server xatosi." }, { status: 500 });
  }
}
