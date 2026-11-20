"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, CheckCircle2, Coins, Stethoscope } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/components/shared/EmptyState";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { StaffStatCard } from "@/components/shared/StaffStatCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { formatDateDDMMYYYY, formatShortUZS, formatUZS } from "@/lib/formatters";

interface LedgerItem {
  effective_date: string;
  entry_type: string;
  gross_amount: number;
  doctor_amount: number;
}

interface ByServiceItem {
  serviceName: string;
  consultationsCount: number;
  clinicRevenue: number;
  doctorEarned: number;
}

export function DoctorReportsClient() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    monthlyEarnings: 0,
    completedConsultations: 0,
    totalClinicRevenue: 0,
  });
  const [byService, setByService] = useState<ByServiceItem[]>([]);
  const [ledger, setLedger] = useState<LedgerItem[]>([]);

  const loadReports = useCallback(async () => {
    try {
      const res = await fetch("/api/doctor/earnings", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "Hisobotni yuklab bo'lmadi" });
        return;
      }
      if (data.summary) setSummary(data.summary);
      setByService(data.byService ?? []);
      setLedger(data.ledger ?? []);
    } catch {
      toast({ variant: "error", title: "Server bilan aloqada xatolik" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadReports();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadReports]);

  const dailyChartData = useMemo(() => {
    const map = new Map<string, { date: string; label: string; earned: number; gross: number }>();
    for (const item of ledger) {
      if (item.entry_type === "payout") continue;
      const cur = map.get(item.effective_date) ?? {
        date: item.effective_date,
        label: formatDateDDMMYYYY(item.effective_date).slice(0, 5),
        earned: 0,
        gross: 0,
      };
      cur.earned += Number(item.doctor_amount);
      cur.gross += Number(item.gross_amount);
      map.set(item.effective_date, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14);
  }, [ledger]);

  return (
    <div className="space-y-6">
      <StaffPageHeader
        eyebrow="Samaradorlik tahlili"
        title="Shaxsiy hisobotlar"
        description="Qabullar samaradorligi va kunlik daromad ko'rsatkichlari tahlili"
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StaffStatCard
          label="Jami yakunlangan qabullar"
          value={`${summary.completedConsultations} ta`}
          icon={CheckCircle2}
          tone="sapphire"
        />
        <StaffStatCard
          label="Umumiy klinika tushumi"
          value={formatUZS(summary.totalClinicRevenue)}
          icon={Stethoscope}
          tone="teal"
        />
        <StaffStatCard
          label="Joriy oylik ulush"
          value={formatUZS(summary.monthlyEarnings)}
          icon={Coins}
          tone="featured"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle className="text-base">Kunlik daromad dinamikasi</CardTitle>
            <CardDescription>So&apos;nggi faol kunlardagi shifokor ulushi</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-72 animate-pulse rounded-xl bg-slate-100" />
            ) : dailyChartData.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="Grafik uchun ma'lumot yetarli emas"
                description="Qabullar yakunlanib to'lovlar qabul qilingach grafik shakllanadi."
              />
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} />
                    <YAxis
                      width={60}
                      tick={{ fontSize: 11, fill: "#64748B" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => formatShortUZS(v)}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "12px",
                        borderColor: "#E2E8F0",
                        boxShadow: "0 10px 24px -10px rgba(10,22,40,0.18)",
                        fontSize: "12px",
                      }}
                      formatter={(val: unknown) => formatUZS(Number(val ?? 0))}
                      labelFormatter={(label) => `Sana: ${label}`}
                    />
                    <Bar
                      dataKey="earned"
                      name="Shifokor ulushi"
                      fill="#0B4F8A"
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle className="text-base">Xizmatlar bo&apos;yicha qabullar</CardTitle>
            <CardDescription>Eng ko&apos;p ko&apos;rsatilgan tibbiy xizmatlar</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {byService.length === 0 ? (
              <p className="text-sm text-slate-500">Hozircha ma&apos;lumotlar mavjud emas.</p>
            ) : (
              byService.map((row) => (
                <div
                  key={row.serviceName}
                  className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5"
                >
                  <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                    <span>{row.serviceName}</span>
                    <span>{row.consultationsCount} ta qabul</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                    <span>Tushum: {formatUZS(row.clinicRevenue)}</span>
                    <span className="font-semibold text-emerald-700">
                      Ulush: {formatUZS(row.doctorEarned)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
