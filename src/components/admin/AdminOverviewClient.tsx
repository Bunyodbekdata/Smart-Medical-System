"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  CreditCard,
  Link2,
  Plus,
  RefreshCw,
  Search,
  UserCheck,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import { QuickPaymentModal } from "./QuickPaymentModal";
import { WalkInRegisterModal } from "./WalkInRegisterModal";
import { EmptyState } from "@/components/shared/EmptyState";
import { ReceiptModal, type ReceiptData } from "@/components/shared/ReceiptModal";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { StaffStatCard } from "@/components/shared/StaffStatCard";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatTimeHHMM, formatUZS, getTashkentDateString } from "@/lib/formatters";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  PAYMENT_STATUS_BADGE_CLASSES,
  PAYMENT_STATUS_LABELS,
  QUEUE_STATUS_BADGE_CLASSES,
  QUEUE_STATUS_LABELS,
} from "@/lib/uz-labels";
import type { Doctor, Promotion, QueueTicket, Service } from "@/types/database";

interface AdminOverviewClientProps {
  clinicId: string;
}

type TabKey = "all" | "kutilmoqda" | "qabulda" | "yakunlandi";

export function AdminOverviewClient({ clinicId }: AdminOverviewClientProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<QueueTicket[]>([]);
  const [counts, setCounts] = useState({
    all: 0,
    kutilmoqda: 0,
    chaqirildi: 0,
    qabulda: 0,
    yakunlandi: 0,
  });
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [unpaidTotal, setUnpaidTotal] = useState(0);

  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");

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
  const [cancelTarget, setCancelTarget] = useState<QueueTicket | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    const today = getTashkentDateString();
    try {
      const [queueRes, reportRes] = await Promise.all([
        fetch(`/api/admin/queue?date=${today}`, { cache: "no-store" }),
        fetch(`/api/admin/reports?date=${today}`, { cache: "no-store" }),
      ]);

      if (queueRes.ok) {
        const qData = await queueRes.json();
        setTickets(qData.tickets ?? []);
        setCounts(qData.counts ?? { all: 0, kutilmoqda: 0, chaqirildi: 0, qabulda: 0, yakunlandi: 0 });
      }
      if (reportRes.ok) {
        const rData = await reportRes.json();
        setTodayRevenue(Number(rData.summary?.netCollected ?? 0));
        setUnpaidTotal(Number(rData.summary?.unpaidBalance ?? 0));
      }
    } catch {
      toast({
        variant: "error",
        title: "Ma'lumotlarni yuklashda xatolik",
        description: "Sahifani yangilab ko'ring.",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  const loadCatalog = useCallback(async () => {
    try {
      const res = await fetch("/api/staff/catalog", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setServices(data.services ?? []);
        setDoctors(data.doctors ?? []);
        setPromotions(data.promotions ?? []);
        setClinicSettings(data.clinicSettings ?? null);
      }
    } catch {
      // Ignore secondary catalog errors
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadData();
      void loadCatalog();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadData, loadCatalog]);

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") void loadData();
    };
    window.addEventListener("focus", onFocus);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadData();
    }, 20_000);

    const supabase = createBrowserSupabaseClient();
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;
    if (supabase) {
      channel = supabase
        .channel(`admin-overview-${clinicId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "queue_tickets",
            filter: `clinic_id=eq.${clinicId}`,
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
            filter: `clinic_id=eq.${clinicId}`,
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
  }, [clinicId, loadData]);

  async function handleCopyTrackingLink(ticket: QueueTicket) {
    try {
      const url = `${window.location.origin}/queue/${ticket.tracking_token}`;
      await navigator.clipboard.writeText(url);
      toast({
        variant: "info",
        title: `${ticket.ticket_number} kuzatuv havolasi nusxalandi`,
        description: "Bemorga Telegram yoki SMS orqali yuborishingiz mumkin.",
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
      toast({
        variant: "success",
        title: `Bemor kelishi tasdiqlandi (${ticket.ticket_number})`,
      });
      void loadData();
    } else {
      const err = await res.json();
      toast({ variant: "error", title: err.error || "Xatolik" });
    }
  }

  async function handleCancelTicket() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const res = await fetch("/api/admin/queue", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "transition_status",
          ticketId: cancelTarget.id,
          status: "bekor_qilindi",
          reason: "Administrator tomonidan bekor qilindi",
        }),
      });
      if (res.ok) {
        toast({
          variant: "info",
          title: `Chipta bekor qilindi (${cancelTarget.ticket_number})`,
        });
        setCancelTarget(null);
        void loadData();
      } else {
        const err = await res.json();
        toast({ variant: "error", title: err.error || "Bekor qilib bo'lmadi" });
      }
    } finally {
      setCancelling(false);
    }
  }

  const visibleTickets = tickets.filter((t) => {
    if (tab === "kutilmoqda") {
      if (t.status !== "kutilmoqda" && t.status !== "chaqirildi") return false;
    } else if (tab !== "all" && t.status !== tab) {
      return false;
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        t.ticket_number.toLowerCase().includes(q) ||
        (t.patient?.full_name?.toLowerCase().includes(q) ?? false) ||
        (t.patient?.phone?.toLowerCase().includes(q) ?? false) ||
        (t.doctor?.full_name?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <StaffPageHeader
        eyebrow="Qabulxona boshqaruvi"
        title="Bemorlar va bugungi navbat"
        description="Jonli navbat oqimi, tezkor ro'yxatga olish va kunlik kassa nazorati"
        actions={
          <>
            <div className="relative w-64">
              <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Raqam, ism yoki telefon..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => void loadData(true)}
              disabled={refreshing}
              title="Yangilash"
              aria-label="Ro'yxatni yangilash"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
            <Button onClick={() => setWalkInOpen(true)}>
              <Plus className="h-4 w-4" />
              Yangi bemor
            </Button>
          </>
        }
      />

      {/* Executive KPI Summary Strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StaffStatCard
          label="Bugungi bemorlar"
          value={counts.all}
          hint="Jami ro'yxatga olingan"
          icon={Users}
          tone="sapphire"
        />
        <StaffStatCard
          label="Navbatda"
          value={counts.kutilmoqda + counts.chaqirildi}
          hint="Kutilayotgan va chaqirilgan"
          icon={Clock}
          tone="amber"
        />
        <StaffStatCard
          label="Qabulda / Yakunlangan"
          value={`${counts.qabulda} / ${counts.yakunlandi}`}
          hint="Faol qabulda va tugallangan"
          icon={CheckCircle2}
          tone="teal"
        />
        <StaffStatCard
          label="Bugungi sof tushum"
          value={formatUZS(todayRevenue)}
          hint="Tasdiqlangan kassa tushumi"
          icon={Wallet}
          tone="featured"
        />
        <StaffStatCard
          label="To'lanmagan qarz"
          value={formatUZS(unpaidTotal)}
          hint="Kassada to'lov kutilmoqda"
          icon={CreditCard}
          tone="rose"
        />
        <StaffStatCard
          label="Qabulda (hozir)"
          value={counts.qabulda}
          hint="Shifokor ko'rigida"
          icon={UserCheck}
          tone="sapphire"
        />
      </div>

      {/* Main Tabbed Queue Table */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
          <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-slate-200/80 bg-white p-1 shadow-[0_1px_2px_rgba(10,22,40,0.02)]">
            {(
              [
                { key: "all", label: `Bugungi (${counts.all})` },
                { key: "kutilmoqda", label: `Navbatda (${counts.kutilmoqda + counts.chaqirildi})` },
                { key: "qabulda", label: `Qabulda (${counts.qabulda})` },
                { key: "yakunlandi", label: `Yakunlangan (${counts.yakunlandi})` },
              ] as Array<{ key: TabKey; label: string }>
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all tabular-nums ${
                  tab === item.key
                    ? "bg-[#0A1628] text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-[#0A1628]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <span className="text-xs font-medium text-slate-500 tabular-nums">
            Ko&apos;rsatilmoqda: <strong className="text-[#0A1628]">{visibleTickets.length}</strong> ta
          </span>
        </div>

        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={5} columns={7} />
          ) : visibleTickets.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="Bugun uchun mos navbat yozuvlari topilmadi"
                description="Yangi bemor qo'shish uchun yuqoridagi '+ Yangi bemor' tugmasini bosing."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-[#F8FAFC] text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">
                    <th className="px-5 py-3.5">Chipta</th>
                    <th className="px-4 py-3.5">Bemor</th>
                    <th className="px-4 py-3.5">Shifokor</th>
                    <th className="px-4 py-3.5">Xizmat</th>
                    <th className="px-4 py-3.5">To&apos;lov</th>
                    <th className="px-4 py-3.5">Holat</th>
                    <th className="px-5 py-3.5 text-right">Amallar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleTickets.map((ticket) => {
                    const remaining = Math.max(
                      0,
                      Number(ticket.total_due) - Number(ticket.paid_amount)
                    );
                    const canCancel =
                      ticket.status === "kutilmoqda" || ticket.status === "chaqirildi";

                    return (
                      <tr key={ticket.id} className="hover:bg-slate-50/70">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-slate-900">
                              {ticket.ticket_number}
                            </span>
                            {ticket.priority_level > 0 ? (
                              <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                                Ustuvor
                              </span>
                            ) : null}
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {formatTimeHHMM(ticket.created_at)} •{" "}
                            {ticket.source === "online" ? "Onlayn" : "Klinika"}
                          </span>
                        </td>

                        <td className="px-4 py-3.5">
                          <p className="font-bold text-slate-900">
                            {ticket.patient?.full_name}
                          </p>
                          <p className="text-xs text-slate-500">{ticket.patient?.phone}</p>
                        </td>

                        <td className="px-4 py-3.5 text-slate-700">
                          <p className="font-medium">{ticket.doctor?.full_name}</p>
                          <p className="text-[11px] text-slate-400">
                            {ticket.room?.room_number ? `${ticket.room.room_number}-xona` : "—"}
                          </p>
                        </td>

                        <td className="px-4 py-3.5">
                          <p className="font-medium text-slate-800">{ticket.service?.name}</p>
                          <p className="text-xs text-slate-500">
                            {formatUZS(ticket.total_due)}
                          </p>
                        </td>

                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                              PAYMENT_STATUS_BADGE_CLASSES[ticket.payment_status]
                            }`}
                          >
                            {ticket.payment_status === "paid" ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : ticket.payment_status === "unpaid" ? (
                              <XCircle className="h-3.5 w-3.5" />
                            ) : null}
                            {PAYMENT_STATUS_LABELS[ticket.payment_status]}
                          </span>
                        </td>

                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                              QUEUE_STATUS_BADGE_CLASSES[ticket.status]
                            }`}
                          >
                            {QUEUE_STATUS_LABELS[ticket.status]}
                          </span>
                        </td>

                        <td className="px-5 py-3.5 text-right">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {!ticket.arrival_confirmed &&
                            ticket.status !== "bekor_qilindi" &&
                            ticket.status !== "yakunlandi" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleConfirmArrival(ticket)}
                              >
                                Keldi
                              </Button>
                            ) : null}

                            {remaining > 0 && ticket.status !== "bekor_qilindi" ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setPaymentTicket(ticket)}
                              >
                                To&apos;lov
                              </Button>
                            ) : null}

                            {ticket.status !== "bekor_qilindi" ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Kuzatuv havolasini nusxalash"
                                aria-label="Kuzatuv havolasini nusxalash"
                                onClick={() => void handleCopyTrackingLink(ticket)}
                              >
                                <Link2 className="h-3.5 w-3.5 text-slate-500" />
                              </Button>
                            ) : null}

                            {canCancel ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                onClick={() => setCancelTarget(ticket)}
                              >
                                Bekor
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

      <WalkInRegisterModal
        open={walkInOpen}
        onOpenChange={setWalkInOpen}
        services={services}
        doctors={doctors}
        promotions={promotions}
        onRegistered={() => void loadData()}
      />

      <QuickPaymentModal
        open={Boolean(paymentTicket)}
        onOpenChange={(open) => {
          if (!open) setPaymentTicket(null);
        }}
        ticket={paymentTicket}
        clinicInfo={clinicSettings}
        onPaymentRecorded={(receipt) => {
          void loadData();
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
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        title="Navbat chiptasini bekor qilish"
        description={`${cancelTarget?.ticket_number} (${cancelTarget?.patient?.full_name}) chiptasini bekor qilmoqchimisiz?`}
        confirmLabel="Ha, bekor qilish"
        loading={cancelling}
        onConfirm={handleCancelTicket}
      />
    </div>
  );
}
