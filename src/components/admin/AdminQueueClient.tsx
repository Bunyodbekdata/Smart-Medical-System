"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpCircle,
  CheckCircle2,
  Link2,
  ListOrdered,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { QuickPaymentModal } from "./QuickPaymentModal";
import { WalkInRegisterModal } from "./WalkInRegisterModal";
import { EmptyState } from "@/components/shared/EmptyState";
import { ReceiptModal, type ReceiptData } from "@/components/shared/ReceiptModal";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { formatTimeHHMM, formatUZS, getTashkentDateString } from "@/lib/formatters";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  PAYMENT_STATUS_BADGE_CLASSES,
  PAYMENT_STATUS_LABELS,
  QUEUE_STATUS_BADGE_CLASSES,
  QUEUE_STATUS_LABELS,
} from "@/lib/uz-labels";
import type { Doctor, Promotion, QueueStatus, QueueTicket, Service } from "@/types/database";

export function AdminQueueClient({ clinicId }: { clinicId: string }) {
  const { toast } = useToast();
  const [date, setDate] = useState(getTashkentDateString());
  const [doctorId, setDoctorId] = useState("all");
  const [serviceId, setServiceId] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [tickets, setTickets] = useState<QueueTicket[]>([]);
  const [loading, setLoading] = useState(true);

  const [services, setServices] = useState<Service[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [clinicSettings, setClinicSettings] = useState<{
    clinic_name?: string;
    logo_url?: string | null;
    address?: string | null;
    phone?: string | null;
    receipt_header?: string | null;
    receipt_footer?: string | null;
  } | null>(null);

  const [walkInOpen, setWalkInOpen] = useState(false);
  const [paymentTicket, setPaymentTicket] = useState<QueueTicket | null>(null);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  // Priority modal
  const [priorityTarget, setPriorityTarget] = useState<QueueTicket | null>(null);
  const [priorityLevel, setPriorityLevel] = useState(1);
  const [priorityReason, setPriorityReason] = useState("");
  const [savingPriority, setSavingPriority] = useState(false);

  // Status transition confirm
  const [statusTarget, setStatusTarget] = useState<{
    ticket: QueueTicket;
    status: QueueStatus;
    title: string;
    desc: string;
  } | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        date,
        doctorId,
        serviceId,
        status: statusFilter,
        q: search.trim(),
      });
      const res = await fetch(`/api/admin/queue?${params.toString()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets ?? []);
      }
    } catch {
      toast({ variant: "error", title: "Navbatni yuklashda xatolik" });
    } finally {
      setLoading(false);
    }
  }, [date, doctorId, serviceId, statusFilter, search, toast]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadQueue();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadQueue]);

  useEffect(() => {
    fetch("/api/staff/catalog", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setServices(d.services ?? []);
          setDoctors(d.doctors ?? []);
          setPromotions(d.promotions ?? []);
          setClinicSettings(d.clinicSettings ?? null);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") void loadQueue();
    };
    window.addEventListener("focus", onFocus);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadQueue();
    }, 20_000);

    const supabase = createBrowserSupabaseClient();
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;
    if (supabase) {
      channel = supabase
        .channel(`admin-queue-${clinicId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "queue_tickets",
            filter: `clinic_id=eq.${clinicId}`,
          },
          () => {
            void loadQueue();
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
  }, [clinicId, loadQueue]);

  async function handleCopyTrackingLink(ticket: QueueTicket) {
    try {
      const url = `${window.location.origin}/queue/${ticket.tracking_token}`;
      await navigator.clipboard.writeText(url);
      toast({
        variant: "info",
        title: `${ticket.ticket_number} kuzatuv havolasi nusxalandi`,
      });
    } catch {
      toast({ variant: "error", title: "Havolani nusxalab bo'lmadi" });
    }
  }

  async function handleConfirmArrival(ticket: QueueTicket) {
    const res = await fetch("/api/admin/queue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm_arrival", ticketId: ticket.id }),
    });
    if (res.ok) {
      toast({ variant: "success", title: `${ticket.ticket_number} kelishi tasdiqlandi` });
      void loadQueue();
    } else {
      const err = await res.json();
      toast({ variant: "error", title: err.error || "Xatolik" });
    }
  }

  async function handleSavePriority(e: React.FormEvent) {
    e.preventDefault();
    if (!priorityTarget) return;
    setSavingPriority(true);
    try {
      const res = await fetch("/api/admin/queue", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_priority",
          ticketId: priorityTarget.id,
          priorityLevel,
          reason: priorityReason.trim(),
        }),
      });
      if (res.ok) {
        toast({
          variant: "success",
          title: `${priorityTarget.ticket_number} ustuvorligi yangilandi`,
        });
        setPriorityTarget(null);
        setPriorityReason("");
        void loadQueue();
      } else {
        const err = await res.json();
        toast({ variant: "error", title: err.error || "Xatolik" });
      }
    } finally {
      setSavingPriority(false);
    }
  }

  async function handleConfirmTransition() {
    if (!statusTarget) return;
    setTransitioning(true);
    try {
      const res = await fetch("/api/admin/queue", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "transition_status",
          ticketId: statusTarget.ticket.id,
          status: statusTarget.status,
          reason: `Administrator: ${QUEUE_STATUS_LABELS[statusTarget.status]}`,
        }),
      });
      if (res.ok) {
        toast({
          variant: "success",
          title: `${statusTarget.ticket.ticket_number} -> ${QUEUE_STATUS_LABELS[statusTarget.status]}`,
        });
        setStatusTarget(null);
        void loadQueue();
      } else {
        const err = await res.json();
        toast({ variant: "error", title: err.error || "Holatni o'zgartirib bo'lmadi" });
      }
    } finally {
      setTransitioning(false);
    }
  }

  return (
    <div className="space-y-6">
      <StaffPageHeader
        eyebrow="Elektron navbat"
        title="Navbat boshqaruvi"
        description="Shifokorlar va xizmatlar kesimida barcha onlayn va walk-in navbatlar nazorati"
        actions={
          <>
            <Button
              variant="outline"
              size="icon"
              onClick={() => void loadQueue()}
              disabled={loading}
              title="Yangilash"
              aria-label="Navbatni yangilash"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button onClick={() => setWalkInOpen(true)}>
              <Plus className="h-4 w-4" />
              Walk-in navbat qo&apos;shish
            </Button>
          </>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Label className="mb-1 block">Sana</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block">Shifokor</Label>
            <SelectInput value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
              <option value="all">Barcha shifokorlar</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </SelectInput>
          </div>
          <div>
            <Label className="mb-1 block">Xizmat</Label>
            <SelectInput value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="all">Barcha xizmatlar</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectInput>
          </div>
          <div>
            <Label className="mb-1 block">Holat</Label>
            <SelectInput value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Barcha holatlar</option>
              <option value="kutilmoqda">Kutilmoqda</option>
              <option value="chaqirildi">Chaqirildi</option>
              <option value="qabulda">Qabulda</option>
              <option value="yakunlandi">Yakunlandi</option>
              <option value="kelmagan">Kelmagan</option>
              <option value="bekor_qilindi">Bekor qilindi</option>
            </SelectInput>
          </div>
          <div>
            <Label className="mb-1 block">Qidirish</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="Raqam, ism, tel..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Queue Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={6} columns={8} />
          ) : tickets.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={ListOrdered}
                title="Tanlangan filtr bo'yicha navbat chiptalari yo'q"
                description="Boshqa sanani yoki filtrni tanlab ko'ring."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-[#F8FAFC] text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">
                    <th className="px-5 py-3.5">Chipta</th>
                    <th className="px-4 py-3.5">Bemor</th>
                    <th className="px-4 py-3.5">Shifokor / Xona</th>
                    <th className="px-4 py-3.5">Xizmat</th>
                    <th className="px-4 py-3.5">Keldi</th>
                    <th className="px-4 py-3.5">To&apos;lov</th>
                    <th className="px-4 py-3.5">Holat</th>
                    <th className="px-5 py-3.5 text-right">Amallar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tickets.map((t) => {
                    const remaining = Math.max(0, Number(t.total_due) - Number(t.paid_amount));
                    return (
                      <tr key={t.id} className="hover:bg-slate-50/70">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-slate-900">
                              {t.ticket_number}
                            </span>
                            {t.priority_level > 0 ? (
                              <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                                P{t.priority_level}
                              </span>
                            ) : null}
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {formatTimeHHMM(t.created_at)} •{" "}
                            {t.source === "online" ? "Onlayn" : "Walk-in"}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-bold text-slate-900">{t.patient?.full_name}</p>
                          <p className="text-xs text-slate-500">{t.patient?.phone}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-slate-800">{t.doctor?.full_name}</p>
                          <p className="text-xs text-slate-400">
                            {t.room?.room_number ? `${t.room.room_number}-xona` : "—"}
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-slate-800">{t.service?.name}</p>
                          <p className="text-xs text-slate-500">{formatUZS(t.total_due)}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          {t.arrival_confirmed ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Tasdiqlangan
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleConfirmArrival(t)}
                            >
                              Tasdiqlash
                            </Button>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                              PAYMENT_STATUS_BADGE_CLASSES[t.payment_status]
                            }`}
                          >
                            {PAYMENT_STATUS_LABELS[t.payment_status]}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                              QUEUE_STATUS_BADGE_CLASSES[t.status]
                            }`}
                          >
                            {QUEUE_STATUS_LABELS[t.status]}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {remaining > 0 && t.status !== "bekor_qilindi" ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setPaymentTicket(t)}
                              >
                                To&apos;lov
                              </Button>
                            ) : null}

                            {t.status !== "bekor_qilindi" ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Kuzatuv havolasini nusxalash"
                                aria-label="Kuzatuv havolasini nusxalash"
                                onClick={() => void handleCopyTrackingLink(t)}
                              >
                                <Link2 className="h-3.5 w-3.5 text-slate-500" />
                              </Button>
                            ) : null}

                            {t.status === "kutilmoqda" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                title="Ustuvorlik berish"
                                onClick={() => {
                                  setPriorityTarget(t);
                                  setPriorityLevel(t.priority_level || 1);
                                  setPriorityReason(t.priority_reason || "");
                                }}
                              >
                                <ArrowUpCircle className="h-3.5 w-3.5 text-amber-600" />
                              </Button>
                            ) : null}

                            {t.status === "kutilmoqda" || t.status === "chaqirildi" ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setStatusTarget({
                                      ticket: t,
                                      status: "kelmagan",
                                      title: "Kelmagan deb belgilash",
                                      desc: `${t.ticket_number} (${t.patient?.full_name}) bemorni 'Kelmagan' holatiga o'tkazmoqchimisiz?`,
                                    })
                                  }
                                >
                                  Kelmadi
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-rose-600 hover:bg-rose-50"
                                  onClick={() =>
                                    setStatusTarget({
                                      ticket: t,
                                      status: "bekor_qilindi",
                                      title: "Chiptani bekor qilish",
                                      desc: `${t.ticket_number} chiptasini bekor qilmoqchimisiz?`,
                                    })
                                  }
                                >
                                  Bekor
                                </Button>
                              </>
                            ) : null}

                            {t.status === "kelmagan" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setStatusTarget({
                                    ticket: t,
                                    status: "kutilmoqda",
                                    title: "Navbatga qaytarish",
                                    desc: `${t.ticket_number} chiptasini qayta 'Kutilmoqda' holatiga o'tkazmoqchimisiz?`,
                                  })
                                }
                              >
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

      {/* Priority Modal */}
      <Dialog
        open={Boolean(priorityTarget)}
        onOpenChange={(open) => {
          if (!open) setPriorityTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Navbat ustuvorligini belgilash ({priorityTarget?.ticket_number})
            </DialogTitle>
            <DialogDescription>
              Qo&apos;lda ustuvorlik o&apos;zgartirish sababi audit jurnaliga yoziladi.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSavePriority} className="mt-4 space-y-4">
            <div>
              <Label>Ustuvorlik darajasi</Label>
              <SelectInput
                className="mt-1.5"
                value={priorityLevel}
                onChange={(e) => setPriorityLevel(Number(e.target.value))}
              >
                <option value={0}>0 — Oddiy navbat</option>
                <option value={1}>1 — Ustuvor (homilador, keksa, nogiron)</option>
                <option value={2}>2 — Shoshilinch holat</option>
              </SelectInput>
            </div>
            <div>
              <Label>Sabab (majburiy) *</Label>
              <Input
                className="mt-1.5"
                value={priorityReason}
                onChange={(e) => setPriorityReason(e.target.value)}
                placeholder="Masalan: Homilador bemor navbatsiz qabul"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPriorityTarget(null)}
              >
                Bekor qilish
              </Button>
              <Button type="submit" disabled={savingPriority}>
                {savingPriority ? "Saqlanmoqda..." : "Saqlash"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <WalkInRegisterModal
        open={walkInOpen}
        onOpenChange={setWalkInOpen}
        services={services}
        doctors={doctors}
        promotions={promotions}
        onRegistered={() => void loadQueue()}
      />

      <QuickPaymentModal
        open={Boolean(paymentTicket)}
        onOpenChange={(open) => {
          if (!open) setPaymentTicket(null);
        }}
        ticket={paymentTicket}
        clinicInfo={clinicSettings}
        onPaymentRecorded={(receipt) => {
          void loadQueue();
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

      <ConfirmDialog
        open={Boolean(statusTarget)}
        onOpenChange={(open) => {
          if (!open) setStatusTarget(null);
        }}
        title={statusTarget?.title || ""}
        description={statusTarget?.desc || ""}
        loading={transitioning}
        onConfirm={handleConfirmTransition}
      />
    </div>
  );
}
