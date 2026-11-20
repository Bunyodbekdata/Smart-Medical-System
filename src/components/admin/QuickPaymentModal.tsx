"use client";

import React, { useState } from "react";
import { CreditCard } from "lucide-react";
import type { ReceiptData } from "@/components/shared/ReceiptModal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, SelectInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { formatUZS } from "@/lib/formatters";
import type { PaymentMethod, QueueTicket } from "@/types/database";

interface QuickPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: QueueTicket | null;
  clinicInfo?: {
    clinic_name?: string;
    logo_url?: string | null;
    address?: string | null;
    phone?: string | null;
    receipt_header?: string | null;
    receipt_footer?: string | null;
  } | null;
  onPaymentRecorded: (receipt?: ReceiptData) => void;
}

export function QuickPaymentModal(props: QuickPaymentModalProps) {
  if (!props.ticket) return null;
  return (
    <QuickPaymentModalInner
      key={`${props.ticket.id}-${String(props.open)}`}
      {...props}
      ticket={props.ticket}
    />
  );
}

function QuickPaymentModalInner({
  open,
  onOpenChange,
  ticket,
  clinicInfo,
  onPaymentRecorded,
}: Omit<QuickPaymentModalProps, "ticket"> & { ticket: QueueTicket }) {
  const { toast } = useToast();
  const remaining = Math.max(0, Number(ticket.total_due) - Number(ticket.paid_amount));
  const [amount, setAmount] = useState(
    String(remaining > 0 ? remaining : Number(ticket.total_due))
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [isConfirmed, setIsConfirmed] = useState(true);
  const [overrideReason, setOverrideReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      setErrorMsg("To'lov summasi 0 dan katta bo'lishi kerak.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: ticket.id,
          amount: numAmount,
          paymentMethod,
          isConfirmed,
          overrideReason: overrideReason.trim() || null,
          notes: null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "To'lovni saqlashda xatolik.");
        return;
      }

      toast({
        variant: "success",
        title: "To'lov muvaffaqiyatli qabul qilindi",
        description: `Kvitansiya: ${data.payment.receipt_number} (${formatUZS(numAmount)})`,
      });

      const newRemaining = Math.max(0, remaining - (isConfirmed ? numAmount : 0));
      const receipt: ReceiptData = {
        receiptNumber: data.payment.receipt_number,
        clinicName: clinicInfo?.clinic_name || "MedClinic",
        clinicLogoUrl: clinicInfo?.logo_url,
        clinicAddress: clinicInfo?.address,
        clinicPhone: clinicInfo?.phone,
        receiptHeader: clinicInfo?.receipt_header,
        receiptFooter: clinicInfo?.receipt_footer,
        patientName: ticket.patient?.full_name || "Bemor",
        ticketNumber: ticket.ticket_number,
        doctorName: ticket.doctor?.full_name || "Shifokor",
        roomNumber: ticket.room?.room_number,
        serviceName: ticket.service?.name || "Tibbiy xizmat",
        amountPaid: numAmount,
        remainingBalance: newRemaining,
        paymentMethod,
        paidAt: data.payment.paid_at,
      };

      onOpenChange(false);
      onPaymentRecorded(receipt);
    } catch {
      setErrorMsg("Tarmoq xatosi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-blue-600" />
            To&apos;lov qabul qilish ({ticket.ticket_number})
          </DialogTitle>
          <DialogDescription>
            {ticket.patient?.full_name} • {ticket.service?.name}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
            <div>
              <span className="text-slate-500">Jami xizmat narxi</span>
              <p className="mt-0.5 text-sm font-bold text-slate-900">
                {formatUZS(ticket.total_due)}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Qolgan to&apos;lov</span>
              <p className="mt-0.5 text-sm font-extrabold text-rose-600">
                {formatUZS(remaining)}
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="pay-amount">To&apos;lov summasi (UZS) *</Label>
            <Input
              id="pay-amount"
              type="number"
              min={500}
              step={500}
              className="mt-1.5"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="pay-method">To&apos;lov usuli *</Label>
            <SelectInput
              id="pay-method"
              className="mt-1.5"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            >
              <option value="cash">Naqd pul</option>
              <option value="card">Bank kartasi</option>
              <option value="transfer">Bank o&apos;tkazmasi</option>
            </SelectInput>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={isConfirmed}
              onChange={(e) => setIsConfirmed(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600"
            />
            To&apos;lov kassada tasdiqlandi (shifokor panelida &ldquo;To&apos;langan&rdquo; bo&apos;lib ko&apos;rinadi)
          </label>

          <div>
            <Label htmlFor="pay-override">Maxsus tuzatish sababi (ixtiyoriy)</Label>
            <Input
              id="pay-override"
              className="mt-1.5"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Masalan: Rahbariyat kelishuvi bo'yicha qisman to'lov"
            />
          </div>

          {errorMsg ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              {errorMsg}
            </div>
          ) : null}

          <div className="flex justify-end gap-2.5 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Bekor qilish
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saqlanmoqda..." : "To'lovni tasdiqlash"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
