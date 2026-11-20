import { ShieldCheck, UserCircle2 } from "lucide-react";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { StaffPasswordCard } from "@/components/shared/StaffPasswordCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageRole } from "@/lib/auth/guards";
import { formatDateTimeUZ } from "@/lib/formatters";
import { ROLE_LABELS } from "@/lib/uz-labels";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const session = await requirePageRole(["admin", "super_admin"]);
  const { profile } = session;

  return (
    <div className="space-y-6">
      <StaffPageHeader
        eyebrow="Shaxsiy kabinet"
        title="Profil va sozlamalar"
        description="Xodim hisobi ma'lumotlari va xavfsizlik sozlamalari"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EDF4FA] text-[#0B4F8A] ring-1 ring-[#D4E4F4]">
                <UserCircle2 className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Xodim profili</CardTitle>
                <CardDescription>
                  Tizimga kirish va rol huquqlari haqida asosiy ma&apos;lumotlar
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-4 text-sm">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  F.I.O.
                </p>
                <p className="mt-1 font-bold text-[#0A1628]">{profile.full_name}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Lavozim / Rol
                </p>
                <div className="mt-1">
                  <Badge variant="default">{ROLE_LABELS[profile.role]}</Badge>
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Login (Username)
                </p>
                <p className="mt-1 font-semibold text-slate-800">{profile.username || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Elektron pochta
                </p>
                <p className="mt-1 font-medium text-slate-800">{profile.email}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Telefon raqam
                </p>
                <p className="mt-1 font-medium text-slate-800 tabular-nums">{profile.phone || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Oxirgi kirish
                </p>
                <p className="mt-1 font-medium text-slate-800 tabular-nums">
                  {profile.last_login_at ? formatDateTimeUZ(profile.last_login_at) : "Hozirgi sessiya"}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-[#CFE1F2] bg-[#EDF4FA]/70 p-3.5 text-xs text-[#0A1628]">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#0B4F8A]" />
              <p>
                Klinika umumiy sozlamalari, narxlar, xizmatlar va komissiya qoidalari faqat Super
                Admin paneli orqali boshqariladi.
              </p>
            </div>
          </CardContent>
        </Card>

        <StaffPasswordCard />
      </div>
    </div>
  );
}
