"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  KeyRound,
  Pencil,
  Plus,
  Stethoscope,
  Upload,
  UserPlus,
} from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { MediaImage } from "@/components/shared/MediaImage";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
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
import { Input, SelectInput, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { formatUZS } from "@/lib/formatters";
import {
  DAYS_OF_WEEK_UZ,
  DOCTOR_AVAILABILITY_CLASSES,
  DOCTOR_AVAILABILITY_LABELS,
} from "@/lib/uz-labels";
import type { Doctor, DoctorAvailability, Room, Service } from "@/types/database";

interface DoctorAdminRow extends Doctor {
  user_profile?: {
    id: string;
    email: string;
    username: string | null;
    is_active: boolean;
    last_login_at: string | null;
  } | null;
}

interface ScheduleDraft {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  breakStart: string;
  breakEnd: string;
  isWorking: boolean;
}

const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

const DEFAULT_SCHEDULES: ScheduleDraft[] = WEEK_DAYS.map((dayNum) => ({
  dayOfWeek: dayNum,
  startTime: "09:00",
  endTime: dayNum === 6 ? "15:00" : "18:00",
  breakStart: "13:00",
  breakEnd: "14:00",
  isWorking: dayNum !== 7,
}));

export function SuperAdminDoctorsClient() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [doctors, setDoctors] = useState<DoctorAdminRow[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [services, setServices] = useState<Service[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<DoctorAdminRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Form states
  const [fullName, setFullName] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [experienceYears, setExperienceYears] = useState("5");
  const [biography, setBiography] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [roomId, setRoomId] = useState("");
  const [consultationPrice, setConsultationPrice] = useState("150000");
  const [queuePrefix, setQueuePrefix] = useState("");
  const [separateQueue, setSeparateQueue] = useState(false);
  const [availabilityStatus, setAvailabilityStatus] = useState<DoctorAvailability>("available");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [schedules, setSchedules] = useState<ScheduleDraft[]>(DEFAULT_SCHEDULES);

  // Create login option for new doctor
  const [createLogin, setCreateLogin] = useState(true);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountUsername, setAccountUsername] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountPhone, setAccountPhone] = useState("");

  // Account-only / Password-reset modal
  const [accountModalDoctor, setAccountModalDoctor] = useState<DoctorAdminRow | null>(null);
  const [accountModalMode, setAccountModalMode] = useState<"create_account" | "reset_password">(
    "reset_password"
  );
  const [modalEmail, setModalEmail] = useState("");
  const [modalUsername, setModalUsername] = useState("");
  const [modalPassword, setModalPassword] = useState("");

  const loadDoctors = useCallback(async () => {
    try {
      const res = await fetch("/api/super-admin/doctors", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "Shifokorlarni yuklab bo'lmadi" });
        return;
      }
      setDoctors(data.doctors ?? []);
      setRooms(data.rooms ?? []);
      setServices(data.services ?? []);
    } catch {
      toast({ variant: "error", title: "Server bilan aloqada xatolik" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadDoctors();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadDoctors]);

  function openNewDialog() {
    setEditingDoctor(null);
    setFullName("");
    setSpecialization("");
    setExperienceYears("5");
    setBiography("");
    setPhotoUrl("");
    setRoomId(rooms[0]?.id ?? "");
    setConsultationPrice("150000");
    setQueuePrefix("");
    setSeparateQueue(false);
    setAvailabilityStatus("available");
    setSelectedServiceIds([]);
    setSchedules(DEFAULT_SCHEDULES);
    setCreateLogin(true);
    setAccountEmail("");
    setAccountUsername("");
    setAccountPassword("");
    setAccountPhone("");
    setFormOpen(true);
  }

  function openEditDialog(doc: DoctorAdminRow) {
    setEditingDoctor(doc);
    setFullName(doc.full_name);
    setSpecialization(doc.specialization);
    setExperienceYears(String(doc.experience_years));
    setBiography(doc.biography ?? "");
    setPhotoUrl(doc.photo_url ?? "");
    setRoomId(doc.room_id ?? "");
    setConsultationPrice(String(doc.consultation_price));
    setQueuePrefix(doc.queue_prefix ?? "");
    setSeparateQueue(doc.separate_queue);
    setAvailabilityStatus(doc.availability_status);
    setSelectedServiceIds(
      (doc.doctor_services ?? []).filter((ds) => ds.is_active).map((ds) => ds.service_id)
    );
    const mergedSchedules = WEEK_DAYS.map((dayNum) => {
      const existing = (doc.doctor_schedules ?? []).find((s) => s.day_of_week === dayNum);
      return existing
        ? {
            dayOfWeek: dayNum,
            startTime: existing.start_time.slice(0, 5),
            endTime: existing.end_time.slice(0, 5),
            breakStart: existing.break_start?.slice(0, 5) ?? "",
            breakEnd: existing.break_end?.slice(0, 5) ?? "",
            isWorking: existing.is_working,
          }
        : {
            dayOfWeek: dayNum,
            startTime: "09:00",
            endTime: "18:00",
            breakStart: "13:00",
            breakEnd: "14:00",
            isWorking: dayNum !== 7,
          };
    });
    setSchedules(mergedSchedules);
    setFormOpen(true);
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "doctors");
      const res = await fetch("/api/super-admin/settings", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "Rasmni yuklab bo'lmadi" });
        return;
      }
      setPhotoUrl(data.url);
      toast({ variant: "success", title: "Rasm muvaffaqiyatli yuklandi" });
    } catch {
      toast({ variant: "error", title: "Rasm yuklashda xatolik" });
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSaveDoctor(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const formattedSchedules = schedules.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        breakStart: s.breakStart || null,
        breakEnd: s.breakEnd || null,
        isWorking: s.isWorking,
      }));

      if (editingDoctor) {
        const res = await fetch("/api/super-admin/doctors", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update_profile",
            doctorId: editingDoctor.id,
            fullName,
            specialization,
            experienceYears: Number(experienceYears),
            biography: biography || null,
            photoUrl: photoUrl || null,
            roomId: roomId || null,
            consultationPrice: Number(consultationPrice),
            queuePrefix: queuePrefix || null,
            separateQueue,
            availabilityStatus,
            serviceIds: selectedServiceIds,
            schedules: formattedSchedules,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast({ variant: "error", title: data.error || "Saqlab bo'lmadi" });
          return;
        }
        toast({ variant: "success", title: "Shifokor ma'lumotlari yangilandi" });
      } else {
        const res = await fetch("/api/super-admin/doctors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName,
            specialization,
            experienceYears: Number(experienceYears),
            biography: biography || null,
            photoUrl: photoUrl || null,
            roomId: roomId || null,
            consultationPrice: Number(consultationPrice),
            queuePrefix: queuePrefix || null,
            separateQueue,
            availabilityStatus,
            serviceIds: selectedServiceIds,
            schedules: formattedSchedules,
            account: createLogin
              ? {
                  email: accountEmail,
                  username: accountUsername || null,
                  password: accountPassword,
                  phone: accountPhone || null,
                }
              : null,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast({ variant: "error", title: data.error || "Shifokor yaratilmadi" });
          return;
        }
        toast({ variant: "success", title: "Yangi shifokor qo'shildi" });
      }

      setFormOpen(false);
      await loadDoctors();
    } catch {
      toast({ variant: "error", title: "Server bilan aloqada xatolik" });
    } finally {
      setSaving(false);
    }
  }

  async function toggleDoctorActive(doc: DoctorAdminRow) {
    try {
      const res = await fetch("/api/super-admin/doctors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_active",
          doctorId: doc.id,
          isActive: !doc.is_active,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "Holatni o'zgartirib bo'lmadi" });
        return;
      }
      toast({
        variant: "success",
        title: !doc.is_active ? "Shifokor faollashtirildi" : "Shifokor nofaol qilindi",
      });
      await loadDoctors();
    } catch {
      toast({ variant: "error", title: "Server xatosi" });
    }
  }

  async function handleAccountModalSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accountModalDoctor) return;
    setSaving(true);
    try {
      const payload =
        accountModalMode === "reset_password"
          ? {
              action: "reset_password",
              doctorId: accountModalDoctor.id,
              newPassword: modalPassword,
            }
          : {
              action: "create_account",
              doctorId: accountModalDoctor.id,
              email: modalEmail,
              username: modalUsername || null,
              password: modalPassword,
            };

      const res = await fetch("/api/super-admin/doctors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "Amal bajarilmadi" });
        return;
      }
      toast({
        variant: "success",
        title:
          accountModalMode === "reset_password"
            ? "Shifokor paroli yangilandi"
            : "Shifokorga kirish hisobi yaratildi",
      });
      setAccountModalDoctor(null);
      setModalPassword("");
      await loadDoctors();
    } catch {
      toast({ variant: "error", title: "Server xatosi" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <StaffPageHeader
        eyebrow="Tibbiy jamoa"
        title="Shifokorlar boshqaruvi"
        description="Shifokor profillari, xizmat biriktirish, ish jadvali va kirish hisoblari"
        badge={<Badge variant="default" className="tabular-nums">{doctors.length} nafar</Badge>}
        actions={
          <Button onClick={openNewDialog}>
            <Plus className="h-4 w-4" />
            Yangi shifokor
          </Button>
        }
      />

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl bg-slate-200/70" />
          ))}
        </div>
      ) : doctors.length === 0 ? (
        <Card>
          <CardContent className="p-8">
            <EmptyState
              icon={Stethoscope}
              title="Shifokorlar qo'shilmagan"
              description="Birinchi shifokor profilini qo'shish uchun yuqoridagi tugmani bosing."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {doctors.map((doc) => (
            <Card key={doc.id} className={!doc.is_active ? "opacity-75" : ""}>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <MediaImage
                      src={doc.photo_url || "/images/doctor-placeholder-m.jpg"}
                      fallbackSrc="/images/doctor-placeholder-m.jpg"
                      alt={doc.full_name}
                      width={56}
                      height={56}
                      className="h-14 w-14 shrink-0 rounded-2xl border border-slate-100 object-cover object-top"
                    />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900">{doc.full_name}</h3>
                        <Badge variant={doc.is_active ? "success" : "neutral"}>
                          {doc.is_active ? "Faol" : "Nofaol"}
                        </Badge>
                      </div>
                      <p className="text-xs font-medium text-blue-600">{doc.specialization}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {doc.experience_years} yil tajriba •{" "}
                        {doc.room?.room_number ? `${doc.room.room_number}-xona` : "Xona yo'q"}
                      </p>
                    </div>
                  </div>
                  <Badge className={DOCTOR_AVAILABILITY_CLASSES[doc.availability_status]}>
                    {DOCTOR_AVAILABILITY_LABELS[doc.availability_status]}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs">
                  <div>
                    <span className="text-slate-500">Konsultatsiya:</span>{" "}
                    <span className="font-bold text-slate-900">
                      {formatUZS(doc.consultation_price)}
                    </span>
                  </div>
                  <div>
                    {doc.user_profile ? (
                      <span className="font-medium text-emerald-700">
                        Login: {doc.user_profile.username || doc.user_profile.email}
                      </span>
                    ) : (
                      <span className="font-medium text-amber-700">Kirish hisobi yo&apos;q</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {(doc.doctor_services ?? [])
                    .filter((ds) => ds.is_active && ds.service)
                    .map((ds) => (
                      <Badge key={ds.id} variant="neutral" className="text-[11px]">
                        {ds.service?.name}
                      </Badge>
                    ))}
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  <Button size="sm" variant="outline" onClick={() => openEditDialog(doc)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Tahrirlash
                  </Button>

                  {doc.user_id ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAccountModalDoctor(doc);
                        setAccountModalMode("reset_password");
                        setModalPassword("");
                      }}
                    >
                      <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                      Parolni tiklash
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAccountModalDoctor(doc);
                        setAccountModalMode("create_account");
                        setModalEmail("");
                        setModalUsername("");
                        setModalPassword("");
                      }}
                    >
                      <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                      Hisob yaratish
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant={doc.is_active ? "ghost" : "secondary"}
                    onClick={() => toggleDoctorActive(doc)}
                  >
                    {doc.is_active ? "Nofaol qilish" : "Faollashtirish"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Doctor Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingDoctor ? "Shifokorni tahrirlash" : "Yangi shifokor qo'shish"}
            </DialogTitle>
            <DialogDescription>
              Shifokor profili, biriktirilgan xizmatlar va haftalik ish jadvalini kiriting.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveDoctor} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="doc-name">F.I.O. *</Label>
                <Input
                  id="doc-name"
                  className="mt-1"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Dr. Ali Valiyev"
                  required
                />
              </div>
              <div>
                <Label htmlFor="doc-spec">Mutaxassislik *</Label>
                <Input
                  id="doc-spec"
                  className="mt-1"
                  value={specialization}
                  onChange={(e) => setSpecialization(e.target.value)}
                  placeholder="Stomatolog"
                  required
                />
              </div>
              <div>
                <Label htmlFor="doc-exp">Tajriba (yil)</Label>
                <Input
                  id="doc-exp"
                  type="number"
                  min={0}
                  max={70}
                  className="mt-1"
                  value={experienceYears}
                  onChange={(e) => setExperienceYears(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="doc-price">Konsultatsiya narxi (UZS)</Label>
                <Input
                  id="doc-price"
                  type="number"
                  min={0}
                  className="mt-1"
                  value={consultationPrice}
                  onChange={(e) => setConsultationPrice(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="doc-room">Kabinet (Xona)</Label>
                <SelectInput
                  id="doc-room"
                  className="mt-1"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                >
                  <option value="">Tanlanmagan</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.room_number}-xona {r.name ? `(${r.name})` : ""}
                    </option>
                  ))}
                </SelectInput>
              </div>
              <div>
                <Label htmlFor="doc-avail">Holati</Label>
                <SelectInput
                  id="doc-avail"
                  className="mt-1"
                  value={availabilityStatus}
                  onChange={(e) => setAvailabilityStatus(e.target.value as DoctorAvailability)}
                >
                  <option value="available">Bo&apos;sh</option>
                  <option value="busy">Band</option>
                  <option value="break">Tanaffusda</option>
                  <option value="off_duty">Ishdan tashqari</option>
                </SelectInput>
              </div>
              <div>
                <Label htmlFor="doc-prefix">Navbat prefiksi (ixtiyoriy)</Label>
                <Input
                  id="doc-prefix"
                  maxLength={4}
                  className="mt-1"
                  value={queuePrefix}
                  onChange={(e) => setQueuePrefix(e.target.value.toUpperCase())}
                  placeholder="Masalan: S"
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={separateQueue}
                    onChange={(e) => setSeparateQueue(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  />
                  Alohida shaxsiy navbat ketma-ketligi
                </label>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="doc-photo">Rasm manzili (URL) yoki yuklash</Label>
                <Input
                  id="doc-photo"
                  className="mt-1"
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  placeholder="/images/doctor-placeholder-m.svg"
                />
              </div>
              <div className="flex items-end">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                  <Upload className="h-4 w-4" />
                  {uploadingPhoto ? "Yuklanmoqda..." : "Kompyuterdan rasm yuklash"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoUpload}
                    disabled={uploadingPhoto}
                  />
                </label>
              </div>
            </div>

            <div>
              <Label htmlFor="doc-bio">Qisqacha biografiya</Label>
              <Textarea
                id="doc-bio"
                rows={2}
                className="mt-1"
                value={biography}
                onChange={(e) => setBiography(e.target.value)}
              />
            </div>

            <div>
              <Label>Ko&apos;rsatadigan xizmatlari</Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {services.map((srv) => {
                  const checked = selectedServiceIds.includes(srv.id);
                  return (
                    <label
                      key={srv.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 text-xs font-medium ${
                        checked
                          ? "border-blue-500 bg-blue-50/70 text-blue-900"
                          : "border-slate-200 bg-white text-slate-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedServiceIds((prev) =>
                            prev.includes(srv.id)
                              ? prev.filter((id) => id !== srv.id)
                              : [...prev, srv.id]
                          )
                        }
                      />
                      <span className="truncate">{srv.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <Label>Haftalik ish jadvali</Label>
              <div className="mt-2 space-y-2">
                {schedules.map((sch, idx) => {
                  const dayLabel = DAYS_OF_WEEK_UZ[sch.dayOfWeek] ?? "";
                  return (
                    <div
                      key={sch.dayOfWeek}
                      className="grid grid-cols-12 items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs"
                    >
                      <label className="col-span-4 flex items-center gap-2 font-medium text-slate-800 sm:col-span-3">
                        <input
                          type="checkbox"
                          checked={sch.isWorking}
                          onChange={(e) =>
                            setSchedules((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, isWorking: e.target.checked } : item
                              )
                            )
                          }
                        />
                        {dayLabel}
                      </label>
                      <div className="col-span-4 sm:col-span-2">
                        <Input
                          type="time"
                          disabled={!sch.isWorking}
                          value={sch.startTime}
                          onChange={(e) =>
                            setSchedules((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, startTime: e.target.value } : item
                              )
                            )
                          }
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <Input
                          type="time"
                          disabled={!sch.isWorking}
                          value={sch.endTime}
                          onChange={(e) =>
                            setSchedules((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, endTime: e.target.value } : item
                              )
                            )
                          }
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="col-span-6 sm:col-span-2">
                        <Input
                          type="time"
                          disabled={!sch.isWorking}
                          value={sch.breakStart}
                          onChange={(e) =>
                            setSchedules((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, breakStart: e.target.value } : item
                              )
                            )
                          }
                          className="h-8 text-xs"
                          title="Tanaffus boshi"
                        />
                      </div>
                      <div className="col-span-6 sm:col-span-3">
                        <Input
                          type="time"
                          disabled={!sch.isWorking}
                          value={sch.breakEnd}
                          onChange={(e) =>
                            setSchedules((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, breakEnd: e.target.value } : item
                              )
                            )
                          }
                          className="h-8 text-xs"
                          title="Tanaffus tugashi"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {!editingDoctor && (
              <div className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-900">
                  <input
                    type="checkbox"
                    checked={createLogin}
                    onChange={(e) => setCreateLogin(e.target.checked)}
                  />
                  Shifokor paneliga kirish hisobini yaratish
                </label>
                {createLogin && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Email *</Label>
                      <Input
                        type="email"
                        value={accountEmail}
                        onChange={(e) => setAccountEmail(e.target.value)}
                        required={createLogin}
                      />
                    </div>
                    <div>
                      <Label>Username (Login)</Label>
                      <Input
                        value={accountUsername}
                        onChange={(e) => setAccountUsername(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Telefon</Label>
                      <Input
                        value={accountPhone}
                        onChange={(e) => setAccountPhone(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Vaqtinchalik parol (min 8 belgi) *</Label>
                      <Input
                        type="password"
                        minLength={8}
                        value={accountPassword}
                        onChange={(e) => setAccountPassword(e.target.value)}
                        required={createLogin}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saqlanmoqda..." : "Saqlash"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Account Create / Password Reset Dialog */}
      <Dialog
        open={Boolean(accountModalDoctor)}
        onOpenChange={(open) => {
          if (!open) setAccountModalDoctor(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {accountModalMode === "reset_password"
                ? "Shifokor parolini tiklash"
                : "Shifokor hisobini yaratish"}
            </DialogTitle>
            <DialogDescription>{accountModalDoctor?.full_name}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAccountModalSubmit} className="space-y-4">
            {accountModalMode === "create_account" && (
              <>
                <div>
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={modalEmail}
                    onChange={(e) => setModalEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label>Username</Label>
                  <Input
                    value={modalUsername}
                    onChange={(e) => setModalUsername(e.target.value)}
                  />
                </div>
              </>
            )}
            <div>
              <Label>Yangi parol (kamida 8 belgi) *</Label>
              <Input
                type="password"
                minLength={8}
                value={modalPassword}
                onChange={(e) => setModalPassword(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAccountModalDoctor(null)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saqlanmoqda..." : "Tasdiqlash"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
