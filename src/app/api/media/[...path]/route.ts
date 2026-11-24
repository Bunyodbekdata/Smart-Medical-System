import { NextResponse } from "next/server";
import { isPgAdapterMode } from "@/lib/supabase/env";
import { getLocalPg } from "@/lib/supabase/local-pg-adapter";

const SAFE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  if (!isPgAdapterMode()) {
    return NextResponse.json({ error: "Media topilmadi." }, { status: 404 });
  }

  const { path: segments } = await context.params;
  if (!Array.isArray(segments) || segments.length < 2) {
    return NextResponse.json({ error: "Noto'g'ri media manzili." }, { status: 400 });
  }

  const [bucket, ...rest] = segments;
  const filePath = rest.join("/");
  if (!bucket || !filePath || filePath.includes("..")) {
    return NextResponse.json({ error: "Noto'g'ri media yo'li." }, { status: 400 });
  }

  try {
    const db = await getLocalPg();
    const check = await db.query<{ tbl: string | null }>(
      `SELECT to_regclass('public.clinic_media_files') AS tbl`
    );
    if (!check.rows[0]?.tbl) {
      return NextResponse.json({ error: "Rasm topilmadi." }, { status: 404 });
    }

    const res = await db.query<{ content_type: string; data_base64: string }>(
      `SELECT content_type, data_base64 FROM public.clinic_media_files WHERE bucket = $1 AND file_path = $2 LIMIT 1`,
      [bucket, filePath]
    );
    const row = res.rows[0];
    if (!row) {
      return NextResponse.json({ error: "Rasm topilmadi." }, { status: 404 });
    }

    const contentType = SAFE_IMAGE_TYPES.has(row.content_type)
      ? row.content_type
      : "application/octet-stream";
    const bytes = Buffer.from(row.data_base64, "base64");

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.length),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox;",
      },
    });
  } catch (err) {
    console.error("[api/media GET]", err);
    return NextResponse.json({ error: "Media yuklashda xatolik." }, { status: 500 });
  }
}
