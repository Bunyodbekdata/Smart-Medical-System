"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  CreditCard,
  Printer,
  RotateCcw,
} from "lucide-react";
import { QuickPaymentModal } from "./QuickPaymentModal";
import { EmptyState } from "@/components/shared/EmptyState";
import { ReceiptModal, type ReceiptData } from "@/components/shared/ReceiptModal";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatDateTimeUZ, formatUZS, getTashkentDateString } from "@/lib/formatters";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_BADGE_CLASSES,
  PAYMENT_STATUS_LABELS,
} from "@/lib/uz-labels";
import type { Payment, PaymentMethod, QueueTicket } from "@/types/database";

export function AdminPaymentsClient({ clinicId }: { clinicId: string }) {
  const { toast } = useToast();
  const [date, setDate] = useState(getTashkentDateString());
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pendingTickets, setPendingTickets] = useState<QueueTicket[]>([]);
  const [clinicSettings, setClinicSettings] = useState<{
    clinic_name?: string;
    logo_url?: string | null;
    address?: string | null;
    phone?: string | null;
    receipt_header?: string | null;
    receipt_footer?: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const [paymentTicket, setPaymentTicket] = useState<QueueTicket | null>(null);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  // Refund modal
  const [refundTarget, setRefundTarget] = useState<Payment | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>("cash");
  const [refundReason, setRefundReason] = useState("");
  const [refunding, setRefunding] = useState(false);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/payments?date=${date}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setPayments(data.payments ?? []);
        setPendingTickets(data.pendingTickets ?? []);
        setClinicSettings(data.clinicSettings ?? null);
      }
    } catch {
      toast({ variant: "error", title: "To'lovlarni yuklashda xatolik" });
    } finally {
      setLoading(false);
    }
  }, [date, toast]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadPayments();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadPayments]);

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") void loadPayments();
    };
    window.addEventListener("focus", onFocus);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadPayments();
    }, 25_000);

    const supabase = createBrowserSupabaseClient();
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;
    if (supabase) {
      channel = supabase
        .channel(`admin-payments-${clinicId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "payments",
            filter: `clinic_id=eq.${clinicId}`,
          },
          () => {
            void loadPayments();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "queue_tickets",
            filter: `clinic_id=eq.${clinicId}`,
          },
          () => {
            void loadPayments();
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
  }, [clinicId, loadPayments]);

  async function handleConfirmPayment(paymentId: string) {
    const res = await fetch("/api/admin/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm", paymentId }),
    });
    if (res.ok) {
      toast({ variant: "success", title: "To'lov tasdiqlandi" });
      void loadPayments();
    } else {
      const err = await res.json();
      toast({ variant: "error", title: err.error || "Xatolik" });
    }
  }

  function openReceiptFromPayment(p: Payment) {
    const totalDue = Number(p.ticket?.total_due ?? p.amount);
    const paid = Number(p.ticket?.paid_amount ?? p.amount);
    const remaining = Math.max(0, totalDue - paid);
    const ticketRoom = (p.ticket as unknown as { room?: { room_number?: string } | null } | null)
      ?.room?.room_number;

    setReceiptData({
      receiptNumber: p.receipt_number,
      clinicName: clinicSettings?.clinic_name || "MedClinic",
      clinicLogoUrl: clinicSettings?.logo_url,
      clinicAddress: clinicSettings?.address,
      clinicPhone: clinicSettings?.phone,
      receiptHeader: clinicSettings?.receipt_header,
      receiptFooter: clinicSettings?.receipt_footer,
      patientName: p.patient?.full_name || "Bemor",
      ticketNumber: p.ticket?.ticket_number || "—",
      doctorName: p.doctor?.full_name || "Shifokor",
      roomNumber: ticketRoom,
      serviceName: p.service?.name || "Xizmat",
      amountPaid: Number(p.amount),
      remainingBalance: remaining,
      paymentMethod: p.payment_method,
      paidAt: p.paid_at,
      acceptedByName: p.accepted_by_profile?.full_name,
    });
  }

  function openRefundModal(p: Payment) {
    const alreadyRefunded = (p.refunds ?? []).reduce((s, r) => s + Number(r.amount), 0);
    const maxRefundable = Math.max(0, Number(p.amount) - alreadyRefunded);
    setRefundTarget(p);
    setRefundAmount(String(maxRefundable));
    setRefundMethod(p.payment_method);
    setRefundReason("");
  }

  async function handleSubmitRefund(e: React.FormEvent) {
    e.preventDefault();
    if (!refundTarget) return;
    setRefunding(true);
    try {
      const res = await fetch("/api/admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "refund",
          paymentId: refundTarget.id,
          amount: Number(refundAmount),
          refundMethod,
          reason: refundReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "Qaytarishda xatolik" });
        return;
      }
      toast({
        variant: "info",
        title: `To'lov qaytarildi (${data.refund.refund_number})`,
      });
      setRefundTarget(null);
      void loadPayments();
    } finally {
      setRefunding(false);
    }
  }

  return (
    <div className="space-y-6">
      <StaffPageHeader
        eyebrow="Kassa va moliya"
        title="Kassa va to'lovlar"
        description="To'lovlarni qabul qilish, tasdiqlash, elektron kvitansiya chop etish va qaytarish"
        actions={
          <div className="flex items-center gap-2">
            <Label htmlFor="pay-filter-date" className="text-xs text-slate-500">
              Sana:
            </Label>
            <Input
              id="pay-filter-date"
              type="date"
              className="w-40"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        }
      />

      {/* Pending / Unpaid Queue Tickets */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span>To&apos;lov kutilayotgan bemorlar ({pendingTickets.length})</span>
            <Badge variant="warning">Kassa navbati</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingTickets.length === 0 ? (
            <p className="text-xs text-slate-500">
              Tanlangan sanada to&apos;lanmagan yoki qisman to&apos;langan chipta yo&apos;q.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {pendingTickets.map((t) => {
                const remaining = Math.max(0, Number(t.total_due) - Number(t.paid_amount));
                return (
                  <div
                    key={t.id}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-[#F8FAFC] p-4 transition-colors hover:border-[#0B4F8A]/30 hover:bg-white"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-lg bg-[#0B4F8A] px-2.5 py-0.5 text-xs font-extrabold text-white tabular-nums">
                          {t.ticket_number}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                            PAYMENT_STATUS_BADGE_CLASSES[t.payment_status]
                          }`}
                        >
                          {PAYMENT_STATUS_LABELS[t.payment_status]}
                        </span>
                      </div>
                      <p className="mt-2.5 font-bold text-slate-900">{t.patient?.full_name}</p>
                      <p className="text-xs text-slate-500">
                        {t.service?.name} • {t.doctor?.full_name}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-slate-200/70 pt-3">
                      <div>
                        <span className="text-[11px] text-slate-500">Qoldiq:</span>
                        <p className="text-sm font-extrabold text-rose-600">
                          {formatUZS(remaining)}
                        </p>
                      </div>
                      <Button size="sm" onClick={() => setPaymentTicket(t)}>
                        To&apos;lov olish
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recorded Payments Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Qabul qilingan to&apos;lovlar ({payments.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Yuklanmoqda...</div>
          ) : payments.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={CreditCard}
                title="Ushbu sanada to'lovlar qayd etilmagan"
                description="Yuqoridagi navbatdan bemorni tanlab to'lovni rasmiylashtiring."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold text-slate-500">
                    <th className="px-5 py-3.5">Kvitansiya / Chipta</th>
                    <th className="px-4 py-3.5">Bemor</th>
                    <th className="px-4 py-3.5">Xizmat / Shifokor</th>
                    <th className="px-4 py-3.5">Summa / Usul</th>
                    <th className="px-4 py-3.5">Kassir / Sana</th>
                    <th className="px-4 py-3.5">Holat</th>
                    <th className="px-5 py-3.5 text-right">Amallar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p) => {
                    const refundedSum = (p.refunds ?? []).reduce(
                      (s, r) => s + Number(r.amount),
                      0
                    );
                    const refundableLeft = Math.max(0, Number(p.amount) - refundedSum);
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/70">
                        <td className="px-5 py-3.5">
                          <p className="font-bold text-slate-900">{p.receipt_number}</p>
                          <p className="text-xs text-blue-600">{p.ticket?.ticket_number}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-slate-900">{p.patient?.full_name}</p>
                          <p className="text-xs text-slate-500">{p.patient?.phone}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-slate-800">{p.service?.name}</p>
                          <p className="text-xs text-slate-500">{p.doctor?.full_name}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-extrabold text-emerald-700">
                            {formatUZS(p.amount)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {PAYMENT_METHOD_LABELS[p.payment_method]}
                          </p>
                          {refundedSum > 0 ? (
                            <p className="text-[11px] font-semibold text-rose-600">
                              Qaytarilgan: -{formatUZS(refundedSum)}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-600">
                          <p className="font-medium">{p.accepted_by_profile?.full_name || "Kassir"}</p>
                          <p>{formatDateTimeUZ(p.paid_at)}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          {refundedSum >= Number(p.amount) ? (
                            <Badge variant="neutral">Qaytarilgan</Badge>
                          ) : p.is_confirmed ? (
                            <Badge variant="success">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Tasdiqlangan
                            </Badge>
                          ) : (
                            <Badge variant="warning">Tasdiqlanmagan</Badge>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openReceiptFromPayment(p)}
                            >
                              <Printer className="h-3.5 w-3.5" />
                              Chek
                            </Button>
                            {!p.is_confirmed ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleConfirmPayment(p.id)}
                              >
                                Tasdiqlash
                              </Button>
                            ) : null}
                            {p.is_confirmed && refundableLeft > 0 ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-rose-600 hover:bg-rose-50"
                                onClick={() => openRefundModal(p)}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Qaytarish
                              </Button>
                            ) : null}
                          </div>
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

      <QuickPaymentModal
        open={Boolean(paymentTicket)}
        onOpenChange={(open) => {
          if (!open) setPaymentTicket(null);
        }}
        ticket={paymentTicket}
        clinicInfo={clinicSettings}
        onPaymentRecorded={(receipt) => {
          void loadPayments();
          if (receipt) setReceiptData(receipt);
        }}
      />

      <ReceiptModal
        open={Boolean(receiptData)}
        onOpenChange={(open) => {
          if (!open) setReceiptData(null);
        }}
        receipt={receiptData}
      />

      {/* Refund Dialog */}
      <Dialog
        open={Boolean(refundTarget)}
        onOpenChange={(open) => {
          if (!open) setRefundTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-rose-600" />
              To&apos;lovni qaytarish ({refundTarget?.receipt_number})
            </DialogTitle>
            <DialogDescription>
              Qaytarish summasi klinika daromadi va shifokor ulushi hisob-kitobini avtomatik
              tuzatadi.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitRefund} className="mt-4 space-y-4">
            <div>
              <Label>Qaytarish summasi (UZS) *</Label>
              <Input
                type="number"
                min={500}
                step={500}
                className="mt-1.5"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                required
              />
            </div>

            <div>
              <Label>Qaytarish usuli</Label>
              <SelectInput
                className="mt-1.5"
                value={refundMethod}
                onChange={(e) => setRefundMethod(e.target.value as PaymentMethod)}
              >
                <option value="cash">Naqd pul</option>
                <option value="card">Bank kartasi</option>
                <option value="transfer">Bank o&apos;tkazmasi</option>
              </SelectInput>
            </div>

            <div>
              <Label>Qaytarish sababi (majburiy) *</Label>
              <Textarea
                className="mt-1.5"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Masalan: Bemor xizmatdan voz kechdi..."
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRefundTarget(null)}
              >
                Bekor qilish
              </Button>
              <Button type="submit" variant="destructive" disabled={refunding}>
                {refunding ? "Saqlanmoqda..." : "Qaytarishni tasdiqlash"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
