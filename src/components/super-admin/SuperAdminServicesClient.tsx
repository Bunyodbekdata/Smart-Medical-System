"use client";

import React, { useCallback, useEffect, useState } from "react";
import { BriefcaseMedical, DoorOpen, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { Badge } from "@/components/ui/badge";
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
import { Input, SelectInput, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { formatUZS } from "@/lib/formatters";
import { SERVICE_ICON_OPTIONS } from "@/lib/service-icons";
import type { Room, Service } from "@/types/database";

export function SuperAdminServicesClient() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"services" | "rooms">("services");
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<Service[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  // Service Dialog
  const [srvOpen, setSrvOpen] = useState(false);
  const [editingSrv, setEditingSrv] = useState<Service | null>(null);
  const [srvName, setSrvName] = useState("");
  const [srvCat, setSrvCat] = useState("Umumiy");
  const [srvDesc, setSrvDesc] = useState("");
  const [srvIcon, setSrvIcon] = useState("Stethoscope");
  const [srvImageUrl, setSrvImageUrl] = useState("");
  const [srvPrice, setSrvPrice] = useState("100000");
  const [srvDuration, setSrvDuration] = useState("30");
  const [srvPrefix, setSrvPrefix] = useState("A");
  const [srvSort, setSrvSort] = useState("0");
  const [srvActive, setSrvActive] = useState(true);

  // Room Dialog
  const [roomOpen, setRoomOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [roomNumber, setRoomNumber] = useState("");
  const [roomName, setRoomName] = useState("");
  const [roomFloor, setRoomFloor] = useState("1-qavat");
  const [roomActive, setRoomActive] = useState(true);

  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "service" | "room"; id: string; label: string } | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [srvRes, rmRes] = await Promise.all([
        fetch("/api/super-admin/services", { cache: "no-store" }),
        fetch("/api/super-admin/rooms", { cache: "no-store" }),
      ]);
      if (srvRes.ok) {
        const sData = await srvRes.json();
        setServices(sData.services ?? []);
      }
      if (rmRes.ok) {
        const rData = await rmRes.json();
        setRooms(rData.rooms ?? []);
      }
    } catch {
      toast({ variant: "error", title: "Ma'lumotlarni yuklashda xatolik" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadAll();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadAll]);

  function openNewService() {
    setEditingSrv(null);
    setSrvName("");
    setSrvCat("Terapiya");
    setSrvDesc("");
    setSrvIcon("Stethoscope");
    setSrvImageUrl("");
    setSrvPrice("150000");
    setSrvDuration("30");
    setSrvPrefix("A");
    setSrvSort("0");
    setSrvActive(true);
    setSrvOpen(true);
  }

  function openEditService(srv: Service) {
    setEditingSrv(srv);
    setSrvName(srv.name);
    setSrvCat(srv.category);
    setSrvDesc(srv.description ?? "");
    setSrvIcon(srv.icon_name || "Stethoscope");
    setSrvImageUrl(srv.image_url ?? "");
    setSrvPrice(String(srv.price));
    setSrvDuration(String(srv.duration_minutes));
    setSrvPrefix(srv.queue_prefix || "A");
    setSrvSort(String(srv.sort_order));
    setSrvActive(srv.is_active);
    setSrvOpen(true);
  }

  async function handleSaveService(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...(editingSrv ? { id: editingSrv.id } : {}),
        name: srvName,
        category: srvCat,
        description: srvDesc || null,
        iconName: srvIcon,
        imageUrl: srvImageUrl.trim() || null,
        price: Number(srvPrice),
        durationMinutes: Number(srvDuration),
        queuePrefix: srvPrefix,
        sortOrder: Number(srvSort),
        isActive: srvActive,
      };

      const res = await fetch("/api/super-admin/services", {
        method: editingSrv ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "Xizmat saqlanmadi" });
        return;
      }
      toast({ variant: "success", title: editingSrv ? "Xizmat yangilandi" : "Xizmat qo'shildi" });
      setSrvOpen(false);
      await loadAll();
    } catch {
      toast({ variant: "error", title: "Server xatosi" });
    } finally {
      setSaving(false);
    }
  }

  function openNewRoom() {
    setEditingRoom(null);
    setRoomNumber("");
    setRoomName("");
    setRoomFloor("1-qavat");
    setRoomActive(true);
    setRoomOpen(true);
  }

  function openEditRoom(rm: Room) {
    setEditingRoom(rm);
    setRoomNumber(rm.room_number);
    setRoomName(rm.name ?? "");
    setRoomFloor(rm.floor ?? "");
    setRoomActive(rm.is_active);
    setRoomOpen(true);
  }

  async function handleSaveRoom(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/super-admin/rooms", {
        method: editingRoom ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingRoom ? { id: editingRoom.id } : {}),
          roomNumber,
          name: roomName || null,
          floor: roomFloor || null,
          isActive: roomActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "Xona saqlanmadi" });
        return;
      }
      toast({ variant: "success", title: editingRoom ? "Xona yangilandi" : "Xona qo'shildi" });
      setRoomOpen(false);
      await loadAll();
    } catch {
      toast({ variant: "error", title: "Server xatosi" });
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const url =
        deleteTarget.type === "service"
          ? `/api/super-admin/services?id=${deleteTarget.id}`
          : `/api/super-admin/rooms?id=${deleteTarget.id}`;
      const res = await fetch(url, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "O'chirish imkonsiz" });
        return;
      }
      toast({
        variant: data.deactivated ? "info" : "success",
        title: data.deactivated
          ? "Bog'langan navbatlar borligi sababli xizmat nofaol holatga o'tkazildi"
          : "Muvaffaqiyatli o'chirildi",
      });
      setDeleteTarget(null);
      await loadAll();
    } catch {
      toast({ variant: "error", title: "Server xatosi" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <StaffPageHeader
        eyebrow="Katalog va infratuzilma"
        title="Xizmatlar va xonalar"
        description="Tibbiy xizmatlar narxlari, navbat prefikslari va klinika kabinetlari"
        actions={
          <>
            <div className="inline-flex rounded-xl border border-slate-200/90 bg-white p-1 shadow-xs">
              <button
                type="button"
                onClick={() => setActiveTab("services")}
                className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all tabular-nums ${
                  activeTab === "services"
                    ? "bg-[#0A1628] text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-[#0A1628]"
                }`}
              >
                Xizmatlar ({services.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("rooms")}
                className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all tabular-nums ${
                  activeTab === "rooms"
                    ? "bg-[#0A1628] text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-[#0A1628]"
                }`}
              >
                Xonalar ({rooms.length})
              </button>
            </div>
            <Button onClick={activeTab === "services" ? openNewService : openNewRoom}>
              <Plus className="h-4 w-4" />
              {activeTab === "services" ? "Yangi xizmat" : "Yangi xona"}
            </Button>
          </>
        }
      />

      {activeTab === "services" ? (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <TableSkeleton rows={5} columns={6} />
            ) : services.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon={BriefcaseMedical}
                  title="Tibbiy xizmatlar topilmadi"
                  description="Yangi xizmat qo'shib shifokorlarga biriktiring."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold text-slate-500">
                      <th className="px-4 py-3">Xizmat nomi</th>
                      <th className="px-4 py-3">Bo&apos;lim</th>
                      <th className="px-4 py-3">Prefiks</th>
                      <th className="px-4 py-3">Narxi</th>
                      <th className="px-4 py-3">Davomiyligi</th>
                      <th className="px-4 py-3">Holat</th>
                      <th className="px-4 py-3 text-right">Amallar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {services.map((srv) => (
                      <tr key={srv.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-slate-900">{srv.name}</p>
                          {srv.description && (
                            <p className="line-clamp-1 max-w-xs text-xs text-slate-500">
                              {srv.description}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">{srv.category}</td>
                        <td className="px-4 py-3.5 font-mono font-bold text-blue-600">
                          {srv.queue_prefix}
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-slate-900">
                          {formatUZS(srv.price)}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">{srv.duration_minutes} daq</td>
                        <td className="px-4 py-3.5">
                          <Badge variant={srv.is_active ? "success" : "neutral"}>
                            {srv.is_active ? "Faol" : "Nofaol"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="outline" onClick={() => openEditService(srv)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-rose-600 hover:bg-rose-50"
                              onClick={() =>
                                setDeleteTarget({ type: "service", id: srv.id, label: srv.name })
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.length === 0 ? (
            <Card className="sm:col-span-2 lg:col-span-3">
              <CardContent className="p-8">
                <EmptyState
                  icon={DoorOpen}
                  title="Xonalar mavjud emas"
                  description="Klinika kabinetlarini qo'shing."
                />
              </CardContent>
            </Card>
          ) : (
            rooms.map((rm) => (
              <Card key={rm.id}>
                <CardContent className="flex items-start justify-between p-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-slate-900">{rm.room_number}-xona</span>
                      <Badge variant={rm.is_active ? "success" : "neutral"}>
                        {rm.is_active ? "Faol" : "Band/Yopiq"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-700">{rm.name || "Kabinet"}</p>
                    <p className="text-xs text-slate-500">{rm.floor || "Qavat ko'rsatilmagan"}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => openEditRoom(rm)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-rose-600 hover:bg-rose-50"
                      onClick={() =>
                        setDeleteTarget({
                          type: "room",
                          id: rm.id,
                          label: `${rm.room_number}-xona`,
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Service Modal */}
      <Dialog open={srvOpen} onOpenChange={setSrvOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingSrv ? "Xizmatni tahrirlash" : "Yangi xizmat qo'shish"}</DialogTitle>
            <DialogDescription>Xizmat ma&apos;lumotlari ommaviy saytda ham ko&apos;rinadi</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveService} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Xizmat nomi *</Label>
                <Input value={srvName} onChange={(e) => setSrvName(e.target.value)} required />
              </div>
              <div>
                <Label>Bo&apos;lim / Kategoriya *</Label>
                <Input value={srvCat} onChange={(e) => setSrvCat(e.target.value)} required />
              </div>
              <div>
                <Label>Narxi (UZS) *</Label>
                <Input
                  type="number"
                  min={0}
                  value={srvPrice}
                  onChange={(e) => setSrvPrice(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>Davomiyligi (daqiqa)</Label>
                <Input
                  type="number"
                  min={5}
                  value={srvDuration}
                  onChange={(e) => setSrvDuration(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>Navbat prefiksi</Label>
                <Input
                  maxLength={4}
                  value={srvPrefix}
                  onChange={(e) => setSrvPrefix(e.target.value.toUpperCase())}
                  required
                />
              </div>
              <div>
                <Label>Ikonka</Label>
                <SelectInput value={srvIcon} onChange={(e) => setSrvIcon(e.target.value)}>
                  {SERVICE_ICON_OPTIONS.map((ic) => (
                    <option key={ic.value} value={ic.value}>
                      {ic.label}
                    </option>
                  ))}
                </SelectInput>
              </div>
              <div>
                <Label>Tartib raqami</Label>
                <Input
                  type="number"
                  min={0}
                  value={srvSort}
                  onChange={(e) => setSrvSort(e.target.value)}
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={srvActive}
                    onChange={(e) => setSrvActive(e.target.checked)}
                  />
                  Faol xizmat
                </label>
              </div>
            </div>
            <div>
              <Label>Xizmat rasmi (URL yoki yuklash, ixtiyoriy)</Label>
              <div className="flex gap-2">
                <Input
                  value={srvImageUrl}
                  onChange={(e) => setSrvImageUrl(e.target.value)}
                  placeholder="Bo'sh qoldirilsa, tanlangan ikonka ko'rinadi"
                />
                <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                  <Upload className="h-3.5 w-3.5" />
                  Yuklash
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={saving}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      setSaving(true);
                      try {
                        const fd = new FormData();
                        fd.append("file", file);
                        fd.append("folder", "services");
                        const res = await fetch("/api/super-admin/settings", {
                          method: "POST",
                          body: fd,
                        });
                        const data = await res.json();
                        if (!res.ok) {
                          toast({
                            variant: "error",
                            title: data.error || "Rasmni yuklab bo'lmadi",
                          });
                          return;
                        }
                        setSrvImageUrl(data.url);
                        toast({ variant: "success", title: "Xizmat rasmi yuklandi" });
                      } catch {
                        toast({ variant: "error", title: "Rasm yuklashda xatolik" });
                      } finally {
                        setSaving(false);
                      }
                    }}
                  />
                </label>
              </div>
            </div>
            <div>
              <Label>Tavsif</Label>
              <Textarea rows={3} value={srvDesc} onChange={(e) => setSrvDesc(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSrvOpen(false)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saqlanmoqda..." : "Saqlash"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Room Modal */}
      <Dialog open={roomOpen} onOpenChange={setRoomOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRoom ? "Xonani tahrirlash" : "Yangi xona qo'shish"}</DialogTitle>
            <DialogDescription>Kabinet raqami va qavat ma&apos;lumotlari</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveRoom} className="space-y-4">
            <div>
              <Label>Xona raqami *</Label>
              <Input value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} required />
            </div>
            <div>
              <Label>Nomi</Label>
              <Input
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="Stomatologiya kabineti"
              />
            </div>
            <div>
              <Label>Qavat</Label>
              <Input value={roomFloor} onChange={(e) => setRoomFloor(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={roomActive}
                onChange={(e) => setRoomActive(e.target.checked)}
              />
              Faol kabinet
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRoomOpen(false)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saqlanmoqda..." : "Saqlash"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="O'chirishni tasdiqlang"
        description={`"${deleteTarget?.label}" butunlay o'chiriladi. Agar avvalgi yozuvlarga bog'langan bo'lsa, nofaol holatga o'tkazish tavsiya etiladi.`}
        confirmLabel="O'chirish"
        variant="destructive"
        loading={saving}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
