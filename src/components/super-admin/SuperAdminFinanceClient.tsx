"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  BadgeDollarSign,
  Coins,
  Plus,
  Receipt,
  Settings2,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { StaffStatCard } from "@/components/shared/StaffStatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, SelectInput, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import type { FinancialSummary } from "@/lib/domain/finance-rules";
import { formatDateDDMMYYYY, formatUZS, getTashkentDateString } from "@/lib/formatters";
import { EARNING_ENTRY_TYPE_LABELS, EXPENSE_CATEGORIES_UZ } from "@/lib/uz-labels";
import type { CommissionRule, DoctorEarningEntry, Expense } from "@/types/database";

interface DoctorFinanceSummary {
  doctorId: string;
  doctorName: string;
  specialization: string;
  clinicRevenue: number;
  allocated: number;
  paidOut: number;
  balanceOwed: number;
}

export function SuperAdminFinanceClient() {
  const { toast } = useToast();
  const todayStr = getTashkentDateString();
  const [fromDate, setFromDate] = useState(`${todayStr.slice(0, 7)}-01`);
  const [toDate, setToDate] = useState(todayStr);
  const [activeTab, setActiveTab] = useState<"doctors" | "expenses" | "rules">("doctors");

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<FinancialSummary>({
    grossPayments: 0,
    refundedAmount: 0,
    netRevenue: 0,
    outstandingBalances: 0,
    doctorCommissionsAccrued: 0,
    doctorPayoutsPaid: 0,
    doctorBalanceOwed: 0,
    clinicExpenses: 0,
    netFinancialResult: 0,
  });
  const [doctorSummaries, setDoctorSummaries] = useState<DoctorFinanceSummary[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [ledger, setLedger] = useState<DoctorEarningEntry[]>([]);
  const [doctorsList, setDoctorsList] = useState<Array<{ id: string; full_name: string }>>([]);
  const [servicesList, setServicesList] = useState<Array<{ id: string; name: string }>>([]);

  // Modals
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expTitle, setExpTitle] = useState("");
  const [expCategory, setExpCategory] = useState<string>(EXPENSE_CATEGORIES_UZ[0]);
  const [expAmount, setExpAmount] = useState("");
  const [expDate, setExpDate] = useState(todayStr);
  const [expDesc, setExpDesc] = useState("");
  const [deleteExpenseTarget, setDeleteExpenseTarget] = useState<Expense | null>(null);

  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleDoctorId, setRuleDoctorId] = useState("");
  const [ruleServiceId, setRuleServiceId] = useState("");
  const [ruleType, setRuleType] = useState<"percentage" | "fixed">("percentage");
  const [ruleValue, setRuleValue] = useState("40");
  const [ruleEffective, setRuleEffective] = useState(todayStr);
  const [ruleNotes, setRuleNotes] = useState("");

  const [payoutTarget, setPayoutTarget] = useState<DoctorFinanceSummary | null>(null);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutDate, setPayoutDate] = useState(todayStr);
  const [payoutNotes, setPayoutNotes] = useState("");

  const [saving, setSaving] = useState(false);

  const loadFinance = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/super-admin/finance?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "Moliyaviy ma'lumotlarni yuklab bo'lmadi" });
        return;
      }
      if (data.summary) setSummary(data.summary);
      setDoctorSummaries(data.doctorSummaries ?? []);
      setExpenses(data.expenses ?? []);
      setRules(data.commissionRules ?? []);
      setLedger(data.earningsLedger ?? []);
      setDoctorsList(data.doctors ?? []);
      setServicesList(data.services ?? []);
    } catch {
      toast({ variant: "error", title: "Server bilan aloqada xatolik" });
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, toast]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadFinance();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadFinance]);

  async function handleCreateExpense(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/super-admin/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_expense",
          title: expTitle,
          category: expCategory,
          amount: Number(expAmount),
          expenseDate: expDate,
          description: expDesc || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "Xarajat saqlanmadi" });
        return;
      }
      toast({ variant: "success", title: "Xarajat kiritildi" });
      setExpenseOpen(false);
      setExpTitle("");
      setExpAmount("");
      setExpDesc("");
      await loadFinance();
    } catch {
      toast({ variant: "error", title: "Server xatosi" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteExpense() {
    if (!deleteExpenseTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/super-admin/finance?expenseId=${deleteExpenseTarget.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "Xarajatni o'chirib bo'lmadi" });
        return;
      }
      toast({ variant: "success", title: "Xarajat o'chirildi" });
      setDeleteExpenseTarget(null);
      await loadFinance();
    } catch {
      toast({ variant: "error", title: "Server xatosi" });
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateRule(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/super-admin/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_commission_rule",
          doctorId: ruleDoctorId || null,
          serviceId: ruleServiceId || null,
          commissionType: ruleType,
          commissionValue: Number(ruleValue),
          effectiveFrom: ruleEffective,
          notes: ruleNotes || null,
          isActive: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "Komissiya qoidasi saqlanmadi" });
        return;
      }
      toast({ variant: "success", title: "Yangi komissiya qoidasi qo'shildi" });
      setRuleOpen(false);
      setRuleNotes("");
      await loadFinance();
    } catch {
      toast({ variant: "error", title: "Server xatosi" });
    } finally {
      setSaving(false);
    }
  }

  async function toggleRule(rule: CommissionRule) {
    try {
      const res = await fetch("/api/super-admin/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_rule",
          ruleId: rule.id,
          isActive: !rule.is_active,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "Holatni yangilab bo'lmadi" });
        return;
      }
      toast({
        variant: "success",
        title: !rule.is_active ? "Qoida faollashtirildi" : "Qoida to'xtatildi",
      });
      await loadFinance();
    } catch {
      toast({ variant: "error", title: "Server xatosi" });
    }
  }

  async function handlePayout(e: React.FormEvent) {
    e.preventDefault();
    if (!payoutTarget) return;
    setSaving(true);
    try {
      const res = await fetch("/api/super-admin/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "payout",
          doctorId: payoutTarget.doctorId,
          amount: Number(payoutAmount),
          effectiveDate: payoutDate,
          notes: payoutNotes || "Shifokorga ulush to'landi",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "To'lov amalga oshmadi" });
        return;
      }
      toast({ variant: "success", title: "Shifokorga ulush to'landi" });
      setPayoutTarget(null);
      setPayoutAmount("");
      setPayoutNotes("");
      await loadFinance();
    } catch {
      toast({ variant: "error", title: "Server xatosi" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <StaffPageHeader
        eyebrow="Moliya va komissiyalar"
        title="Moliyaviy boshqaruv"
        description="Yalpi va sof tushum, shifokorlar komissiyasi, klinik xarajatlar va o'zaro hisob-kitoblar"
        actions={
          <>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 text-xs shadow-xs">
              <span className="font-medium text-slate-500">Dan:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="bg-transparent font-semibold text-[#0A1628] outline-none tabular-nums"
              />
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 text-xs shadow-xs">
              <span className="font-medium text-slate-500">Gacha:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="bg-transparent font-semibold text-[#0A1628] outline-none tabular-nums"
              />
            </div>
          </>
        }
      />

      {/* Executive Financial Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StaffStatCard
          label="Sof tushum (Qaytarishlardan keyin)"
          value={formatUZS(summary.netRevenue)}
          hint={`Yalpi: ${formatUZS(summary.grossPayments)} • Qaytarilgan: ${formatUZS(summary.refundedAmount)}`}
          icon={BadgeDollarSign}
          tone="sapphire"
        />
        <StaffStatCard
          label="Shifokorlar ulushi (Hisoblangan)"
          value={formatUZS(summary.doctorCommissionsAccrued)}
          hint={`To'langan: ${formatUZS(summary.doctorPayoutsPaid)} • Qoldiq: ${formatUZS(summary.doctorBalanceOwed)}`}
          icon={Coins}
          tone="teal"
        />
        <StaffStatCard
          label="Klinika sof foydasi"
          value={formatUZS(summary.netFinancialResult)}
          hint={`Xarajatlar: ${formatUZS(summary.clinicExpenses)} • Qarzlar: ${formatUZS(summary.outstandingBalances)}`}
          icon={summary.netFinancialResult >= 0 ? TrendingUp : TrendingDown}
          tone={summary.netFinancialResult >= 0 ? "featured" : "rose"}
        />
      </div>

      {/* Tabs + Primary Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-slate-200/90 bg-white p-1 shadow-xs">
          <button
            type="button"
            onClick={() => setActiveTab("doctors")}
            className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeTab === "doctors"
                ? "bg-[#0A1628] text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-[#0A1628]"
            }`}
          >
            Shifokorlar ulushi
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("expenses")}
            className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all tabular-nums ${
              activeTab === "expenses"
                ? "bg-[#0A1628] text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-[#0A1628]"
            }`}
          >
            Xarajatlar ({expenses.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("rules")}
            className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all tabular-nums ${
              activeTab === "rules"
                ? "bg-[#0A1628] text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-[#0A1628]"
            }`}
          >
            Komissiya qoidalari ({rules.length})
          </button>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setRuleOpen(true)}>
            <Settings2 className="mr-1.5 h-4 w-4" />
            Komissiya qoidasi
          </Button>
          <Button size="sm" onClick={() => setExpenseOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Xarajat kiritish
          </Button>
        </div>
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="h-56 animate-pulse rounded-2xl bg-slate-200/70" />
      ) : activeTab === "doctors" ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Shifokorlar hisob-kitobi</CardTitle>
              <CardDescription>
                Tanlangan davr bo&apos;yicha keltirilgan tushum, ulush va to&apos;lab berilgan mablag&apos;lar
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-y border-slate-100 bg-slate-50/70 text-xs font-semibold text-slate-500">
                      <th className="px-4 py-3">Shifokor</th>
                      <th className="px-4 py-3">Klinika tushumi</th>
                      <th className="px-4 py-3">Hisoblangan ulush</th>
                      <th className="px-4 py-3">To&apos;langan</th>
                      <th className="px-4 py-3">Qoldiq (haq)</th>
                      <th className="px-4 py-3 text-right">Amal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {doctorSummaries.map((d) => (
                      <tr key={d.doctorId} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-slate-900">{d.doctorName}</p>
                          <p className="text-xs text-slate-500">{d.specialization}</p>
                        </td>
                        <td className="px-4 py-3.5 text-slate-700">{formatUZS(d.clinicRevenue)}</td>
                        <td className="px-4 py-3.5 font-semibold text-indigo-700">
                          {formatUZS(d.allocated)}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">{formatUZS(d.paidOut)}</td>
                        <td className="px-4 py-3.5 font-bold text-emerald-700">
                          {formatUZS(d.balanceOwed)}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setPayoutTarget(d);
                              setPayoutAmount(d.balanceOwed > 0 ? String(d.balanceOwed) : "");
                              setPayoutDate(todayStr);
                            }}
                          >
                            <Wallet className="mr-1.5 h-3.5 w-3.5" />
                            To&apos;lash
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daromad operatsiyalari (Ledger)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {ledger.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={Receipt}
                    title="Yozuvlar mavjud emas"
                    description="Tanlangan davrda shifokor daromadi operatsiyalari bo'lmagan."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-y border-slate-100 bg-slate-50/70 font-semibold text-slate-500">
                        <th className="px-4 py-3">Sana</th>
                        <th className="px-4 py-3">Shifokor</th>
                        <th className="px-4 py-3">Turi</th>
                        <th className="px-4 py-3 text-right">Summa</th>
                        <th className="px-4 py-3">Izoh</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ledger.map((item) => {
                        const isPayout = item.entry_type === "payout";
                        const amountNum = Number(item.doctor_amount);
                        const isPositive = !isPayout && amountNum >= 0;
                        return (
                          <tr key={item.id}>
                            <td className="px-4 py-2.5 text-slate-600 tabular-nums">
                              {formatDateDDMMYYYY(item.effective_date)}
                            </td>
                            <td className="px-4 py-2.5 font-semibold text-slate-900">
                              {item.doctor?.full_name || "—"}
                            </td>
                            <td className="px-4 py-2.5">
                              <Badge
                                variant={
                                  item.entry_type === "accrual"
                                    ? "success"
                                    : item.entry_type === "payout"
                                      ? "info"
                                      : "warning"
                                }
                              >
                                {EARNING_ENTRY_TYPE_LABELS[item.entry_type]}
                              </Badge>
                            </td>
                            <td
                              className={`px-4 py-2.5 text-right font-bold tabular-nums ${
                                isPayout
                                  ? "text-[#0B4F8A]"
                                  : isPositive
                                    ? "text-emerald-700"
                                    : "text-rose-600"
                              }`}
                            >
                              {isPayout
                                ? `-${formatUZS(Math.abs(amountNum))}`
                                : `${isPositive ? "+" : ""}${formatUZS(amountNum)}`}
                            </td>
                            <td className="px-4 py-2.5 text-slate-500">{item.notes || "—"}</td>
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
      ) : activeTab === "expenses" ? (
        <Card>
          <CardContent className="p-0">
            {expenses.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon={Receipt}
                  title="Xarajatlar kiritilmagan"
                  description="Tanlangan davr uchun klinika xarajatlari topilmadi."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold text-slate-500">
                      <th className="px-4 py-3">Sana</th>
                      <th className="px-4 py-3">Xarajat nomi</th>
                      <th className="px-4 py-3">Kategoriya</th>
                      <th className="px-4 py-3">Mas&apos;ul</th>
                      <th className="px-4 py-3 text-right">Summa</th>
                      <th className="px-4 py-3 text-right">O&apos;chirish</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {expenses.map((ex) => (
                      <tr key={ex.id}>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {formatDateDDMMYYYY(ex.expense_date)}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{ex.title}</p>
                          {ex.description && (
                            <p className="text-xs text-slate-500">{ex.description}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="neutral">{ex.category}</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {ex.responsible_user?.full_name || "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-rose-600">
                          {formatUZS(ex.amount)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-rose-600 hover:bg-rose-50"
                            onClick={() => setDeleteExpenseTarget(ex)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold text-slate-500">
                    <th className="px-4 py-3">Shifokor</th>
                    <th className="px-4 py-3">Xizmat</th>
                    <th className="px-4 py-3">Stavka</th>
                    <th className="px-4 py-3">Kuchga kirish sanasi</th>
                    <th className="px-4 py-3">Holat</th>
                    <th className="px-4 py-3 text-right">Amal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rules.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {r.doctor?.full_name || "Barcha shifokorlar (Umumiy)"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {r.service?.name || "Barcha xizmatlar"}
                      </td>
                      <td className="px-4 py-3 font-bold text-blue-700">
                        {r.commission_type === "percentage"
                          ? `${r.commission_value}%`
                          : formatUZS(r.commission_value)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {formatDateDDMMYYYY(r.effective_from)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={r.is_active ? "success" : "neutral"}>
                          {r.is_active ? "Faol" : "To'xtatilgan"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => toggleRule(r)}>
                          {r.is_active ? "To'xtatish" : "Faollashtirish"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expense Modal */}
      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Yangi klinika xarajati</DialogTitle>
            <DialogDescription>Oylik foyda hisobida avtomatik inobatga olinadi</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateExpense} className="space-y-4">
            <div>
              <Label>Xarajat nomi *</Label>
              <Input
                value={expTitle}
                onChange={(e) => setExpTitle(e.target.value)}
                placeholder="Masalan: Stomatologiya materiallari"
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Kategoriya *</Label>
                <SelectInput value={expCategory} onChange={(e) => setExpCategory(e.target.value)}>
                  {EXPENSE_CATEGORIES_UZ.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </SelectInput>
              </div>
              <div>
                <Label>Sana *</Label>
                <Input
                  type="date"
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  required
                />
              </div>
            </div>
            <div>
              <Label>Summa (UZS) *</Label>
              <Input
                type="number"
                min={1}
                value={expAmount}
                onChange={(e) => setExpAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Izoh</Label>
              <Textarea rows={2} value={expDesc} onChange={(e) => setExpDesc(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setExpenseOpen(false)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saqlanmoqda..." : "Saqlash"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Commission Rule Modal */}
      <Dialog open={ruleOpen} onOpenChange={setRuleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Yangi komissiya qoidasi</DialogTitle>
            <DialogDescription>
              Shifokor + Xizmat darajasidagi qoida umumiy qoidalardan ustun turadi
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateRule} className="space-y-4">
            <div>
              <Label>Shifokor (ixtiyoriy)</Label>
              <SelectInput value={ruleDoctorId} onChange={(e) => setRuleDoctorId(e.target.value)}>
                <option value="">Barcha shifokorlar (Umumiy)</option>
                {doctorsList.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </SelectInput>
            </div>
            <div>
              <Label>Xizmat (ixtiyoriy)</Label>
              <SelectInput value={ruleServiceId} onChange={(e) => setRuleServiceId(e.target.value)}>
                <option value="">Barcha xizmatlar</option>
                {servicesList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SelectInput>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Hisoblash turi *</Label>
                <SelectInput
                  value={ruleType}
                  onChange={(e) => setRuleType(e.target.value as "percentage" | "fixed")}
                >
                  <option value="percentage">Foiz (%)</option>
                  <option value="fixed">Qat&apos;iy summa (UZS)</option>
                </SelectInput>
              </div>
              <div>
                <Label>Qiymat *</Label>
                <Input
                  type="number"
                  min={0}
                  max={ruleType === "percentage" ? 100 : undefined}
                  value={ruleValue}
                  onChange={(e) => setRuleValue(e.target.value)}
                  required
                />
              </div>
            </div>
            <div>
              <Label>Kuchga kirish sanasi *</Label>
              <Input
                type="date"
                value={ruleEffective}
                onChange={(e) => setRuleEffective(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Izoh</Label>
              <Input value={ruleNotes} onChange={(e) => setRuleNotes(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRuleOpen(false)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saqlanmoqda..." : "Saqlash"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Doctor Payout Modal */}
      <Dialog
        open={Boolean(payoutTarget)}
        onOpenChange={(open) => {
          if (!open) setPayoutTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Shifokorga ulush to&apos;lash</DialogTitle>
            <DialogDescription>
              {payoutTarget?.doctorName} • Jami qoldiq:{" "}
              {formatUZS(payoutTarget?.balanceOwed ?? 0)}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePayout} className="space-y-4">
            <div>
              <Label>To&apos;lanayotgan summa (UZS) *</Label>
              <Input
                type="number"
                min={1}
                value={payoutAmount}
                onChange={(e) => setPayoutAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Sana *</Label>
              <Input
                type="date"
                value={payoutDate}
                onChange={(e) => setPayoutDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Izoh</Label>
              <Input
                value={payoutNotes}
                onChange={(e) => setPayoutNotes(e.target.value)}
                placeholder="Masalan: Oylik hisob-kitob to'lovi"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPayoutTarget(null)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saqlanmoqda..." : "To'lovni tasdiqlash"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteExpenseTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteExpenseTarget(null);
        }}
        title="Xarajatni o'chirish"
        description={`"${deleteExpenseTarget?.title}" yozuvi o'chiriladi va audit jurnaliga qayd etiladi.`}
        confirmLabel="O'chirish"
        variant="destructive"
        loading={saving}
        onConfirm={handleDeleteExpense}
      />
    </div>
  );
}
