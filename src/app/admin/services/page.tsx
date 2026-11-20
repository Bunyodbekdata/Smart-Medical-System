import { requirePageRole } from "@/lib/auth/guards";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { formatUZS } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";

export const dynamic = "force-dynamic";

export default async function AdminServicesPage() {
  const session = await requirePageRole(["admin", "super_admin"]);
  const admin = createServiceRoleClient();

  const { data: services } = await admin
    .from("services")
    .select("*, doctor_services(doctor:doctors(full_name))")
    .eq("clinic_id", session.profile.clinic_id)
    .order("sort_order", { ascending: true });

  return (
    <div className="space-y-6">
      <StaffPageHeader
        eyebrow="Katalog"
        title="Xizmatlar katalogi"
        description="Klinikada ko'rsatiladigan tibbiy xizmatlar va tasdiqlangan narxlar"
        badge={<Badge variant="default" className="tabular-nums">{(services ?? []).length} ta xizmat</Badge>}
      />

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200/80 bg-[#F8FAFC] text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">
                  <th className="px-5 py-3.5">Xizmat nomi</th>
                  <th className="px-4 py-3.5">Kategoriya</th>
                  <th className="px-4 py-3.5">Davomiyligi</th>
                  <th className="px-4 py-3.5">Shifokorlar</th>
                  <th className="px-4 py-3.5">Holat</th>
                  <th className="px-5 py-3.5 text-right">Narxi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(services ?? []).map((srv) => {
                  const docs = (
                    srv.doctor_services as unknown as Array<{
                      doctor: { full_name: string } | null;
                    }>
                  )
                    ?.map((d) => d.doctor?.full_name)
                    .filter(Boolean);
                  return (
                    <tr key={srv.id}>
                      <td className="px-5 py-3.5 font-bold text-slate-900">{srv.name}</td>
                      <td className="px-4 py-3.5 text-slate-600">{srv.category}</td>
                      <td className="px-4 py-3.5 text-slate-600">{srv.duration_minutes} daq</td>
                      <td className="px-4 py-3.5 text-xs text-slate-600">
                        {docs && docs.length > 0 ? docs.join(", ") : "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge variant={srv.is_active ? "success" : "neutral"}>
                          {srv.is_active ? "Faol" : "Nofaol"}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right font-extrabold text-slate-900">
                        {formatUZS(srv.price)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
