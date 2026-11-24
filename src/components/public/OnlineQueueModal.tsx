"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Search,
  ShieldCheck,
  Stethoscope,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { saveActiveTicket } from "@/lib/active-ticket-storage";
import { calculatePromotionDiscount } from "@/lib/domain/queue-rules";
import { formatUZS, formatUzPhoneInput, normalizeUzPhone } from "@/lib/formatters";
import { DOCTOR_AVAILABILITY_CLASSES, DOCTOR_AVAILABILITY_LABELS } from "@/lib/uz-labels";
import type { Doctor, Promotion, Service } from "@/types/database";

interface OnlineQueueModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicId: string | null;
  services: Service[];
  doctors: Doctor[];
  promotions: Promotion[];
  initialServiceId?: string | null;
  initialDoctorId?: string | null;
  onTicketCreated?: () => void;
}

interface CreatedTicketInfo {
  ticket_number: string;
  tracking_token: string;
  service_price: number;
  discount_amount: number;
  total_due: number;
  patientName: string;
  doctorName: string;
  roomNumber: string | null;
  serviceName: string;
}

export function OnlineQueueModal(props: OnlineQueueModalProps) {
  if (!props.open) return null;
  return (
    <OnlineQueueModalInner
      key={`${String(props.open)}-${props.initialServiceId ?? ""}-${props.initialDoctorId ?? ""}`}
      {...props}
    />
  );
}

function OnlineQueueModalInner({
  open,
  onOpenChange,
  clinicId,
  services,
  doctors,
  promotions,
  initialServiceId = null,
  initialDoctorId = null,
  onTicketCreated,
}: OnlineQueueModalProps) {
  const { toast } = useToast();
  const resolvedInitialServiceId = (() => {
    if (initialServiceId) return initialServiceId;
    if (initialDoctorId) {
      const doc = doctors.find((d) => d.id === initialDoctorId);
      const firstSrvId = doc?.doctor_services?.find((ds) => ds.is_active)?.service_id;
      if (firstSrvId) return firstSrvId;
    }
    return "";
  })();

  const resolvedInitialDoctorId = (() => {
    if (initialDoctorId) {
      const target = doctors.find((d) => d.id === initialDoctorId);
      return target && target.availability_status !== "off_duty" ? target.id : "";
    }
    if (resolvedInitialServiceId) {
      const firstEligible =
        doctors.find(
          (d) =>
            d.availability_status === "available" &&
            d.doctor_services?.some(
              (ds) => ds.service_id === resolvedInitialServiceId && ds.is_active
            )
        ) ??
        doctors.find(
          (d) =>
            d.availability_status !== "off_duty" &&
            d.doctor_services?.some(
              (ds) => ds.service_id === resolvedInitialServiceId && ds.is_active
            )
        );
      return firstEligible?.id ?? "";
    }
    return "";
  })();

  const [selectedServiceId, setSelectedServiceId] = useState<string>(resolvedInitialServiceId);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(resolvedInitialDoctorId);
  const [serviceSearch, setServiceSearch] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("+998 ");
  const [notes, setNotes] = useState("");
  const [consentGiven, setConsentGiven] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdTicket, setCreatedTicket] = useState<CreatedTicketInfo | null>(null);
  const [copied, setCopied] = useState(false);

  const visibleServices = useMemo(() => {
    const q = serviceSearch.trim().toLowerCase();
    if (!q) return services;
    return services.filter(
      (s) => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q)
    );
  }, [services, serviceSearch]);

  const eligibleDoctors = useMemo(() => {
    if (!selectedServiceId) return doctors;
    return doctors.filter((d) =>
      d.doctor_services?.some((ds) => ds.service_id === selectedServiceId && ds.is_active)
    );
  }, [doctors, selectedServiceId]);

  const selectedService = useMemo(
    () => services.find((s) => s.id === selectedServiceId) ?? null,
    [services, selectedServiceId]
  );

  const selectedDoctor = useMemo(
    () => doctors.find((d) => d.id === selectedDoctorId) ?? null,
    [doctors, selectedDoctorId]
  );

  const pricing = useMemo(() => {
    if (!selectedService) return null;
    const link = selectedDoctor?.doctor_services?.find(
      (ds) => ds.service_id === selectedService.id && ds.is_active
    );
    const basePrice = Number(link?.custom_price ?? selectedService.price);
    const matchingPromo =
      promotions.find((p) => p.service_id === selectedService.id) ??
      promotions.find((p) => p.service_id === null) ??
      null;
    const calc = calculatePromotionDiscount(basePrice, matchingPromo);
    return {
      basePrice,
      promo: matchingPromo,
      ...calc,
    };
  }, [selectedService, selectedDoctor, promotions]);

  const step1Done = Boolean(selectedServiceId);
  const step2Done = Boolean(selectedDoctorId);
  const step3Done =
    fullName.trim().length >= 3 && normalizeUzPhone(phone).length >= 12 && consentGiven;

  function handleServiceChange(serviceId: string) {
    setSelectedServiceId(serviceId);
    const stillValid = doctors.some(
      (d) =>
        d.id === selectedDoctorId &&
        d.availability_status !== "off_duty" &&
        d.doctor_services?.some((ds) => ds.service_id === serviceId && ds.is_active)
    );
    if (!stillValid) {
      const firstDoc =
        doctors.find(
          (d) =>
            d.availability_status === "available" &&
            d.doctor_services?.some((ds) => ds.service_id === serviceId && ds.is_active)
        ) ??
        doctors.find(
          (d) =>
            d.availability_status !== "off_duty" &&
            d.doctor_services?.some((ds) => ds.service_id === serviceId && ds.is_active)
        );
      setSelectedDoctorId(firstDoc?.id ?? "");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedServiceId || !selectedDoctorId) {
      setErrorMsg("Iltimos, xizmat va shifokorni tanlang.");
      return;
    }
    if (fullName.trim().length < 3) {
      setErrorMsg("Iltimos, to'liq ism-familiyangizni kiriting.");
      return;
    }
    if (!consentGiven) {
      setErrorMsg("Shaxsiy ma'lumotlarni qayta ishlashga rozilik berishingiz shart.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/queue/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinicId: clinicId ?? undefined,
          serviceId: selectedServiceId,
          doctorId: selectedDoctorId,
          fullName: fullName.trim(),
          phone: phone.trim(),
          notes: notes.trim() || null,
          consentGiven: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Navbat olishda xatolik yuz berdi.");
        return;
      }

      const doctorName = selectedDoctor?.full_name || "Shifokor";
      const serviceName = selectedService?.name || "Tibbiy xizmat";

      saveActiveTicket({
        ticketNumber: data.ticket.ticket_number,
        trackingToken: data.ticket.tracking_token,
        doctorName,
        serviceName,
        queueDate: data.ticket.queue_date,
      });

      setCreatedTicket({
        ticket_number: data.ticket.ticket_number,
        tracking_token: data.ticket.tracking_token,
        service_price: Number(data.ticket.service_price),
        discount_amount: Number(data.ticket.discount_amount),
        total_due: Number(data.ticket.total_due),
        patientName: fullName.trim(),
        doctorName,
        roomNumber: selectedDoctor?.room?.room_number ?? null,
        serviceName,
      });

      onTicketCreated?.();

      toast({
        variant: "success",
        title: "Navbat chiptasi yaratildi!",
        description: `Sizning navbat raqamingiz: ${data.ticket.ticket_number}`,
      });
    } catch {
      setErrorMsg("Internet aloqasini tekshiring va qayta urinib ko'ring.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyLink() {
    if (!createdTicket) return;
    const url = `${window.location.origin}/queue/${createdTicket.tracking_token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ variant: "info", title: "Kuzatuv havolasi nusxalandi" });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({ variant: "error", title: "Havolani nusxalab bo'lmadi" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {createdTicket ? (
          <div className="animate-fade-in py-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="mt-4 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">
                Navbat muvaffaqiyatli rasmiylashtirildi
              </p>
              <h3 className="mt-1 text-2xl font-extrabold text-slate-900">
                Sizning navbat chiptangiz
              </h3>
            </div>

            <div className="mt-5 rounded-2xl border border-[#CFE1F2] bg-[#F4F8FC] p-5">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#CFE1F2] pb-4">
                <div>
                  <span className="text-xs font-semibold text-slate-500">Navbat raqami</span>
                  <div className="text-3xl font-black tracking-tight text-[#0B4F8A] tabular-nums">
                    {createdTicket.ticket_number}
                  </div>
                </div>
                <Badge variant="warning" className="px-3 py-1 text-xs">
                  Kutilmoqda
                </Badge>
              </div>

              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-xs text-slate-500">Bemor</span>
                  <p className="font-semibold text-slate-900">{createdTicket.patientName}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Shifokor</span>
                  <p className="font-semibold text-slate-900">{createdTicket.doctorName}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Xizmat</span>
                  <p className="font-semibold text-slate-900">{createdTicket.serviceName}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Xona va to&apos;lov</span>
                  <p className="font-semibold text-slate-900">
                    {createdTicket.roomNumber ? `${createdTicket.roomNumber}-xona` : "Qabulxona"} •{" "}
                    {formatUZS(createdTicket.total_due)}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">Shaxsiy kuzatuv havolasi:</p>
              <p className="mt-1">
                Ushbu shaxsiy havola orqali navbatingiz holatini va oldingizdagi bemorlar sonini
                real vaqtda kuzatib borishingiz mumkin.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild className="flex-1">
                  <Link href={`/queue/${createdTicket.tracking_token}`}>
                    Navbatni jonli kuzatish
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
                <Button type="button" variant="outline" onClick={handleCopyLink}>
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Nusxalandi" : "Havolani nusxalash"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarCheck className="h-5 w-5 text-blue-600" />
                Onlayn navbatga yozilish
              </DialogTitle>
              <DialogDescription>
                Xizmat va shifokorni tanlang — tizim sizga avtomatik navbat raqami va jonli kuzatuv
                havolasini beradi.
              </DialogDescription>
            </DialogHeader>

            {/* Step Progress Pill Strip */}
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { num: 1, label: "Xizmat", done: step1Done },
                { num: 2, label: "Shifokor", done: step2Done },
                { num: 3, label: "Ma'lumotlar", done: step3Done },
              ].map((s) => (
                <div
                  key={s.num}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                    s.done
                      ? "border-emerald-200 bg-emerald-50/70 text-emerald-700"
                      : "border-slate-200 bg-slate-50/70 text-slate-500"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      s.done ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {s.done ? <Check className="h-3 w-3" /> : s.num}
                  </span>
                  <span className="truncate">{s.label}</span>
                </div>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-5">
              {/* Step 1: Service */}
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Label className="text-xs uppercase tracking-wider text-slate-500">
                    1. Tibbiy xizmatni tanlang
                  </Label>
                  {services.length > 4 ? (
                    <div className="relative w-44">
                      <Search className="pointer-events-none absolute top-2.5 left-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={serviceSearch}
                        onChange={(e) => setServiceSearch(e.target.value)}
                        placeholder="Xizmat qidirish..."
                        className="h-8 w-full rounded-lg border border-slate-200 bg-white pr-2.5 pl-8 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  ) : null}
                </div>
                <div className="grid max-h-44 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                  {visibleServices.map((srv) => {
                    const active = srv.id === selectedServiceId;
                    const srvPromo =
                      promotions.find((p) => p.service_id === srv.id) ??
                      promotions.find((p) => p.service_id === null) ??
                      null;
                    const srvCalc = calculatePromotionDiscount(Number(srv.price), srvPromo);
                    return (
                      <button
                        key={srv.id}
                        type="button"
                        onClick={() => handleServiceChange(srv.id)}
                        className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 text-left transition-all ${
                          active
                            ? "border-[#0B4F8A] bg-[#EDF4FA] ring-2 ring-[#0B4F8A]/15"
                            : "border-slate-200 bg-white hover:border-[#0B4F8A]/40"
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <p className="truncate text-sm font-bold text-[#0A1628]">{srv.name}</p>
                          <p className="text-xs text-slate-500">{srv.duration_minutes} daqiqa</p>
                        </div>
                        <div className="shrink-0 text-right tabular-nums">
                          {srvCalc.discountAmount > 0 ? (
                            <>
                              <span className="block text-[10px] text-slate-400 line-through">
                                {formatUZS(srv.price)}
                              </span>
                              <span className="text-xs font-bold text-[#0B4F8A]">
                                {formatUZS(srvCalc.finalPrice)}
                              </span>
                            </>
                          ) : (
                            <span className="text-xs font-bold text-[#0B4F8A]">
                              {formatUZS(srv.price)}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Doctor */}
              <div>
                <Label className="mb-2 block text-xs uppercase tracking-wider text-slate-500">
                  2. Shifokorni tanlang
                </Label>
                {eligibleDoctors.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
                    Ushbu xizmat uchun hozircha biriktirilgan shifokor topilmadi.
                  </div>
                ) : (
                  <div className="grid max-h-44 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                    {eligibleDoctors.map((doc) => {
                      const active = doc.id === selectedDoctorId;
                      const isOffToday = doc.availability_status === "off_duty";
                      return (
                        <button
                          key={doc.id}
                          type="button"
                          disabled={isOffToday}
                          onClick={() => {
                            if (!isOffToday) setSelectedDoctorId(doc.id);
                          }}
                          className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                            isOffToday
                              ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-55"
                              : active
                                ? "cursor-pointer border-[#0B4F8A] bg-[#EDF4FA] ring-2 ring-[#0B4F8A]/15"
                                : "cursor-pointer border-slate-200 bg-white hover:border-[#0B4F8A]/40"
                          }`}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EDF4FA] text-[#0B4F8A]">
                            <Stethoscope className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-slate-900">
                              {doc.full_name}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {doc.specialization}
                              {doc.room?.room_number ? ` • ${doc.room.room_number}-xona` : ""}
                            </p>
                            <span
                              className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                DOCTOR_AVAILABILITY_CLASSES[doc.availability_status]
                              }`}
                            >
                              {DOCTOR_AVAILABILITY_LABELS[doc.availability_status]}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Price summary if selected */}
              {pricing ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-2.5 text-sm">
                  <span className="text-slate-600">Xizmat narxi:</span>
                  <div className="flex items-center gap-2">
                    {pricing.discountAmount > 0 ? (
                      <>
                        <span className="text-xs text-slate-400 line-through">
                          {formatUZS(pricing.basePrice)}
                        </span>
                        <Badge variant="success">
                          -{formatUZS(pricing.discountAmount)} aksiya
                        </Badge>
                      </>
                    ) : null}
                    <span className="font-extrabold text-blue-700">
                      {formatUZS(pricing.finalPrice)}
                    </span>
                  </div>
                </div>
              ) : null}

              {/* Step 3: Patient info */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="online-fullname">Bemor F.I.Sh. *</Label>
                  <div className="relative mt-1.5">
                    <User className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400" />
                    <Input
                      id="online-fullname"
                      placeholder="Masalan: Ali Valiyev"
                      className="pl-9"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="online-phone">Telefon raqami *</Label>
                  <Input
                    id="online-phone"
                    type="tel"
                    inputMode="tel"
                    placeholder="+998 90 123 45 67"
                    className="mt-1.5"
                    value={phone}
                    onChange={(e) => setPhone(formatUzPhoneInput(e.target.value))}
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="online-notes">Qo&apos;shimcha izoh (ixtiyoriy)</Label>
                <Textarea
                  id="online-notes"
                  placeholder="Shikoyat yoki tashrif maqsadi haqida qisqacha..."
                  className="mt-1.5 min-h-[64px]"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Step 4: Personal Data Consent Notice (Uzbekistan PDPA compliance) */}
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={consentGiven}
                  onChange={(e) => setConsentGiven(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  <span className="flex items-center gap-1 font-semibold text-slate-800">
                    <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
                    Shaxsiy ma&apos;lumotlarni qayta ishlashga rozilik
                  </span>
                  <span className="mt-0.5 block leading-relaxed">
                    O&apos;zbekiston Respublikasining &ldquo;Shaxsga doir ma&apos;lumotlar to&apos;g&apos;risida&rdquo;gi
                    Qonuniga muvofiq, navbatni rasmiylashtirish va qabulni tashkil etish maqsadida
                    ism-familiyam va telefon raqamim qayta ishlanishiga rozilik bildiraman.
                  </span>
                </span>
              </label>

              {errorMsg ? (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700"
                >
                  {errorMsg}
                </div>
              ) : null}

              <div className="flex justify-end gap-2.5 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={submitting}
                >
                  Bekor qilish
                </Button>
                <Button type="submit" disabled={submitting || !clinicId}>
                  {submitting ? "Navbat olinmoqda..." : "Navbat chiptasini olish"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
