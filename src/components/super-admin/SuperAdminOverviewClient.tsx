"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Award,
  BriefcaseMedical,
  Calendar,
  CreditCard,
  Download,
  RefreshCw,
  Stethoscope,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/components/shared/EmptyState";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { StaffStatCard } from "@/components/shared/StaffStatCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import {
  buildCsvContent,
  formatCompactNumber,
  formatDateDDMMYYYY,
  formatShortUZS,
  formatUZS,
  getTashkentDateString,
} from "@/lib/formatters";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

interface SuperAdminOverviewClientProps {
  clinicId: string;
}

interface AnalyticsData {
  kpis: {
    totalPatients: number;
    todayPatients: number;
    totalDoctors: number;
    todayRevenue: number;
    monthlyRevenue: number;
    totalConsultations: number;
    activeServices: number;
  };
  charts: {
    dailyRevenue: Array<{ date: string; label: string; revenue: number; newPatients: number }>;
    monthlyRevenue: Array<{ month: string; revenue: number; visits: number }>;
    servicePopularity: Array<{ name: string; count: number; revenue: number; percentage: number }>;
    doctorPerformance: Array<{ name: string; completed: number; revenue: number }>;
    paymentMethods: Array<{ method: string; key: string; amount: number }>;
  };
}

const CHART_COLORS = ["#0B4F8A", "#0D9488", "#0284C7", "#475569", "#D97706", "#059669"];

export function SuperAdminOverviewClient({ clinicId }: SuperAdminOverviewClientProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const todayStr = getTashkentDateString();

  const loadAnalytics = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch("/api/super-admin/analytics", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: json.error || "Analitikani yuklab bo'lmadi" });
        return;
      }
      setData(json);
    } catch {
      toast({ variant: "error", title: "Server bilan aloqada xatolik" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadAnalytics();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadAnalytics]);

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") void loadAnalytics();
    };
    window.addEventListener("focus", onFocus);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadAnalytics();
    }, 30_000);

    const supabase = createBrowserSupabaseClient();
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;
    if (supabase) {
      channel = supabase
        .channel(`super-admin-overview-${clinicId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "queue_tickets", filter: `clinic_id=eq.${clinicId}` },
          () => {
            void loadAnalytics();
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "payments", filter: `clinic_id=eq.${clinicId}` },
          () => {
            void loadAnalytics();
          }
        )
        .subscribe();
    }

    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(poll);
      if (supabase && channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [clinicId, loadAnalytics]);

  function handleExportCsv() {
    if (!data?.charts.dailyRevenue?.length) return;
    const csv = buildCsvContent(
      ["Sana", "Kunlik tushum (UZS)", "Yangi bemorlar"],
      data.charts.dailyRevenue.map((row) => [row.date, row.revenue, row.newPatients])
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `klinika-analitika-${todayStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const kpis = data?.kpis ?? {
    totalPatients: 0,
    todayPatients: 0,
    totalDoctors: 0,
    todayRevenue: 0,
    monthlyRevenue: 0,
    totalConsultations: 0,
    activeServices: 0,
  };

  const totalPaymentMethodsAmount =
    (data?.charts.paymentMethods ?? []).reduce((s, m) => s + Number(m.amount), 0) || 1;

  return (
    <div className="space-y-6">
      <StaffPageHeader
        eyebrow="Rahbariyat analitikasi"
        title="Klinika boshqaruv markazi"
        description="Real vaqt rejimida tushum, bemor oqimi, shifokorlar samaradorligi va tibbiy xizmatlar ko'rsatkichlari"
        actions={
          <>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs tabular-nums">
              <Calendar className="h-4 w-4 text-[#0B4F8A]" />
              Bugun, {formatDateDDMMYYYY(todayStr)}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={!data?.charts.dailyRevenue?.length}
            >
              <Download className="h-4 w-4" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => void loadAnalytics(true)}
              disabled={refreshing}
              title="Yangilash"
              aria-label="Analitikani yangilash"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </>
        }
      />

      {/* Primary 4 Executive KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaffStatCard
          label="Jami bemorlar"
          value={formatCompactNumber(kpis.totalPatients)}
          hint="Ro'yxatdagi bemorlar bazasi"
          icon={Users}
          tone="sapphire"
        />
        <StaffStatCard
          label="Bugungi tashriflar"
          value={kpis.todayPatients}
          hint="Faol navbat va qabullar"
          icon={UserCheck}
          tone="slate"
        />
        <StaffStatCard
          label="Bugungi tushum"
          value={formatUZS(kpis.todayRevenue)}
          hint="Tasdiqlangan sof to'lovlar"
          icon={Wallet}
          tone="teal"
        />
        <StaffStatCard
          label="Faol shifokorlar"
          value={kpis.totalDoctors}
          hint={`${kpis.activeServices} xil tibbiy xizmat`}
          icon={Stethoscope}
          tone="sapphire"
        />
      </div>

      {/* Secondary 3 Executive KPIs with Hero Featured Monthly Revenue */}
      <div className="grid gap-4 md:grid-cols-3">
        <StaffStatCard
          label="Joriy oylik sof tushum"
          value={formatUZS(kpis.monthlyRevenue)}
          hint="Qaytarishlardan keyingi sof daromad"
          icon={TrendingUp}
          tone="featured"
        />
        <StaffStatCard
          label="Yakunlangan qabullar"
          value={`${formatCompactNumber(kpis.totalConsultations)} ta`}
          hint="Barcha shifokorlar bo'yicha"
          icon={Award}
          tone="sapphire"
        />
        <StaffStatCard
          label="Faol tibbiy xizmatlar"
          value={`${kpis.activeServices} xil`}
          hint="Katalogda mavjud yo'nalishlar"
          icon={BriefcaseMedical}
          tone="teal"
        />
      </div>

      {/* Main Analytics Row: Revenue Trend + Service Popularity Donut */}
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle className="text-base">Tushum dinamikasi</CardTitle>
            <CardDescription>So&apos;nggi 14 kunlik sof kunlik tushum (UZS)</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-72 animate-pulse rounded-xl bg-slate-100" />
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data?.charts.dailyRevenue ?? []}
                    margin={{ top: 14, right: 8, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0B4F8A" stopOpacity={0.22} />
                        <stop offset="95%" stopColor="#0B4F8A" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} />
                    <YAxis
                      width={64}
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
                      formatter={(val: unknown) => [formatUZS(Number(val ?? 0)), "Tushum"]}
                      labelFormatter={(label) => `Sana: ${label}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#0B4F8A"
                      strokeWidth={2.5}
                      fill="url(#revGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle className="text-base">Xizmatlar ulushi</CardTitle>
            <CardDescription>Bemorlar murojaati bo&apos;yicha taqsimot</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-72 animate-pulse rounded-xl bg-slate-100" />
            ) : (data?.charts.servicePopularity ?? []).length === 0 ? (
              <EmptyState
                icon={Activity}
                title="Hozircha tashriflar yo'q"
                description="Navbatlar paydo bo'lishi bilan xizmatlar ulushi shakllanadi."
              />
            ) : (
              <div className="grid items-center gap-4 sm:grid-cols-2">
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data?.charts.servicePopularity ?? []}
                        dataKey="count"
                        nameKey="name"
                        innerRadius={48}
                        outerRadius={78}
                        paddingAngle={3}
                      >
                        {(data?.charts.servicePopularity ?? []).map((_, index) => (
                          <Cell
                            key={`srv-${index}`}
                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val: unknown) => `${val ?? 0} ta tashrif`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-2.5">
                  {(data?.charts.servicePopularity ?? []).slice(0, 6).map((srv, idx) => (
                    <div key={srv.name} className="flex items-center justify-between text-xs">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                        />
                        <span className="truncate font-medium text-slate-700">{srv.name}</span>
                      </div>
                      <span className="ml-2 font-bold text-slate-900">{srv.percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Second Charts Row: 6-month revenue & visits + Doctor performance & Payment methods */}
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-6">
          <CardHeader>
            <CardTitle className="text-base">Oylik tushum va bemorlar o&apos;sishi</CardTitle>
            <CardDescription>So&apos;nggi 6 oylik tushum va tashriflar soni</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data?.charts.monthlyRevenue ?? []}
                  margin={{ top: 14, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} />
                  <YAxis
                    width={64}
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
                    formatter={(val: unknown, name: unknown) =>
                      name === "Tushum" ? formatUZS(Number(val ?? 0)) : `${val ?? 0} ta`
                    }
                  />
                  <Bar dataKey="revenue" name="Tushum" fill="#0B4F8A" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Shifokorlar samaradorligi</CardTitle>
            <CardDescription>Yakunlangan qabullar bo&apos;yicha</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(data?.charts.doctorPerformance ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">Hozircha yakunlangan qabullar yo&apos;q.</p>
            ) : (
              (data?.charts.doctorPerformance ?? []).slice(0, 5).map((doc) => (
                <div
                  key={doc.name}
                  className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs"
                >
                  <div className="flex items-center justify-between font-semibold text-slate-900">
                    <span className="truncate">{doc.name}</span>
                    <span>{doc.completed} ta</span>
                  </div>
                  <p className="mt-1 font-medium text-emerald-700">{formatUZS(doc.revenue)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4 text-blue-600" />
              To&apos;lov usullari
            </CardTitle>
            <CardDescription>Joriy oydagi to&apos;lov ulushlari</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(data?.charts.paymentMethods ?? []).map((pm, idx) => {
              const pct = Math.round((Number(pm.amount) / totalPaymentMethodsAmount) * 100);
              return (
                <div key={pm.key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">{pm.method}</span>
                    <span className="font-bold text-slate-900">{pct}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
                      }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">{formatUZS(pm.amount)}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
