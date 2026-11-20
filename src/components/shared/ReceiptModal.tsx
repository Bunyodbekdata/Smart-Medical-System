"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateTimeUZ, formatUZS } from "@/lib/formatters";
import { PAYMENT_METHOD_LABELS } from "@/lib/uz-labels";
import { ClinicLogo } from "./ClinicLogo";
import type { PaymentMethod } from "@/types/database";

export interface ReceiptData {
  receiptNumber: string;
  clinicName: string;
  clinicLogoUrl?: string | null;
  clinicAddress?: string | null;
  clinicPhone?: string | null;
  receiptHeader?: string | null;
  receiptFooter?: string | null;
  patientName: string;
  ticketNumber: string;
  doctorName: string;
  roomNumber?: string | null;
  serviceName: string;
  amountPaid: number;
  remainingBalance: number;
  paymentMethod: PaymentMethod;
  paidAt: string;
  acceptedByName?: string | null;
}

interface ReceiptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: ReceiptData | null;
}

export function ReceiptModal({ open, onOpenChange, receipt }: ReceiptModalProps) {
  if (!receipt) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="no-print">
          <DialogTitle>Elektron xizmat kvitansiyasi</DialogTitle>
        </DialogHeader>

        <div
          id="printable-receipt"
          className="mt-2 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900"
        >
          <div className="flex items-start justify-between border-b border-dashed border-slate-200 pb-4">
            <ClinicLogo
              name={receipt.clinicName}
              subtitle={receipt.receiptHeader || "Ichki xizmat kvitansiyasi"}
              logoUrl={receipt.clinicLogoUrl}
            />
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Kvitansiya №
              </p>
              <p className="text-sm font-bold text-slate-900">{receipt.receiptNumber}</p>
            </div>
          </div>

          <div className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Bemor:</span>
              <span className="text-right font-semibold text-slate-900">{receipt.patientName}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Navbat raqami:</span>
              <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">
                {receipt.ticketNumber}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Shifokor:</span>
              <span className="text-right font-medium text-slate-800">{receipt.doctorName}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Xona raqami:</span>
              <span className="font-medium text-slate-800">
                {receipt.roomNumber ? `${receipt.roomNumber}-xona` : "—"}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Xizmat:</span>
              <span className="text-right font-medium text-slate-800">{receipt.serviceName}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">To&apos;lov usuli:</span>
              <span className="font-medium text-slate-800">
                {PAYMENT_METHOD_LABELS[receipt.paymentMethod]}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Sana va vaqt:</span>
              <span className="font-medium text-slate-800">{formatDateTimeUZ(receipt.paidAt)}</span>
            </div>
          </div>

          <div className="mt-4 space-y-2 border-t border-dashed border-slate-200 pt-4">
            <div className="flex items-center justify-between text-base">
              <span className="font-semibold text-slate-700">To&apos;langan summa:</span>
              <span className="font-extrabold text-emerald-700">
                {formatUZS(receipt.amountPaid)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Qolgan qarz:</span>
              <span className="font-bold text-slate-900">
                {formatUZS(receipt.remainingBalance)}
              </span>
            </div>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-3 text-center text-[11px] text-slate-500">
            {receipt.clinicAddress ? <p>{receipt.clinicAddress}</p> : null}
            {receipt.clinicPhone ? <p className="mt-0.5">{receipt.clinicPhone}</p> : null}
            <p className="mt-2 font-medium text-slate-600">
              {receipt.receiptFooter || "Sog'lig'ingiz uchun tashakkur!"}
            </p>
            <p className="mt-1 text-[10px] text-slate-400">
              Ichki xizmat kvitansiyasi (fiskal chek o&apos;rnini bosmaydi)
            </p>
          </div>
        </div>

        <div className="no-print mt-4 flex justify-end gap-2.5">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Yopish
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Chop etish
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
