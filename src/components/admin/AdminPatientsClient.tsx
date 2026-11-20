"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Plus, Search, Users } from "lucide-react";
import { WalkInRegisterModal } from "./WalkInRegisterModal";
import { EmptyState } from "@/components/shared/EmptyState";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatDateDDMMYYYY, formatUZS } from "@/lib/formatters";
import type { Doctor, Patient, Promotion, Service } from "@/types/database";

interface EnrichedPatient extends Patient {
  summary: {
    visitCount: number;
    doctors: string[];
    services: string[];
    totalPaid: number;
    lastVisitAt: string | null;
  };
}

export function AdminPatientsClient() {
  const { toast } = useToast();
  const [patients, setPatients] = useState<EnrichedPatient[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const [services, setServices] = useState<Service[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [walkInOpen, setWalkInOpen] = useState(false);

  const loadPatients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/patients?q=${encodeURIComponent(query.trim())}&page=${page}&pageSize=15`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json();
        setPatients(data.patients ?? []);
        setTotal(data.total ?? 0);
      }
    } catch {
      toast({ variant: "error", title: "Bemorlar bazasini yuklashda xatolik" });
    } finally {
      setLoading(false);
    }
  }, [query, page, toast]);

  useEffect(() => {
    const t = setTimeout(() => void loadPatients(), 200);
    return () => clearTimeout(t);
  }, [loadPatients]);

  useEffect(() => {
    fetch("/api/staff/catalog", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setServices(d.services ?? []);
          setDoctors(d.doctors ?? []);
          setPromotions(d.promotions ?? []);
        }
      })
      .catch(() => {});
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / 15));

  return (
    <div className="space-y-6">
      <StaffPageHeader
        eyebrow="Elektron karta"
        title="Bemorlar bazasi"
        description="Telefon raqami yoki F.I.Sh. bo'yicha qidirish va tashriflar tarixi"
        badge={<Badge variant="default" className="tabular-nums">{total} ta bemor</Badge>}
        actions={
          <>
            <div className="relative w-72">
              <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Ism yoki telefon raqami..."
                className="pl-9"
                value={query}
                onChange={(e) => {
                  setPage(1);
                  setQuery(e.target.value);
                }}
              />
            </div>
            <Button onClick={() => setWalkInOpen(true)}>
              <Plus className="h-4 w-4" />
              Bemor va navbat qo&apos;shish
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={6} columns={6} />
          ) : patients.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Users}
                title="Bemorlar topilmadi"
                description="Qidiruv so'zini o'zgartiring yoki yangi bemorni ro'yxatdan o'tkazing."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-[#F8FAFC] text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">
                    <th className="px-5 py-3.5">Bemor F.I.Sh.</th>
                    <th className="px-4 py-3.5">Telefon raqami</th>
                    <th className="px-4 py-3.5">Ro&apos;yxat sanasi</th>
                    <th className="px-4 py-3.5">Tashriflar</th>
                    <th className="px-4 py-3.5">Shifokorlar / Xizmatlar</th>
                    <th className="px-5 py-3.5 text-right">Jami to&apos;lov</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {patients.map((patient) => (
                    <tr key={patient.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3.5 font-bold text-slate-900">
                        {patient.full_name}
                      </td>
                      <td className="px-4 py-3.5 font-medium text-slate-700">
                        {patient.phone}
                      </td>
                      <td className="px-4 py-3.5 text-slate-500">
                        {formatDateDDMMYYYY(patient.created_at)}
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge variant="default">{patient.summary.visitCount} marta</Badge>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {patient.summary.doctors.slice(0, 2).map((d) => (
                            <span
                              key={d}
                              className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700"
                            >
                              {d}
                            </span>
                          ))}
                          {patient.summary.services.slice(0, 2).map((s) => (
                            <span
                              key={s}
                              className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                            >
                              {s}
                            </span>
                          ))}
                          {patient.summary.doctors.length === 0 &&
                          patient.summary.services.length === 0 ? (
                            <span className="text-xs text-slate-400">Hali tashrif yo&apos;q</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right font-bold text-slate-900">
                        {formatUZS(patient.summary.totalPaid)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-600">
              <span>
                Sahifa {page} / {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Oldingi
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Keyingi
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <WalkInRegisterModal
        open={walkInOpen}
        onOpenChange={setWalkInOpen}
        services={services}
        doctors={doctors}
        promotions={promotions}
        onRegistered={() => void loadPatients()}
      />
    </div>
  );
}
