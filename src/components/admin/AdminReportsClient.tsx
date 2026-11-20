"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Banknote, CreditCard, Download, Landmark, Printer, Users, Wallet } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { StaffStatCard } from "@/components/shared/StaffStatCard";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildCsvContent,
  formatDateTimeUZ,
  formatUZS,
  getTashkentDateString,
} from "@/lib/formatters";
import { PAYMENT_METHOD_LABELS } from "@/lib/uz-labels";
import type { PaymentMethod } from "@/types/database";

interface ReportPayload {
  date: string;
  summary: {
    ticketsToday: number;
    newPatientsToday: number;
    waitingCount: number;
    inConsultationCount: number;
    completedCount: number;
    totalAccepted: number;
    cashTotal: number;
    cardTotal: number;
    transferTotal: number;
    totalRefunds: number;
    netCollected: number;
    unpaidBalance: number;
  };
  transactions: Array<{
    id: string;
    receipt_number: string;
    amount: number;
    payment_method: PaymentMethod;
    is_confirmed: boolean;
    paid_at: string;
    patient: { full_name: string } | null;
    service: { name: string } | null;
    doctor: { full_name: string } | null;
    accepted_by_profile: { full_name: string } | null;
  }>;
  unpaidTickets: Array<{
    id: string;
    ticket_number: string;
    total_due: number;
    paid_amount: number;
    patient: { full_name: string; phone: string } | null;
    service: { name: string } | null;
  }>;
  adminActivity: Array<{
    adminName: string;
    paymentsCount: number;
    totalCollected: number;
  }>;
}

export function AdminReportsClient() {
  const [date, setDate] = useState(getTashkentDateString());
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reports?date=${date}`, { cache: "no-store" });
      if (res.ok) {
        setReport(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadReport();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadReport]);

  function handleExportCsv() {
    if (!report) return;
    const headers = [
      "Kvitansiya",
      "Bemor",
      "Xizmat",
      "Shifokor",
      "To'lov usuli",
      "Kassir",
      "Vaqt",
      "Summa (UZS)",
    ];
    const rows = report.transactions.map((tr) => [
      tr.receipt_number,
      tr.patient?.full_name || "",
      tr.service?.name || "",
      tr.doctor?.full_name || "",
      PAYMENT_METHOD_LABELS[tr.payment_method],
      tr.accepted_by_profile?.full_name || "",
      formatDateTimeUZ(tr.paid_at),
      Number(tr.amount),
    ]);
    const csv = buildCsvContent(headers, rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kassa-hisobot-${report.date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div id="printable-report" className="space-y-6">
      <StaffPageHeader
        eyebrow="Kassa smenasi"
        title="Kunlik kassa hisoboti"
        description="Ro'yxatga olingan bemorlar, to'lov usullari kesimi va qarzdorliklar hisoboti"
        actions={
          <>
            <Label htmlFor="rep-date" className="text-xs text-slate-500">
              Sana:
            </Label>
            <Input
              id="rep-date"
              type="date"
              className="w-40"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={!report || report.transactions.length === 0}
            >
              <Download className="h-4 w-4" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              disabled={!report}
            >
              <Printer className="h-4 w-4" />
              Chop etish
            </Button>
          </>
        }
      />

      {loading || !report ? (
        <Card>
          <CardContent className="p-0">
            <TableSkeleton rows={5} columns={5} />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StaffStatCard
              label="Navbat / Yangi bemor"
              value={`${report.summary.ticketsToday} / ${report.summary.newPatientsToday}`}
              icon={Users}
              tone="sapphire"
              compact
            />
            <StaffStatCard
              label="Naqd to'lovlar"
              value={formatUZS(report.summary.cashTotal)}
              icon={Banknote}
              tone="teal"
              compact
            />
            <StaffStatCard
              label="Bank kartasi"
              value={formatUZS(report.summary.cardTotal)}
              icon={CreditCard}
              tone="sapphire"
              compact
            />
            <StaffStatCard
              label="Bank o'tkazmasi"
              value={formatUZS(report.summary.transferTotal)}
              icon={Landmark}
              tone="slate"
              compact
            />
            <StaffStatCard
              label="Sof kunlik tushum"
              value={formatUZS(report.summary.netCollected)}
              icon={Wallet}
              tone="featured"
              compact
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Admin Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Administratorlar faolligi</CardTitle>
              </CardHeader>
              <CardContent>
                {report.adminActivity.length === 0 ? (
                  <p className="text-xs text-slate-500">Ushbu kunda to&apos;lov qabul qilinmagan.</p>
                ) : (
                  <div className="space-y-2.5">
                    {report.adminActivity.map((a) => (
                      <div
                        key={a.adminName}
                        className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm"
                      >
                        <div>
                          <p className="font-bold text-slate-900">{a.adminName}</p>
                          <p className="text-xs text-slate-500">{a.paymentsCount} ta to&apos;lov</p>
                        </div>
                        <span className="font-extrabold text-emerald-700">
                          {formatUZS(a.totalCollected)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Unpaid Balances */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>To&apos;lanmagan qoldiqlar</span>
                  <span className="text-sm font-extrabold text-rose-600">
                    {formatUZS(report.summary.unpaidBalance)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {report.unpaidTickets.length === 0 ? (
                  <p className="text-xs text-slate-500">Barcha faol chiptalar to&apos;liq to&apos;langan.</p>
                ) : (
                  <div className="space-y-2">
                    {report.unpaidTickets.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50/40 px-4 py-2.5 text-xs"
                      >
                        <div>
                          <p className="font-bold text-slate-900">
                            {t.ticket_number} — {t.patient?.full_name}
                          </p>
                          <p className="text-slate-500">{t.service?.name}</p>
                        </div>
                        <span className="font-extrabold text-rose-600">
                          {formatUZS(Number(t.total_due) - Number(t.paid_amount))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Daily Transactions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Kunlik tranzaksiyalar tarixi</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {report.transactions.length === 0 ? (
                <div className="p-6">
                  <EmptyState title="Tranzaksiyalar mavjud emas" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold text-slate-500">
                        <th className="px-5 py-3">Kvitansiya</th>
                        <th className="px-4 py-3">Bemor</th>
                        <th className="px-4 py-3">Xizmat / Shifokor</th>
                        <th className="px-4 py-3">Usul</th>
                        <th className="px-4 py-3">Kassir</th>
                        <th className="px-4 py-3">Vaqt</th>
                        <th className="px-5 py-3 text-right">Summa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.transactions.map((tr) => (
                        <tr key={tr.id}>
                          <td className="px-5 py-3 font-bold text-slate-900">
                            {tr.receipt_number}
                          </td>
                          <td className="px-4 py-3">{tr.patient?.full_name}</td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {tr.service?.name} • {tr.doctor?.full_name}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {PAYMENT_METHOD_LABELS[tr.payment_method]}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {tr.accepted_by_profile?.full_name || "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {formatDateTimeUZ(tr.paid_at)}
                          </td>
                          <td className="px-5 py-3 text-right font-extrabold text-emerald-700">
                            {formatUZS(tr.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
