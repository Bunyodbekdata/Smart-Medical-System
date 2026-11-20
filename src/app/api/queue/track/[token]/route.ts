import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured, isSupabaseServiceConfigured } from "@/lib/supabase/env";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";

const tokenSchema = z.string().uuid();

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Tizim sozlanmagan." },
      { status: 503 }
    );
  }

  const { token } = await context.params;
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Navbat havolasi noto'g'ri." },
      { status: 400 }
    );
  }

  try {
    const client = isSupabaseServiceConfigured()
      ? createServiceRoleClient()
      : await createServerSupabaseClient();

    const { data, error } = await client.rpc("get_public_ticket_tracking", {
      p_token: parsed.data,
    });

    if (error) {
      return NextResponse.json(
        { error: "Navbat ma'lumotini olishda xatolik." },
        { status: 500 }
      );
    }

    const ticket = Array.isArray(data) ? data[0] : data;
    if (!ticket) {
      return NextResponse.json(
        { error: "Bunday navbat chiptasi topilmadi." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ticket });
  } catch (err) {
    console.error("[api/queue/track]", err);
    return NextResponse.json(
      { error: "Server xatosi." },
      { status: 500 }
    );
  }
}
