import Link from "next/link";
import { z } from "zod";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { LiveTicketTracker } from "@/components/public/LiveTicketTracker";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured, isSupabaseServiceConfigured } from "@/lib/supabase/env";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { PublicTicketTracking } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function QueueTrackingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const parsed = z.string().uuid().safeParse(token);

  if (!parsed.success || !isSupabaseConfigured()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4">
        <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-900">
            Navbat chiptasi topilmadi
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Kuzatuv havolasi noto&apos;g&apos;ri yoki tizim hali sozlanmagan.
          </p>
          <Button asChild className="mt-6">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Bosh sahifaga qaytish
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const client = isSupabaseServiceConfigured()
    ? createServiceRoleClient()
    : await createServerSupabaseClient();

  const { data } = await client.rpc("get_public_ticket_tracking", {
    p_token: parsed.data,
  });

  const ticket = (Array.isArray(data) ? data[0] : data) as PublicTicketTracking | undefined;

  if (!ticket) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4">
        <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-900">
            Chipta topilmadi
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Ushbu kuzatuv havolasiga mos navbat chiptasi mavjud emas.
          </p>
          <Button asChild className="mt-6">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Bosh sahifaga qaytish
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return <LiveTicketTracker token={parsed.data} initialTicket={ticket} />;
}
