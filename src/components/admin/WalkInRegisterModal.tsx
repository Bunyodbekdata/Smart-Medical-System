"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { calculatePromotionDiscount } from "@/lib/domain/queue-rules";
import {
  formatDateDDMMYYYY,
  formatUZS,
  formatUzPhoneInput,
  normalizeUzPhone,
} from "@/lib/formatters";
import type { Doctor, PaymentMethod, Promotion, Service } from "@/types/database";

interface DuplicatePatient {
  id: string;
  full_name: string;
  phone: string;
  created_at: string;
}

interface WalkInRegisterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  services: Service[];
  doctors: Doctor[];
  promotions: Promotion[];
  onRegistered: () => void;
}

export function WalkInRegisterModal(props: WalkInRegisterModalProps) {
  if (!props.open) return null;
  return (
    <WalkInRegisterModalInner
      key={`${String(props.open)}-${props.services[0]?.id ?? ""}`}
      {...props}
    />
  );
}

function WalkInRegisterModalInner({
  open,
  onOpenChange,
  services,
  doctors,
  promotions,
  onRegistered,
}: WalkInRegisterModalProps) {
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("+998 ");
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicatePatient[]>([]);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [doctorId, setDoctorId] = useState("");
  const [notes, setNotes] = useState("");
  const [priorityLevel, setPriorityLevel] = useState<number>(0);
  const [priorityReason, setPriorityReason] = useState("");
  const [collectPaymentNow, setCollectPaymentNow] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentAmountManual, setPaymentAmountManual] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeServiceId = serviceId || services[0]?.id || "";

  const eligibleDoctors = useMemo(() => {
    if (!activeServiceId) return doctors;
    return doctors.filter((d) =>
      d.doctor_services?.some((ds) => ds.service_id === activeServiceId && ds.is_active)
    );
  }, [doctors, activeServiceId]);

  const activeDoctorId = eligibleDoctors.some((d) => d.id === doctorId)
    ? doctorId
    : (eligibleDoctors[0]?.id ?? "");

  const priceSummary = useMemo(() => {
    const srv = services.find((s) => s.id === activeServiceId);
    const doc = doctors.find((d) => d.id === activeDoctorId);
    if (!srv) return null;
    const custom = doc?.doctor_services?.find((ds) => ds.service_id === srv.id)?.custom_price;
    const base = Number(custom ?? srv.price);
    const promo =
      promotions.find((p) => p.service_id === srv.id) ??
      promotions.find((p) => p.service_id === null) ??
      null;
    const calc = calculatePromotionDiscount(base, promo);
    return { base, ...calc };
  }, [services, doctors, promotions, activeServiceId, activeDoctorId]);

  const effectivePaymentAmount =
    collectPaymentNow && !paymentAmountManual && priceSummary
      ? String(priceSummary.finalPrice)
      : paymentAmount;

  // Live phone duplicate check
  useEffect(() => {
    const norm = normalizeUzPhone(phone);
    if (norm.length < 9 || selectedPatientId) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/patients?checkPhone=${encodeURIComponent(norm)}`);
        if (res.ok) {
          const data = await res.json();
          setDuplicates(data.duplicates ?? []);
        }
      } catch {
        // Ignore network errors during quick lookup
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [phone, selectedPatientId]);

  function resetForm() {
    setFullName("");
    setPhone("+998 ");
    setSelectedPatientId(null);
    setDuplicates([]);
    setNotes("");
    setPriorityLevel(0);
    setPriorityReason("");
    setCollectPaymentNow(false);
    setPaymentAmount("");
    setPaymentAmountManual(false);
    setPaymentMethod("cash");
    setErrorMsg(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!activeServiceId || !activeDoctorId) {
      setErrorMsg("Xizmat va shifokorni tanlang.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: selectedPatientId,
          fullName: fullName.trim(),
          phone: phone.trim(),
          serviceId: activeServiceId,
          doctorId: activeDoctorId,
          notes: notes.trim() || null,
          priorityLevel,
          priorityReason: priorityLevel > 0 ? priorityReason.trim() : null,
          initialPayment:
            collectPaymentNow && Number(effectivePaymentAmount) > 0
              ? {
                  amount: Number(effectivePaymentAmount),
                  paymentMethod,
                  isConfirmed: true,
                }
              : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Ro'yxatdan o'tkazishda xatolik.");
        return;
      }

      toast({
        variant: "success",
        title: `Bemor navbatga qo'shildi: ${data.ticket.ticket_number}`,
        description: data.warning || `${fullName.trim()} muvaffaqiyatli ro'yxatga olindi.`,
      });

      resetForm();
      onOpenChange(false);
      onRegistered();
    } catch {
      setErrorMsg("Tarmoq xatosi. Qayta urinib ko'ring.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-blue-600" />
            Yangi bemorni ro&apos;yxatga olish (Walk-in)
          </DialogTitle>
          <DialogDescription>
            Klinikaga kelgan bemor uchun yagona elektron navbat chiptasini yarating.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="walkin-phone">Telefon raqami *</Label>
              <Input
                id="walkin-phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => {
                  const nextPhone = formatUzPhoneInput(e.target.value);
                  setSelectedPatientId(null);
                  setPhone(nextPhone);
                  if (normalizeUzPhone(nextPhone).length < 9) {
                    setDuplicates([]);
                  }
                }}
                placeholder="+998 90 123 45 67"
                className="mt-1.5"
                required
              />
            </div>

            <div>
              <Label htmlFor="walkin-name">Bemor F.I.Sh. *</Label>
              <Input
                id="walkin-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Masalan: Dilshoda Ergasheva"
                className="mt-1.5"
                required
              />
            </div>
          </div>

          {/* Duplicate patient warning */}
          {duplicates.length > 0 && !selectedPatientId ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Diqqat! Ushbu telefon raqami bo&apos;yicha bemor bazada mavjud:
              </div>
              <div className="mt-2 space-y-1.5">
                {duplicates.map((dup) => (
                  <div
                    key={dup.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/80 px-3 py-2"
                  >
                    <div>
                      <span className="font-bold">{dup.full_name}</span> • {dup.phone}{" "}
                      <span className="text-slate-500">
                        ({formatDateDDMMYYYY(dup.created_at)})
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setSelectedPatientId(dup.id);
                        setFullName(dup.full_name);
                        setPhone(dup.phone);
                        setDuplicates([]);
                      }}
                    >
                      Tanlash
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {selectedPatientId ? (
            <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800">
              <span className="flex items-center gap-1.5">
                <Check className="h-4 w-4" />
                Mavjud bemor kartasi tanlandi: {fullName}
              </span>
              <button
                type="button"
                onClick={() => setSelectedPatientId(null)}
                className="underline hover:text-emerald-950"
              >
                Bekor qilish
              </button>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="walkin-service">Xizmat turi *</Label>
              <SelectInput
                id="walkin-service"
                className="mt-1.5"
                value={activeServiceId}
                onChange={(e) => setServiceId(e.target.value)}
              >
                {services.map((srv) => (
                  <option key={srv.id} value={srv.id}>
                    {srv.name} — {formatUZS(srv.price)}
                  </option>
                ))}
              </SelectInput>
            </div>

            <div>
              <Label htmlFor="walkin-doctor">Shifokor *</Label>
              <SelectInput
                id="walkin-doctor"
                className="mt-1.5"
                value={activeDoctorId}
                onChange={(e) => setDoctorId(e.target.value)}
              >
                {eligibleDoctors.length === 0 ? (
                  <option value="">Shifokor biriktirilmagan</option>
                ) : (
                  eligibleDoctors.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.full_name} ({doc.specialization})
                    </option>
                  ))
                )}
              </SelectInput>
            </div>
          </div>

          {priceSummary ? (
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm">
              <span className="text-slate-600">To&apos;lanadigan xizmat narxi:</span>
              <div className="flex items-center gap-2">
                {priceSummary.discountAmount > 0 ? (
                  <Badge variant="success">
                    -{formatUZS(priceSummary.discountAmount)} chegirma
                  </Badge>
                ) : null}
                <span className="font-extrabold text-blue-700">
                  {formatUZS(priceSummary.finalPrice)}
                </span>
              </div>
            </div>
          ) : null}

          {/* Priority section */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="walkin-priority">Navbat ustuvorligi</Label>
              <SelectInput
                id="walkin-priority"
                className="mt-1.5"
                value={priorityLevel}
                onChange={(e) => setPriorityLevel(Number(e.target.value))}
              >
                <option value={0}>Oddiy navbat</option>
                <option value={1}>Ustuvor (homilador, nogironligi bor va h.k.)</option>
                <option value={2}>Shoshilinch tibbiy holat</option>
              </SelectInput>
            </div>

            {priorityLevel > 0 ? (
              <div>
                <Label htmlFor="walkin-priority-reason">Ustuvorlik sababi *</Label>
                <Input
                  id="walkin-priority-reason"
                  className="mt-1.5"
                  value={priorityReason}
                  onChange={(e) => setPriorityReason(e.target.value)}
                  placeholder="Masalan: Homilador bemor / Shoshilinch og'riq"
                  required
                />
              </div>
            ) : (
              <div>
                <Label htmlFor="walkin-notes">Izoh (ixtiyoriy)</Label>
                <Input
                  id="walkin-notes"
                  className="mt-1.5"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Qabulxona izohi..."
                />
              </div>
            )}
          </div>

          {priorityLevel > 0 ? (
            <div>
              <Label htmlFor="walkin-notes-p">Qo&apos;shimcha izoh</Label>
              <Textarea
                id="walkin-notes-p"
                className="mt-1.5 min-h-[56px]"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          ) : null}

          {/* Optional immediate payment */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-bold text-slate-800">
              <input
                type="checkbox"
                checked={collectPaymentNow}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setCollectPaymentNow(checked);
                  if (checked && priceSummary) {
                    setPaymentAmountManual(false);
                    setPaymentAmount(String(priceSummary.finalPrice));
                  }
                }}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              Ro&apos;yxatdan o&apos;tkazish bilan birga to&apos;lovni hozir qabul qilish
            </label>

            {collectPaymentNow ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="walkin-pay-amount">Summa (so&apos;m)</Label>
                  <Input
                    id="walkin-pay-amount"
                    type="number"
                    min={1000}
                    step={500}
                    className="mt-1"
                    value={effectivePaymentAmount}
                    onChange={(e) => {
                      setPaymentAmountManual(true);
                      setPaymentAmount(e.target.value);
                    }}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="walkin-pay-method">To&apos;lov usuli</Label>
                  <SelectInput
                    id="walkin-pay-method"
                    className="mt-1"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  >
                    <option value="cash">Naqd pul</option>
                    <option value="card">Bank kartasi</option>
                    <option value="transfer">Bank o&apos;tkazmasi</option>
                  </SelectInput>
                </div>
              </div>
            ) : null}
          </div>

          {errorMsg ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">
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
              {submitting ? "Saqlanmoqda..." : "Navbatga qo'shish"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
