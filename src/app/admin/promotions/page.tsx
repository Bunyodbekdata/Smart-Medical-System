import { requirePageRole } from "@/lib/auth/guards";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { formatDateDDMMYYYY, formatUZS, getTashkentDateString } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";

export const dynamic = "force-dynamic";

export default async function AdminPromotionsPage() {
  const session = await requirePageRole(["admin", "super_admin"]);
  const admin = createServiceRoleClient();
  const today = getTashkentDateString();

  const { data: promos } = await admin
    .from("promotions")
    .select("*, service:services(name)")
    .eq("clinic_id", session.profile.clinic_id)
    .order("ends_at", { ascending: false });

  return (
    <div className="space-y-6">
      <StaffPageHeader
        eyebrow="Marketing va takliflar"
        title="Amaldagi chegirmalar"
        description="Klinika aksiyalari — chegirmalar navbat chiptasiga avtomatik qo'llanadi"
      />

      <div className="grid gap-4 md:grid-cols-2">
        {(promos ?? []).map((p) => {
          const activeNow = p.is_active && today >= p.starts_at && today <= p.ends_at;
          const srvName = (p.service as unknown as { name?: string } | null)?.name;
          return (
            <Card key={p.id} className="transition-colors hover:border-[#0B4F8A]/30">
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-[#0A1628]">{p.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">{p.description}</p>
                  </div>
                  <Badge variant={activeNow ? "success" : "neutral"}>
                    {activeNow ? "Amalda" : "Muddati tugagan"}
                  </Badge>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3.5 text-xs text-slate-600 tabular-nums">
                  <span className="font-bold text-[#0B4F8A]">
                    Chegirma:{" "}
                    {p.discount_type === "percentage"
                      ? `${Number(p.discount_value)}%`
                      : formatUZS(p.discount_value)}
                    {srvName ? ` • ${srvName}` : " • Barcha xizmatlar"}
                  </span>
                  <span className="text-slate-500">
                    {formatDateDDMMYYYY(p.starts_at)} — {formatDateDDMMYYYY(p.ends_at)}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
