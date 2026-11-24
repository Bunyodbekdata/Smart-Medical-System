"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Percent, Pencil, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
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
import { formatDateDDMMYYYY, formatUZS, getTashkentDateString } from "@/lib/formatters";
import type { Promotion, Service } from "@/types/database";

export function SuperAdminPromotionsClient() {
  const { toast } = useToast();
  const todayStr = getTashkentDateString();
  const [loading, setLoading] = useState(true);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [services, setServices] = useState<Service[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("/images/promo-dental.jpg");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [discountValue, setDiscountValue] = useState("15");
  const [serviceId, setServiceId] = useState("");
  const [startsAt, setStartsAt] = useState(todayStr);
  const [endsAt, setEndsAt] = useState(todayStr);
  const [isActive, setIsActive] = useState(true);

  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Promotion | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [promoRes, srvRes] = await Promise.all([
        fetch("/api/super-admin/promotions", { cache: "no-store" }),
        fetch("/api/super-admin/services", { cache: "no-store" }),
      ]);
      if (promoRes.ok) {
        const pData = await promoRes.json();
        setPromotions(pData.promotions ?? []);
      }
      if (srvRes.ok) {
        const sData = await srvRes.json();
        setServices(sData.services ?? []);
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

  function openNew() {
    setEditing(null);
    setTitle("");
    setDescription("");
    setImageUrl("/images/promo-dental.jpg");
    setDiscountType("percentage");
    setDiscountValue("15");
    setServiceId("");
    setStartsAt(todayStr);
    setEndsAt(todayStr);
    setIsActive(true);
    setFormOpen(true);
  }

  function openEdit(promo: Promotion) {
    setEditing(promo);
    setTitle(promo.title);
    setDescription(promo.description ?? "");
    setImageUrl(promo.image_url ?? "");
    setDiscountType(promo.discount_type);
    setDiscountValue(String(promo.discount_value));
    setServiceId(promo.service_id ?? "");
    setStartsAt(promo.starts_at);
    setEndsAt(promo.ends_at);
    setIsActive(promo.is_active);
    setFormOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...(editing ? { id: editing.id } : {}),
        title,
        description: description || null,
        imageUrl: imageUrl || null,
        discountType,
        discountValue: Number(discountValue),
        serviceId: serviceId || null,
        startsAt,
        endsAt,
        isActive,
      };
      const res = await fetch("/api/super-admin/promotions", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "Saqlashda xatolik" });
        return;
      }
      toast({ variant: "success", title: editing ? "Aksiya yangilandi" : "Yangi aksiya yaratildi" });
      setFormOpen(false);
      await loadAll();
    } catch {
      toast({ variant: "error", title: "Server xatosi" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/super-admin/promotions?id=${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "O'chirishda xatolik" });
        return;
      }
      toast({ variant: "success", title: "Aksiya o'chirildi" });
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
        eyebrow="Marketing va takliflar"
        title="Chegirmalar va aksiyalar"
        description="Muddati tugagan aksiyalar ommaviy saytdan avtomatik yashiriladi"
        actions={
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" />
            Yangi aksiya
          </Button>
        }
      />

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl bg-slate-200/70" />
          ))}
        </div>
      ) : promotions.length === 0 ? (
        <Card>
          <CardContent className="p-8">
            <EmptyState
              icon={Sparkles}
              title="Aksiyalar mavjud emas"
              description="Bemorlar uchun mavsumiy yoki xizmatga oid chegirmalarni yarating."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {promotions.map((promo) => {
            const isExpired = promo.ends_at < todayStr;
            const isUpcoming = promo.starts_at > todayStr;
            return (
              <Card
                key={promo.id}
                className={`transition-colors hover:border-[#0B4F8A]/30 ${!promo.is_active || isExpired ? "opacity-80" : ""}`}
              >
                <CardContent className="space-y-3 p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-[#0A1628]">{promo.title}</h3>
                        {!promo.is_active ? (
                          <Badge variant="neutral">Nofaol</Badge>
                        ) : isExpired ? (
                          <Badge variant="warning">Muddati tugagan</Badge>
                        ) : isUpcoming ? (
                          <Badge variant="info">Kutilmoqda</Badge>
                        ) : (
                          <Badge variant="success">Faol</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs font-semibold text-[#0B4F8A]">
                        {promo.service?.name || "Barcha xizmatlar"}
                      </p>
                    </div>
                    <Badge variant="default" className="text-xs font-extrabold tabular-nums">
                      <Percent className="mr-0.5 h-3.5 w-3.5" />
                      {promo.discount_type === "percentage"
                        ? `${Number(promo.discount_value)}%`
                        : formatUZS(promo.discount_value)}
                    </Badge>
                  </div>

                  {promo.description && (
                    <p className="text-xs text-slate-600">{promo.description}</p>
                  )}

                  <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                    <span>
                      Muddat: {formatDateDDMMYYYY(promo.starts_at)} –{" "}
                      {formatDateDDMMYYYY(promo.ends_at)}
                    </span>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => openEdit(promo)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-rose-600 hover:bg-rose-50"
                        onClick={() => setDeleteTarget(promo)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Aksiyani tahrirlash" : "Yangi aksiya yaratish"}</DialogTitle>
            <DialogDescription>Chegirma narx hisoblashda avtomatik qo&apos;llanadi</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <Label>Aksiya sarlavhasi *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div>
              <Label>Tegishli xizmat</Label>
              <SelectInput value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                <option value="">Barcha xizmatlar uchun</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({formatUZS(s.price)})
                  </option>
                ))}
              </SelectInput>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Chegirma turi *</Label>
                <SelectInput
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as "percentage" | "fixed")}
                >
                  <option value="percentage">Foiz (%)</option>
                  <option value="fixed">Qat&apos;iy summa (UZS)</option>
                </SelectInput>
              </div>
              <div>
                <Label>Qiymat *</Label>
                <Input
                  type="number"
                  min={1}
                  max={discountType === "percentage" ? 100 : undefined}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>Boshlanish sanasi *</Label>
                <Input
                  type="date"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>Tugash sanasi *</Label>
                <Input
                  type="date"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  required
                />
              </div>
            </div>
            <div>
              <Label>Aksiya rasmi (URL yoki fayldan yuklash)</Label>
              <div className="flex gap-2">
                <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
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
                        fd.append("folder", "promotions");
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
                        setImageUrl(data.url);
                        toast({ variant: "success", title: "Aksiya rasmi yuklandi" });
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
              <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Faol aksiya
            </label>
            <div className="flex justify-end gap-2">
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

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Aksiyani o'chirish"
        description={`"${deleteTarget?.title}" aksiyasi o'chiriladi.`}
        confirmLabel="O'chirish"
        variant="destructive"
        loading={saving}
        onConfirm={handleDelete}
      />
    </div>
  );
}
