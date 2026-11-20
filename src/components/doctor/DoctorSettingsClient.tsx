"use client";

import React, { useState } from "react";
import { CalendarClock, DoorOpen, Stethoscope } from "lucide-react";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { StaffPasswordCard } from "@/components/shared/StaffPasswordCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { formatUZS } from "@/lib/formatters";
import {
  DAYS_OF_WEEK_UZ,
  DOCTOR_AVAILABILITY_CLASSES,
  DOCTOR_AVAILABILITY_LABELS,
} from "@/lib/uz-labels";
import type { Doctor, DoctorAvailability, DoctorSchedule, UserProfile } from "@/types/database";

interface DoctorSettingsClientProps {
  profile: UserProfile;
  initialDoctor: Doctor;
  schedules: DoctorSchedule[];
}

const AVAILABILITY_OPTIONS: DoctorAvailability[] = [
  "available",
  "busy",
  "break",
  "off_duty",
];

export function DoctorSettingsClient({
  profile,
  initialDoctor,
  schedules,
}: DoctorSettingsClientProps) {
  const { toast } = useToast();
  const [availability, setAvailability] = useState<DoctorAvailability>(
    initialDoctor.availability_status
  );
  const [savingStatus, setSavingStatus] = useState(false);

  async function updateAvailability(nextStatus: DoctorAvailability) {
    setSavingStatus(true);
    try {
      const res = await fetch("/api/doctor/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_availability",
          availabilityStatus: nextStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "Holatni yangilab bo'lmadi" });
        return;
      }
      setAvailability(nextStatus);
      toast({
        variant: "success",
        title: `Qabul holati yangilandi: ${DOCTOR_AVAILABILITY_LABELS[nextStatus]}`,
      });
    } catch {
      toast({ variant: "error", title: "Server bilan aloqada xatolik" });
    } finally {
      setSavingStatus(false);
    }
  }

  return (
    <div className="space-y-6">
      <StaffPageHeader
        eyebrow="Shaxsiy kabinet"
        title="Shifokor sozlamalari"
        description="Ish jadvali, joriy qabul holati va hisob xavfsizligi"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EDF4FA] text-[#0B4F8A] ring-1 ring-[#D4E4F4]">
                <Stethoscope className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Shifokor profili va holati</CardTitle>
                <CardDescription>
                  Hozirgi holatingiz onlayn navbat olish oynasida ham aks etadi
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-100 bg-slate-50/70 p-4 text-sm">
              <div>
                <p className="text-xs text-slate-500">F.I.O.</p>
                <p className="mt-1 font-semibold text-slate-900">{initialDoctor.full_name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Mutaxassislik</p>
                <p className="mt-1 font-medium text-slate-800">{initialDoctor.specialization}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Xona</p>
                <p className="mt-1 flex items-center gap-1.5 font-medium text-slate-800">
                  <DoorOpen className="h-4 w-4 text-blue-600" />
                  {initialDoctor.room?.room_number
                    ? `${initialDoctor.room.room_number}-xona`
                    : "Biriktirilmagan"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Konsultatsiya narxi</p>
                <p className="mt-1 font-semibold text-slate-900">
                  {formatUZS(initialDoctor.consultation_price)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Login (Username)</p>
                <p className="mt-1 font-medium text-slate-800">{profile.username || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Joriy holat</p>
                <div className="mt-1">
                  <Badge className={DOCTOR_AVAILABILITY_CLASSES[availability]}>
                    {DOCTOR_AVAILABILITY_LABELS[availability]}
                  </Badge>
                </div>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-slate-600">Qabul holatini o&apos;zgartirish</p>
              <div className="grid grid-cols-2 gap-2">
                {AVAILABILITY_OPTIONS.map((opt) => (
                  <Button
                    key={opt}
                    type="button"
                    size="sm"
                    variant={availability === opt ? "default" : "outline"}
                    disabled={savingStatus}
                    onClick={() => updateAvailability(opt)}
                  >
                    {DOCTOR_AVAILABILITY_LABELS[opt]}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-5 w-5 text-blue-600" />
              Haftalik ish jadvali
            </CardTitle>
            <CardDescription>
              Ish kunlari va qabul soatlari Super Admin tomonidan boshqariladi
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {[1, 2, 3, 4, 5, 6, 7].map((dayNum) => {
              const found = schedules.find((s) => s.day_of_week === dayNum);
              return (
                <div
                  key={dayNum}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 text-sm"
                >
                  <span className="font-medium text-slate-800">{DAYS_OF_WEEK_UZ[dayNum]}</span>
                  {found && found.is_working ? (
                    <span className="font-semibold text-slate-900">
                      {found.start_time.slice(0, 5)} – {found.end_time.slice(0, 5)}
                      {found.break_start && found.break_end
                        ? ` (tanaffus ${found.break_start.slice(0, 5)}–${found.break_end.slice(0, 5)})`
                        : ""}
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-slate-400">Dam olish kuni</span>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <StaffPasswordCard />
    </div>
  );
}
