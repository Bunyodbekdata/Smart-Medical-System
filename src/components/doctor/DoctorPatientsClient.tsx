"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CalendarDays, FileText, Search, Users } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatDateDDMMYYYY, formatTimeHHMM, formatUZS } from "@/lib/formatters";
import {
  PAYMENT_STATUS_BADGE_CLASSES,
  PAYMENT_STATUS_LABELS,
  QUEUE_STATUS_BADGE_CLASSES,
  QUEUE_STATUS_LABELS,
} from "@/lib/uz-labels";

interface ConsultationRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  visit_notes: string | null;
  patient?: {
    id: string;
    full_name: string;
    phone: string;
    birth_date: string | null;
  } | null;
  service?: {
    id: string;
    name: string;
  } | null;
  ticket?: {
    id: string;
    ticket_number: string;
    queue_date: string;
    total_due: number;
    paid_amount: number;
    payment_status: keyof typeof PAYMENT_STATUS_LABELS;
    status: keyof typeof QUEUE_STATUS_LABELS;
  } | null;
}

export function DoctorPatientsClient() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ConsultationRow[]>([]);

  const loadHistory = useCallback(
    async (searchText: string) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/doctor/history?q=${encodeURIComponent(searchText)}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (!res.ok) {
          toast({ variant: "error", title: data.error || "Tarixni yuklab bo'lmadi" });
          return;
        }
        setRows(data.consultations ?? []);
      } catch {
        toast({ variant: "error", title: "Ma'lumotlarni yuklashda xatolik" });
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadHistory(query);
    }, 220);
    return () => clearTimeout(timer);
  }, [query, loadHistory]);

  return (
    <div className="space-y-6">
      <StaffPageHeader
        eyebrow="Shifokor arxivi"
        title="Mening bemorlarim"
        description="Siz qabul qilgan bemorlar, tashriflar va klinik qaydlar tarixi"
        actions={
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="F.I.O., telefon yoki talon №..."
              className="bg-white pl-9"
            />
          </div>
        }
      />

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={5} columns={7} />
          ) : rows.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={Users}
                title="Qabullar tarixi topilmadi"
                description="Siz yakunlagan yoki boshlagan barcha bemor qabullari shu yerda ko'rinadi."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-[#F8FAFC] text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">
                    <th className="px-4 py-3.5">Talon</th>
                    <th className="px-4 py-3.5">Bemor</th>
                    <th className="px-4 py-3.5">Xizmat</th>
                    <th className="px-4 py-3.5">Sana va vaqt</th>
                    <th className="px-4 py-3.5">To&apos;lov</th>
                    <th className="px-4 py-3.5">Holat</th>
                    <th className="px-4 py-3.5">Qabul qaydi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3.5 font-bold text-slate-900">
                        {item.ticket?.ticket_number || "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900">
                          {item.patient?.full_name || "Bemor"}
                        </div>
                        <div className="text-xs text-slate-500">{item.patient?.phone || "—"}</div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-700">{item.service?.name || "—"}</td>
                      <td className="px-4 py-3.5 text-xs text-slate-600">
                        <div className="flex items-center gap-1.5 font-medium text-slate-800">
                          <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                          {formatDateDDMMYYYY(item.started_at)}
                        </div>
                        <div className="mt-0.5 text-slate-400 tabular-nums">
                          {formatTimeHHMM(item.started_at)}
                          {item.ended_at ? ` – ${formatTimeHHMM(item.ended_at)}` : ""}
                          {item.duration_seconds !== null && item.duration_seconds !== undefined
                            ? ` (${Math.max(1, Math.round(item.duration_seconds / 60))} daq)`
                            : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {item.ticket ? (
                          <div className="space-y-1">
                            <Badge
                              className={PAYMENT_STATUS_BADGE_CLASSES[item.ticket.payment_status]}
                            >
                              {PAYMENT_STATUS_LABELS[item.ticket.payment_status]}
                            </Badge>
                            <div className="text-xs text-slate-500">
                              {formatUZS(item.ticket.paid_amount)}
                            </div>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {item.ticket ? (
                          <Badge className={QUEUE_STATUS_BADGE_CLASSES[item.ticket.status]}>
                            {QUEUE_STATUS_LABELS[item.ticket.status]}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="max-w-xs px-4 py-3.5 text-xs text-slate-600">
                        {item.visit_notes ? (
                          <div className="flex items-start gap-1.5">
                            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                            <span>{item.visit_notes}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">Qayd kiritilmagan</span>
                        )}
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
  );
}
