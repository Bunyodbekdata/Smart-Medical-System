"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Calendar,
  CheckCircle2,
  Clock,
  PhoneCall,
  Play,
  RefreshCw,
  Stethoscope,
  Timer,
  UserCheck,
  UserX,
  Users,
  Wallet,
} from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { StaffStatCard } from "@/components/shared/StaffStatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SelectInput, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  formatDateDDMMYYYY,
  formatTimeHHMM,
  formatUZS,
  getTashkentDateString,
} from "@/lib/formatters";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  DOCTOR_AVAILABILITY_LABELS,
  PAYMENT_STATUS_BADGE_CLASSES,
  PAYMENT_STATUS_LABELS,
  QUEUE_STATUS_BADGE_CLASSES,
  QUEUE_STATUS_LABELS,
} from "@/lib/uz-labels";
import type { Doctor, DoctorAvailability, QueueTicket } from "@/types/database";

interface DoctorOverviewClientProps {
  clinicId: string;
  doctorId: string;
  initialDoctor: Doctor;
}

interface DoctorQueueStats {
  todayTotal: number;
  inConsultation: number;
  waiting: number;
  completed: number;
}

interface EarningsSnapshot {
  dailyEarnings: number;
  weeklyEarnings: number;
  monthlyEarnings: number;
}

const QUICK_NOTE_TEMPLATES = [
  "Profilaktik ko'rik o'tkazildi",
  "Retsept va tavsiyalar berildi",
  "Qayta ko'rik tavsiya etildi",
  "Laboratoriya tahliliga yo'naltirildi",
] as const;

function formatElapsedDuration(startedAt: string | null | undefined, nowMs: number): string | null {
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return null;
  const secs = Math.max(0, Math.floor((nowMs - start) / 1000));
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${String(mins).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

export function DoctorOverviewClient({
  clinicId,
  doctorId,
  initialDoctor,
}: DoctorOverviewClientProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [doctor, setDoctor] = useState<Doctor>(initialDoctor);
  const [stats, setStats] = useState<DoctorQueueStats>({
    todayTotal: 0,
    inConsultation: 0,
    waiting: 0,
    completed: 0,
  });
  const [earnings, setEarnings] = useState<EarningsSnapshot>({
    dailyEarnings: 0,
    weeklyEarnings: 0,
    monthlyEarnings: 0,
  });
  const [currentPatient, setCurrentPatient] = useState<QueueTicket | null>(null);
  const [waitingPatients, setWaitingPatients] = useState<QueueTicket[]>([]);
  const [visitNotes, setVisitNotes] = useState("");
  const [noShowTarget, setNoShowTarget] = useState<QueueTicket | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const todayDate = getTashkentDateString();

  const loadData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const [queueRes, earningsRes] = await Promise.all([
        fetch(`/api/doctor/queue?date=${getTashkentDateString()}`, { cache: "no-store" }),
        fetch("/api/doctor/earnings", { cache: "no-store" }),
      ]);

      if (queueRes.ok) {
        const qData = await queueRes.json();
        if (qData.doctor) setDoctor(qData.doctor);
        setStats(
          qData.stats ?? {
            todayTotal: 0,
            inConsultation: 0,
            waiting: 0,
            completed: 0,
          }
        );
        setCurrentPatient(qData.currentPatient ?? null);
        setWaitingPatients(qData.waitingPatients ?? []);
      }

      if (earningsRes.ok) {
        const eData = await earningsRes.json();
        if (eData.summary) {
          setEarnings({
            dailyEarnings: Number(eData.summary.dailyEarnings ?? 0),
            weeklyEarnings: Number(eData.summary.weeklyEarnings ?? 0),
            monthlyEarnings: Number(eData.summary.monthlyEarnings ?? 0),
          });
        }
      }
    } catch {
      toast({ variant: "error", title: "Ma'lumotlarni yuklashda xatolik" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  // Live elapsed timer tick while in active consultation
  useEffect(() => {
    if (!currentPatient || currentPatient.status !== "qabulda") return;
    const tick = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [currentPatient]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadData]);

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") void loadData();
    };
    window.addEventListener("focus", onFocus);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadData();
    }, 15_000);

    const supabase = createBrowserSupabaseClient();
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;
    if (supabase) {
      channel = supabase
        .channel(`doctor-live-${doctorId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "queue_tickets",
            filter: `doctor_id=eq.${doctorId}`,
          },
          () => {
            void loadData();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "payments",
            filter: `doctor_id=eq.${doctorId}`,
          },
          () => {
            void loadData();
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
  }, [clinicId, doctorId, loadData]);

  async function runQueueAction(payload: Record<string, unknown>, successMsg: string) {
    setActionLoading(true);
    try {
      const res = await fetch("/api/doctor/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "Amalni bajarib bo'lmadi" });
        return;
      }
      toast({ variant: "success", title: successMsg });
      if (payload.action === "complete_consultation") {
        setVisitNotes("");
      }
      await loadData();
    } catch {
      toast({ variant: "error", title: "Server bilan aloqada xatolik" });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAvailabilityChange(status: DoctorAvailability) {
    await runQueueAction(
      { action: "update_availability", availabilityStatus: status },
      `Holat yangilandi: ${DOCTOR_AVAILABILITY_LABELS[status]}`
    );
  }

  const canCallNext = !currentPatient && waitingPatients.length > 0;

  return (
    <div className="space-y-6">
      <StaffPageHeader
        eyebrow={`Shifokor ish stoli • ${doctor.specialization}`}
        title={doctor.full_name}
        description={
          doctor.room?.room_number
            ? `${doctor.room.room_number}-kabinet • Jonli bemor qabuli va navbat boshqaruvi`
            : "Jonli bemor qabuli va navbat boshqaruvi"
        }
        actions={
          <>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs tabular-nums">
              <Calendar className="h-4 w-4 text-[#0B4F8A]" />
              Bugun, {formatDateDDMMYYYY(todayDate)}
            </div>

            <SelectInput
              aria-label="Shifokor holati"
              value={doctor.availability_status}
              disabled={actionLoading}
              onChange={(e) => handleAvailabilityChange(e.target.value as DoctorAvailability)}
              className="w-44 bg-white text-xs font-semibold"
            >
              <option value="available">Bo&apos;sh (Qabulda)</option>
              <option value="busy">Band</option>
              <option value="break">Tanaffusda</option>
              <option value="off_duty">Ishdan tashqari</option>
            </SelectInput>

            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => void loadData(true)}
              disabled={refreshing}
              title="Yangilash"
              aria-label="Navbatni yangilash"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </>
        }
      />

      {/* Executive 4 KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaffStatCard
          label="Bugungi bemorlar"
          value={stats.todayTotal}
          hint="Jami ro'yxatga olingan"
          icon={Users}
          tone="sapphire"
        />
        <StaffStatCard
          label="Yakunlangan qabullar"
          value={stats.completed}
          hint="Bugun tugallangan"
          icon={UserCheck}
          tone="teal"
        />
        <StaffStatCard
          label="Navbatda kutmoqda"
          value={stats.waiting}
          hint={stats.inConsultation > 0 ? "1 nafar bemor qabulda" : "Keyingi bemorga tayyor"}
          icon={Clock}
          tone="amber"
        />
        <StaffStatCard
          label="Bugungi daromad"
          value={formatUZS(earnings.dailyEarnings)}
          hint={`Oylik: ${formatUZS(earnings.monthlyEarnings)}`}
          icon={Wallet}
          tone="featured"
        />
      </div>

      {/* Main Split: Hozirgi bemor + Keyingi bemorlar */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Current Patient Card */}
        <Card className="lg:col-span-5">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Stethoscope className="h-5 w-5 text-blue-600" />
              Hozirgi bemor
            </CardTitle>
            {currentPatient && (
              <div className="flex items-center gap-2">
                {currentPatient.status === "qabulda" &&
                  formatElapsedDuration(currentPatient.started_at, nowMs) ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 font-mono text-xs font-bold text-blue-700">
                    <Timer className="h-3.5 w-3.5" />
                    {formatElapsedDuration(currentPatient.started_at, nowMs)}
                  </span>
                ) : null}
                <Badge className={QUEUE_STATUS_BADGE_CLASSES[currentPatient.status]}>
                  {QUEUE_STATUS_LABELS[currentPatient.status]}
                </Badge>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="h-52 animate-pulse rounded-xl bg-slate-100" />
            ) : currentPatient ? (
              <>
                <div className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-[#F8FAFC] p-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#0B4F8A] text-lg font-extrabold text-white shadow-sm tabular-nums">
                    {currentPatient.ticket_number}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-lg font-bold text-slate-900">
                      {currentPatient.patient?.full_name || "Bemor"}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {currentPatient.patient?.phone || "Telefon ko'rsatilmagan"}
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5 rounded-xl border border-slate-100 bg-white p-3.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Xizmat:</span>
                    <span className="font-semibold text-slate-900">
                      {currentPatient.service?.name || "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">To&apos;lov holati:</span>
                    <Badge className={PAYMENT_STATUS_BADGE_CLASSES[currentPatient.payment_status]}>
                      {PAYMENT_STATUS_LABELS[currentPatient.payment_status]}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Summa / To&apos;landi:</span>
                    <span className="font-medium text-slate-800">
                      {formatUZS(currentPatient.paid_amount)} / {formatUZS(currentPatient.total_due)}
                    </span>
                  </div>
                  {currentPatient.patient?.notes && (
                    <div className="border-t border-slate-100 pt-2 text-xs text-slate-600">
                      <span className="font-semibold">Bemor qaydi:</span>{" "}
                      {currentPatient.patient.notes}
                    </div>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="visit-notes"
                    className="mb-1.5 block text-xs font-semibold text-slate-600"
                  >
                    Qabul qaydlari / tashxis xulosasi (ixtiyoriy)
                  </label>
                  <Textarea
                    id="visit-notes"
                    rows={3}
                    placeholder="Masalan: Profilaktik ko'rik o'tkazildi, tavsiyalar berildi..."
                    value={visitNotes}
                    onChange={(e) => setVisitNotes(e.target.value)}
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {QUICK_NOTE_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl}
                        type="button"
                        onClick={() =>
                          setVisitNotes((prev) =>
                            prev.trim() ? `${prev.trim()}. ${tpl}` : tpl
                          )
                        }
                        className="cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                      >
                        + {tpl}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Explicit Separate Buttons: Never auto-complete & auto-start */}
                <div className="flex flex-wrap gap-2.5 pt-1">
                  {currentPatient.status === "chaqirildi" && (
                    <>
                      <Button
                        type="button"
                        className="flex-1 bg-blue-600 text-white hover:bg-blue-700"
                        disabled={actionLoading}
                        onClick={() =>
                          runQueueAction(
                            {
                              action: "start_consultation",
                              ticketId: currentPatient.id,
                              visitNotes: visitNotes || null,
                            },
                            "Qabul boshlandi"
                          )
                        }
                      >
                        <Play className="mr-1.5 h-4 w-4" />
                        Qabulni boshlash
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-rose-200 text-rose-700 hover:bg-rose-50"
                        disabled={actionLoading}
                        onClick={() => setNoShowTarget(currentPatient)}
                      >
                        <UserX className="mr-1.5 h-4 w-4" />
                        Bemor kelmadi
                      </Button>
                    </>
                  )}

                  {currentPatient.status === "qabulda" && (
                    <Button
                      type="button"
                      className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                      disabled={actionLoading}
                      onClick={() =>
                        runQueueAction(
                          {
                            action: "complete_consultation",
                            ticketId: currentPatient.id,
                            visitNotes: visitNotes || null,
                          },
                          "Qabul yakunlandi"
                        )
                      }
                    >
                      <CheckCircle2 className="mr-1.5 h-4 w-4" />
                      Qabulni yakunlash
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <EmptyState
                  icon={Activity}
                  title="Hozircha faol qabul yo'q"
                  description={
                    waitingPatients.length > 0
                      ? `Navbatda ${waitingPatients.length} nafar bemor kutmoqda.`
                      : "Bugun uchun kutayotgan bemorlar hozircha mavjud emas."
                  }
                />
                <Button
                  type="button"
                  className="w-full"
                  disabled={!canCallNext || actionLoading}
                  onClick={() =>
                    runQueueAction({ action: "call_next" }, "Keyingi bemor chaqirildi")
                  }
                >
                  <PhoneCall className="mr-2 h-4 w-4" />
                  Keyingi bemorni chaqirish
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Next Patients Table */}
        <Card className="lg:col-span-7">
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
            <div>
              <CardTitle className="text-base">Keyingi bemorlar</CardTitle>
              <p className="text-xs text-slate-500">
                Bugungi navbat tartibi ({waitingPatients.length} kishi kutilmoqda)
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={!canCallNext || actionLoading}
              onClick={() =>
                runQueueAction({ action: "call_next" }, "Keyingi bemor chaqirildi")
              }
            >
              <PhoneCall className="mr-1.5 h-4 w-4" />
              Keyingi bemorni chaqirish
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {waitingPatients.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={Clock}
                  title="Kutayotgan bemorlar yo'q"
                  description="Yangi bemor ro'yxatdan o'tganda bu ro'yxat avtomatik yangilanadi."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-y border-slate-200/80 bg-[#F8FAFC] text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">
                      <th className="px-4 py-3">Chipta</th>
                      <th className="px-4 py-3">Bemor</th>
                      <th className="px-4 py-3">Xizmat</th>
                      <th className="px-4 py-3">To&apos;lov</th>
                      <th className="px-4 py-3">Holat</th>
                      <th className="px-4 py-3 text-right">Vaqt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {waitingPatients.map((ticket, index) => (
                      <tr
                        key={ticket.id}
                        className={index === 0 ? "bg-[#EDF4FA]/60" : "hover:bg-slate-50/70"}
                      >
                        <td className="px-4 py-3.5 font-extrabold text-[#0A1628] tabular-nums">
                          {ticket.ticket_number}
                          {index === 0 ? (
                            <span className="ml-1.5 rounded bg-[#0B4F8A] px-1.5 py-0.5 text-[10px] font-bold text-white">
                              Keyingi
                            </span>
                          ) : null}
                          {ticket.priority_level > 0 && (
                            <span className="ml-1.5 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                              Ustuvor
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">
                            {ticket.patient?.full_name || "Bemor"}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>{ticket.source === "online" ? "Onlayn" : "Klinikada"}</span>
                            {ticket.arrival_confirmed && (
                              <span className="font-medium text-emerald-700">• Kelgan</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {ticket.service?.name || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={PAYMENT_STATUS_BADGE_CLASSES[ticket.payment_status]}>
                            {PAYMENT_STATUS_LABELS[ticket.payment_status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={QUEUE_STATUS_BADGE_CLASSES[ticket.status]}>
                            {QUEUE_STATUS_LABELS[ticket.status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-slate-500">
                          {formatTimeHHMM(ticket.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={Boolean(noShowTarget)}
        onOpenChange={(open) => {
          if (!open) setNoShowTarget(null);
        }}
        title="Bemorni kelmagan deb belgilash"
        description={
          noShowTarget
            ? `${noShowTarget.ticket_number} raqamli bemor (${noShowTarget.patient?.full_name || ""}) kelmagan sifatida navbatdan chiqariladi.`
            : ""
        }
        confirmLabel="Ha, kelmadi"
        variant="destructive"
        loading={actionLoading}
        onConfirm={async () => {
          if (!noShowTarget) return;
          const targetId = noShowTarget.id;
          setNoShowTarget(null);
          await runQueueAction(
            { action: "mark_no_show", ticketId: targetId, reason: "Shifokor chaqiruviga kelmadi" },
            "Bemor kelmagan deb belgilandi"
          );
        }}
      />
    </div>
  );
}
