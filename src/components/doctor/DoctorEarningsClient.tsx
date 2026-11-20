"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Award,
  BadgeDollarSign,
  CalendarRange,
  CheckCircle2,
  Coins,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { StaffStatCard } from "@/components/shared/StaffStatCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { formatDateDDMMYYYY, formatUZS } from "@/lib/formatters";
import { EARNING_ENTRY_TYPE_LABELS } from "@/lib/uz-labels";
import type { CommissionRule, DoctorEarningEntry } from "@/types/database";

interface EarningsSummary {
  dailyEarnings: number;
  weeklyEarnings: number;
  monthlyEarnings: number;
  completedConsultations: number;
  totalClinicRevenue: number;
  totalAllocated: number;
  totalPaidOut: number;
  balanceOwed: number;
}

interface ByServiceRow {
  serviceName: string;
  consultationsCount: number;
  clinicRevenue: number;
  doctorEarned: number;
}

export function DoctorEarningsClient() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<EarningsSummary>({
    dailyEarnings: 0,
    weeklyEarnings: 0,
    monthlyEarnings: 0,
    completedConsultations: 0,
    totalClinicRevenue: 0,
    totalAllocated: 0,
    totalPaidOut: 0,
    balanceOwed: 0,
  });
  const [byService, setByService] = useState<ByServiceRow[]>([]);
  const [ledger, setLedger] = useState<
    Array<
      DoctorEarningEntry & {
        ticket?: {
          id: string;
          ticket_number: string;
          total_due?: number;
          paid_amount?: number;
          service?: { id: string; name: string } | null;
        } | null;
        commission_rule?: {
          id: string;
          commission_type: "percentage" | "fixed";
          commission_value: number;
        } | null;
      }
    >
  >([]);
  const [rules, setRules] = useState<CommissionRule[]>([]);

  const loadEarnings = useCallback(async () => {
    try {
      const res = await fetch("/api/doctor/earnings", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "Daromadni yuklab bo'lmadi" });
        return;
      }
      if (data.summary) setSummary(data.summary);
      setByService(data.byService ?? []);
      setLedger(data.ledger ?? []);
      setRules(data.commissionRules ?? []);
    } catch {
      toast({ variant: "error", title: "Server bilan aloqada xatolik" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadEarnings();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadEarnings]);

  return (
    <div className="space-y-6">
      <StaffPageHeader
        eyebrow="Shaxsiy moliya"
        title="Shifokor daromadi"
        description="Komissiya qoidalari asosida hisoblangan ulush, to'langan mablag' va qoldiq haq"
      />

      {/* Period Summary KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaffStatCard
          label="Bugungi daromad"
          value={formatUZS(summary.dailyEarnings)}
          icon={Coins}
          tone="sapphire"
        />
        <StaffStatCard
          label="Haftalik daromad"
          value={formatUZS(summary.weeklyEarnings)}
          icon={CalendarRange}
          tone="slate"
        />
        <StaffStatCard
          label="Oylik daromad"
          value={formatUZS(summary.monthlyEarnings)}
          icon={TrendingUp}
          tone="teal"
        />
        <StaffStatCard
          label="To'lanishi kerak (qoldiq)"
          value={formatUZS(summary.balanceOwed)}
          hint={`To'langan: ${formatUZS(summary.totalPaidOut)}`}
          icon={Wallet}
          tone="featured"
        />
      </div>

      {/* Totals Breakdown */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Yakunlangan qabullar</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {summary.completedConsultations} ta
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Klinikaga keltirilgan tushum</span>
              <BadgeDollarSign className="h-4 w-4 text-blue-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {formatUZS(summary.totalClinicRevenue)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Jami hisoblangan shifokor ulushi</span>
              <Award className="h-4 w-4 text-indigo-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {formatUZS(summary.totalAllocated)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Earnings by Service */}
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle className="text-base">Xizmatlar bo&apos;yicha daromad</CardTitle>
            <CardDescription>
              Har bir xizmat turi kesimida klinika tushumi va shifokor ulushi
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6">
                <div className="h-36 animate-pulse rounded-xl bg-slate-100" />
              </div>
            ) : byService.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={Coins}
                  title="Hozircha ma'lumot yo'q"
                  description="Yakunlangan va to'lov qilingan qabullardan so'ng xizmatlar bo'yicha daromad bu yerda aks etadi."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-y border-slate-100 bg-slate-50/70 text-xs font-semibold text-slate-500">
                      <th className="px-4 py-3">Xizmat nomi</th>
                      <th className="px-4 py-3">Qabullar</th>
                      <th className="px-4 py-3">Klinika tushumi</th>
                      <th className="px-4 py-3 text-right">Shifokor ulushi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {byService.map((row) => (
                      <tr key={row.serviceName}>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {row.serviceName}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{row.consultationsCount} ta</td>
                        <td className="px-4 py-3 text-slate-700">{formatUZS(row.clinicRevenue)}</td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-700">
                          {formatUZS(row.doctorEarned)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Commission Rules (read-only) */}
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle className="text-base">Amaldagi komissiya qoidalari</CardTitle>
            <CardDescription>
              Super Admin tomonidan tasdiqlangan hisoblash stavkalari
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {rules.length === 0 ? (
              <p className="text-sm text-slate-500">Faol qoidalar biriktirilmagan.</p>
            ) : (
              rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3.5"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {rule.service?.name || "Barcha xizmatlar uchun umumiy"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {rule.doctor_id ? "Shaxsiy stavka" : "Klinika standart stavkasi"} •{" "}
                      {formatDateDDMMYYYY(rule.effective_from)} dan
                    </p>
                  </div>
                  <Badge variant="info" className="text-xs font-bold">
                    {rule.commission_type === "percentage"
                      ? `${rule.commission_value}%`
                      : formatUZS(rule.commission_value)}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Ledger Entries */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daromad operatsiyalari jurnali</CardTitle>
          <CardDescription>
            Har bir hisoblangan ulush, qaytarish tuzatishi va to&apos;lab berilgan mablag&apos;
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {ledger.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Wallet}
                title="Operatsiyalar mavjud emas"
                description="Daromad harakatlari paydo bo'lishi bilan shu jadvalda ko'rinadi."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-y border-slate-100 bg-slate-50/70 text-xs font-semibold text-slate-500">
                    <th className="px-4 py-3">Sana</th>
                    <th className="px-4 py-3">Turi</th>
                    <th className="px-4 py-3">Talon / Xizmat</th>
                    <th className="px-4 py-3">To&apos;lov asosi</th>
                    <th className="px-4 py-3 text-right">Shifokor summasi</th>
                    <th className="px-4 py-3">Izoh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ledger.map((entry) => {
                    const isPositive = Number(entry.doctor_amount) >= 0;
                    return (
                      <tr key={entry.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3 text-xs font-medium text-slate-700">
                          {formatDateDDMMYYYY(entry.effective_date)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              entry.entry_type === "accrual"
                                ? "success"
                                : entry.entry_type === "payout"
                                  ? "info"
                                  : "warning"
                            }
                          >
                            {EARNING_ENTRY_TYPE_LABELS[entry.entry_type]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {entry.ticket ? (
                            <div>
                              <span className="font-semibold text-slate-900">
                                {entry.ticket.ticket_number}
                              </span>
                              <span className="ml-1.5 text-xs text-slate-500">
                                {entry.ticket.service?.name || ""}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatUZS(entry.gross_amount)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-bold ${
                            isPositive ? "text-emerald-700" : "text-rose-600"
                          }`}
                        >
                          {isPositive ? "+" : ""}
                          {formatUZS(entry.doctor_amount)}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {entry.notes || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
