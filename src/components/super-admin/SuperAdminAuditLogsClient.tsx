"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, ScrollText, Search } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, SelectInput } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatDateTimeUZ } from "@/lib/formatters";
import type { AuditLog } from "@/types/database";

const ENTITY_FILTER_OPTIONS = [
  { value: "all", label: "Barcha bo'limlar" },
  { value: "queue_ticket", label: "Navbatlar" },
  { value: "payment", label: "To'lovlar" },
  { value: "refund", label: "Qaytarishlar" },
  { value: "doctor", label: "Shifokorlar" },
  { value: "service", label: "Xizmatlar" },
  { value: "promotion", label: "Chegirmalar" },
  { value: "expense", label: "Xarajatlar" },
  { value: "commission_rule", label: "Komissiya qoidalari" },
  { value: "clinic_settings", label: "Klinika sozlamalari" },
  { value: "user_profile", label: "Xodim hisoblari" },
];

export function SuperAdminAuditLogsClient() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [entityType, setEntityType] = useState("all");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const pageSize = 25;

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/super-admin/audit-logs?q=${encodeURIComponent(q)}&entityType=${encodeURIComponent(entityType)}&page=${page}&pageSize=${pageSize}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "Jurnalni yuklab bo'lmadi" });
        return;
      }
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
    } catch {
      toast({ variant: "error", title: "Server bilan aloqada xatolik" });
    } finally {
      setLoading(false);
    }
  }, [q, entityType, page, toast]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadLogs();
    }, 200);
    return () => clearTimeout(t);
  }, [loadLogs]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <StaffPageHeader
        eyebrow="Xavfsizlik va nazorat"
        title="Audit jurnali"
        description="Tizimdagi barcha muhim o'zgarishlarning o'zgarmas (immutable) tarixi"
        badge={<Badge variant="neutral" className="tabular-nums">{total} ta yozuv</Badge>}
        actions={
          <>
            <div className="relative w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={q}
                onChange={(e) => {
                  setPage(1);
                  setQ(e.target.value);
                }}
                placeholder="Xodim, amal yoki matn..."
                className="bg-white pl-9"
              />
            </div>
            <SelectInput
              value={entityType}
              onChange={(e) => {
                setPage(1);
                setEntityType(e.target.value);
              }}
              className="w-48 bg-white"
            >
              {ENTITY_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </SelectInput>
          </>
        }
      />

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={6} columns={5} />
          ) : logs.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={ScrollText}
                title="Audit yozuvlari topilmadi"
                description="Qidiruv shartlarini o'zgartirib ko'ring."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-[#F8FAFC] text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">
                    <th className="px-4 py-3.5">Vaqt</th>
                    <th className="px-4 py-3.5">Ijrochi</th>
                    <th className="px-4 py-3.5">Bo&apos;lim / Amal</th>
                    <th className="px-4 py-3.5">Tafsilot</th>
                    <th className="px-4 py-3.5 text-right">Batafsil</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {formatDateTimeUZ(log.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">
                          {log.actor_name || "Tizim / Bemor"}
                        </p>
                        <p className="text-[11px] text-slate-500">{log.actor_role || "public"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="neutral" className="font-mono text-[11px]">
                          {log.action}
                        </Badge>
                      </td>
                      <td className="max-w-md px-4 py-3 text-xs text-slate-700">
                        {log.summary}
                        {log.reason && (
                          <p className="mt-0.5 text-[11px] text-amber-700">Sabab: {log.reason}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => setSelectedLog(log)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {total > pageSize && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
              <span>
                Jami {total} yozuv • Sahifa {page} / {totalPages}
              </span>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selectedLog)}
        onOpenChange={(open) => {
          if (!open) setSelectedLog(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Audit yozuvi tafsilotlari</DialogTitle>
            <DialogDescription>
              {selectedLog?.action} • {selectedLog ? formatDateTimeUZ(selectedLog.created_at) : ""}
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4 text-xs">
              <div className="rounded-xl bg-slate-50 p-3 text-slate-800">
                <p className="font-semibold">{selectedLog.summary}</p>
                {selectedLog.reason && (
                  <p className="mt-1 text-amber-800">Sabab: {selectedLog.reason}</p>
                )}
              </div>
              {selectedLog.previous_values && (
                <div>
                  <p className="mb-1 font-semibold text-slate-600">Avvalgi qiymatlar:</p>
                  <pre className="max-h-40 overflow-auto rounded-xl bg-slate-900 p-3 text-[11px] text-slate-100">
                    {JSON.stringify(selectedLog.previous_values, null, 2)}
                  </pre>
                </div>
              )}
              {selectedLog.new_values && (
                <div>
                  <p className="mb-1 font-semibold text-slate-600">Yangi qiymatlar:</p>
                  <pre className="max-h-40 overflow-auto rounded-xl bg-slate-900 p-3 text-[11px] text-slate-100">
                    {JSON.stringify(selectedLog.new_values, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
