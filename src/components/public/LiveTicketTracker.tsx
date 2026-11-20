"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BellRing,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  DoorOpen,
  Hourglass,
  RefreshCw,
  Stethoscope,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from "lucide-react";
import { ClinicLogo } from "@/components/shared/ClinicLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { clearActiveTicket } from "@/lib/active-ticket-storage";
import { formatDateTimeUZ, formatUZS } from "@/lib/formatters";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  PAYMENT_STATUS_BADGE_CLASSES,
  PAYMENT_STATUS_LABELS,
  QUEUE_STATUS_BADGE_CLASSES,
  QUEUE_STATUS_LABELS,
} from "@/lib/uz-labels";
import type { PublicTicketTracking, QueueStatus } from "@/types/database";

interface LiveTicketTrackerProps {
  token: string;
  initialTicket: PublicTicketTracking;
}

const PROGRESS_STEPS: Array<{ key: QueueStatus; label: string }> = [
  { key: "kutilmoqda", label: "Kutilmoqda" },
  { key: "chaqirildi", label: "Chaqirildi" },
  { key: "qabulda", label: "Qabulda" },
  { key: "yakunlandi", label: "Yakunlandi" },
];

function getStepIndex(status: QueueStatus): number {
  return PROGRESS_STEPS.findIndex((s) => s.key === status);
}

function playCallChime() {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [587.33, 880];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + idx * 0.22;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.6);
    });
  } catch {
    // Ignore autoplay / audio context restrictions
  }
}

export function LiveTicketTracker({ token, initialTicket }: LiveTicketTrackerProps) {
  const { toast } = useToast();
  const [ticket, setTicket] = useState<PublicTicketTracking>(initialTicket);
  const [refreshing, setRefreshing] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [copied, setCopied] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>(new Date().toISOString());
  const prevStatusRef = useRef<QueueStatus>(initialTicket.status);

  const refreshTicket = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/queue/track/${token}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.ticket) {
          setTicket(data.ticket);
          setLastSyncedAt(new Date().toISOString());
        }
      }
    } catch {
      // Keep existing state and show subtle offline fallback
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    const prev = prevStatusRef.current;
    if (prev !== "chaqirildi" && ticket.status === "chaqirildi" && soundEnabled) {
      playCallChime();
    }
    prevStatusRef.current = ticket.status;

    if (ticket.status === "yakunlandi" || ticket.status === "bekor_qilindi") {
      clearActiveTicket(token);
    }
  }, [ticket.status, soundEnabled, token]);

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        void refreshTicket();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    const fallbackInterval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshTicket();
      }
    }, 15_000);

    const supabase = createBrowserSupabaseClient();
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;

    if (supabase) {
      const topic = `queue-public:${ticket.clinic_id}:${ticket.doctor_id}:${ticket.queue_date}`;
      channel = supabase
        .channel(topic)
        .on("broadcast", { event: "queue_updated" }, () => {
          void refreshTicket();
        })
        .subscribe((status) => {
          setRealtimeConnected(status === "SUBSCRIBED");
        });
    }

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.clearInterval(fallbackInterval);
      if (supabase && channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [ticket.clinic_id, ticket.doctor_id, ticket.queue_date, refreshTicket]);

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast({ variant: "info", title: "Kuzatuv havolasi nusxalandi" });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({ variant: "error", title: "Havolani nusxalab bo'lmadi" });
    }
  }

  const isCalled = ticket.status === "chaqirildi";
  const isInConsultation = ticket.status === "qabulda";
  const isCompleted = ticket.status === "yakunlandi";
  const currentStepIdx = getStepIndex(ticket.status);
  const estimatedWaitMinutes =
    ticket.status === "kutilmoqda" ? Math.max(5, Number(ticket.people_ahead || 0) * 15) : 0;

  return (
    <div className="bg-clinic-grid min-h-screen bg-[#F7F9FC] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-xl animate-fade-in">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition-colors hover:text-[#0B4F8A]"
          >
            <ArrowLeft className="h-4 w-4" />
            Bosh sahifaga
          </Link>
          <ClinicLogo name={ticket.clinic_name} />
        </div>

        {/* Called Alert */}
        {isCalled ? (
          <div className="mb-4 flex items-center gap-3.5 rounded-2xl border border-teal-500/30 bg-[#0B4F8A] p-4.5 text-white shadow-lg">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-400/20 text-teal-300">
              <BellRing className="h-6 w-6 animate-bounce" />
            </div>
            <div>
              <p className="text-sm font-extrabold">Sizning navbatingiz keldi!</p>
              <p className="mt-0.5 text-xs text-sky-100">
                Iltimos,{" "}
                <strong className="font-bold text-white">
                  {ticket.room_number ? `${ticket.room_number}-xonaga` : "shifokor xonasiga"}
                </strong>{" "}
                kiring ({ticket.doctor_name}).
              </p>
            </div>
          </div>
        ) : null}

        {isInConsultation ? (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[#CFE1F2] bg-[#EDF4FA] p-4 text-[#0A1628]">
            <Stethoscope className="h-6 w-6 shrink-0 text-[#0B4F8A]" />
            <div>
              <p className="text-sm font-bold">Qabul jarayoni davom etmoqda</p>
              <p className="text-xs text-slate-600">Siz hozir shifokor qabulidasiz.</p>
            </div>
          </div>
        ) : null}

        {isCompleted ? (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-4 text-teal-950">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-teal-600" />
            <div>
              <p className="text-sm font-bold">Qabul yakunlandi</p>
              <p className="text-xs text-teal-700">
                Tashrifingiz uchun rahmat! Sog&apos;lig&apos;ingiz doimo yaxshi bo&apos;lsin.
              </p>
            </div>
          </div>
        ) : null}

        {/* Digital Medical Boarding Pass Card */}
        <Card className="overflow-hidden border-slate-200/90 shadow-[0_18px_48px_-20px_rgba(10,22,40,0.2)]">
          <div className="relative overflow-hidden bg-gradient-to-br from-[#091426] via-[#0C2647] to-[#0B4F8A] p-6 text-white sm:p-7">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-teal-400/20 blur-2xl"
            />
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-200/80">
                  Elektron navbat chiptasi
                </p>
                <div className="mt-1.5 text-5xl font-black tracking-[-0.04em] tabular-nums">
                  {ticket.ticket_number}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSoundEnabled((v) => !v)}
                  title={soundEnabled ? "Ovozli eslatma yoqilgan" : "Ovozli eslatma o'chirilgan"}
                  className="inline-flex h-8.5 w-8.5 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20"
                  aria-label={soundEnabled ? "Ovozni o'chirish" : "Ovozni yoqish"}
                >
                  {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </button>
                <span
                  className={`rounded-full border px-3.5 py-1 text-xs font-bold shadow-xs ${
                    QUEUE_STATUS_BADGE_CLASSES[ticket.status]
                  }`}
                >
                  {QUEUE_STATUS_LABELS[ticket.status]}
                </span>
              </div>
            </div>

            <div className="relative mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/12 pt-4 text-xs text-slate-200">
              <span className="font-semibold">{ticket.patient_name}</span>
              <span className="inline-flex items-center gap-1.5 text-slate-300">
                {realtimeConnected ? (
                  <>
                    <Wifi className="h-3.5 w-3.5 text-teal-300" />
                    Jonli ulangan
                  </>
                ) : (
                  <>
                    <WifiOff className="h-3.5 w-3.5 text-amber-300" />
                    Avtomatik yangilanish (15s)
                  </>
                )}
              </span>
            </div>
          </div>

          <CardContent className="p-6 sm:p-7">
            {/* Connected 4-step Queue Stepper */}
            {currentStepIdx >= 0 ? (
              <div className="relative mb-7">
                <div className="absolute top-3.5 right-[12%] left-[12%] h-0.5 bg-slate-200" />
                <div
                  className="absolute top-3.5 left-[12%] h-0.5 bg-teal-600 transition-all duration-500"
                  style={{ width: `${(currentStepIdx / 3) * 76}%` }}
                />
                <div className="relative grid grid-cols-4 gap-2">
                  {PROGRESS_STEPS.map((step, idx) => {
                    const completed = idx < currentStepIdx;
                    const active = idx === currentStepIdx;
                    return (
                      <div key={step.key} className="flex flex-col items-center text-center">
                        <div
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all ${
                            completed
                              ? "bg-teal-600 text-white"
                              : active
                              ? "bg-[#0B4F8A] text-white ring-4 ring-[#0B4F8A]/15"
                              : "border border-slate-200 bg-white text-slate-400"
                          }`}
                        >
                          {completed ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                        </div>
                        <span
                          className={`mt-2 text-[11px] font-semibold ${
                            active
                              ? "text-[#0B4F8A]"
                              : completed
                              ? "text-teal-700"
                              : "text-slate-400"
                          }`}
                        >
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Live Queue Telemetry Tiles */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200/80 bg-[#F8FAFC] p-4">
                <p className="text-[11px] font-semibold text-slate-500">Hozir qabulda</p>
                <p className="mt-1 text-2xl font-extrabold text-[#0B4F8A] tabular-nums">
                  {ticket.current_serving_ticket_number || "—"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-[#F8FAFC] p-4">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                  <Users className="h-3.5 w-3.5" />
                  Oldingizda
                </p>
                <p className="mt-1 text-2xl font-extrabold text-[#0A1628] tabular-nums">
                  {ticket.status === "kutilmoqda" ? `${ticket.people_ahead} kishi` : "0 kishi"}
                </p>
              </div>
              <div className="col-span-2 rounded-2xl border border-slate-200/80 bg-[#F8FAFC] p-4 sm:col-span-1">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                  <Hourglass className="h-3.5 w-3.5" />
                  Taxminiy kutish
                </p>
                <p className="mt-1 text-2xl font-extrabold text-teal-700 tabular-nums">
                  {ticket.status === "kutilmoqda" ? `~${estimatedWaitMinutes} daq` : "0 daq"}
                </p>
              </div>
            </div>

            {/* Ticket Details */}
            <div className="mt-6 space-y-3 rounded-2xl border border-dashed border-slate-200 bg-white p-4.5 text-sm">
              <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2.5">
                <span className="flex items-center gap-2 text-slate-500">
                  <Stethoscope className="h-4 w-4 text-[#0B4F8A]" />
                  Shifokor
                </span>
                <span className="text-right font-bold text-[#0A1628]">
                  {ticket.doctor_name} ({ticket.doctor_specialization})
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2.5">
                <span className="flex items-center gap-2 text-slate-500">
                  <DoorOpen className="h-4 w-4 text-teal-600" />
                  Kabinet raqami
                </span>
                <span className="font-bold text-[#0A1628]">
                  {ticket.room_number ? `${ticket.room_number}-xona` : "Qabulxonadan aniqlang"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2.5">
                <span className="text-slate-500">Tibbiy xizmat</span>
                <span className="font-semibold text-[#0A1628]">{ticket.service_name}</span>
              </div>

              <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2.5">
                <span className="flex items-center gap-2 text-slate-500">
                  <Clock className="h-4 w-4 text-slate-400" />
                  Ro&apos;yxat vaqti
                </span>
                <span className="font-medium text-slate-700 tabular-nums">
                  {formatDateTimeUZ(ticket.created_at)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">To&apos;lov holati</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#0A1628] tabular-nums">
                    {formatUZS(ticket.total_due)}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                      PAYMENT_STATUS_BADGE_CLASSES[ticket.payment_status]
                    }`}
                  >
                    {PAYMENT_STATUS_LABELS[ticket.payment_status]}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-400 tabular-nums">
                Yangilandi: {formatDateTimeUZ(lastSyncedAt)}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleCopyLink}>
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-teal-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? "Nusxalandi" : "Havola"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshTicket}
                  disabled={refreshing}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                  {refreshing ? "Yangilanmoqda..." : "Yangilash"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
