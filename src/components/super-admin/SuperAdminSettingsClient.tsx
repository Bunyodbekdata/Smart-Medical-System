"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Building2, Globe, ListOrdered, Save, Upload } from "lucide-react";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { StaffPasswordCard } from "@/components/shared/StaffPasswordCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import type { ClinicSettings } from "@/types/database";

export function SuperAdminSettingsClient() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<"logo" | "hero" | null>(null);
  const [form, setForm] = useState<ClinicSettings | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/super-admin/settings", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "Sozlamalarni yuklab bo'lmadi" });
        return;
      }
      setForm(data.settings ?? null);
    } catch {
      toast({ variant: "error", title: "Server bilan aloqada xatolik" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadSettings();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadSettings]);

  async function handleImageUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    field: "logo" | "hero"
  ) {
    const file = e.target.files?.[0];
    if (!file || !form) return;
    setUploadingField(field);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", field === "logo" ? "logos" : "heroes");
      const res = await fetch("/api/super-admin/settings", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "Rasmni yuklab bo'lmadi" });
        return;
      }
      setForm({
        ...form,
        ...(field === "logo" ? { logo_url: data.url } : { hero_image_url: data.url }),
      });
      toast({ variant: "success", title: "Rasm yuklandi. Saqlash tugmasini bosing." });
    } catch {
      toast({ variant: "error", title: "Rasm yuklashda xatolik" });
    } finally {
      setUploadingField(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const payload = {
        clinic_name: form.clinic_name,
        logo_url: form.logo_url || null,
        tagline: form.tagline,
        hero_title: form.hero_title,
        hero_subtitle: form.hero_subtitle,
        hero_image_url: form.hero_image_url || null,
        about_title: form.about_title,
        about_description: form.about_description,
        mission: form.mission,
        equipment_summary: form.equipment_summary,
        working_hours_summary: form.working_hours_summary,
        address: form.address,
        phone: form.phone,
        email: form.email,
        map_link: form.map_link || null,
        map_embed_url: form.map_embed_url || null,
        social_links: form.social_links ?? {},
        currency: form.currency,
        timezone: form.timezone,
        default_queue_prefix: form.default_queue_prefix,
        daily_queue_reset: form.daily_queue_reset,
        no_show_timeout_minutes: Number(form.no_show_timeout_minutes),
        allow_online_queue: form.allow_online_queue,
        receipt_header: form.receipt_header,
        receipt_footer: form.receipt_footer,
        stats_doctors_override:
          form.stats_doctors_override === null || form.stats_doctors_override === undefined
            ? null
            : Number(form.stats_doctors_override),
        stats_services_override:
          form.stats_services_override === null || form.stats_services_override === undefined
            ? null
            : Number(form.stats_services_override),
        stats_patients_override:
          form.stats_patients_override === null || form.stats_patients_override === undefined
            ? null
            : Number(form.stats_patients_override),
        stats_experience_years: Number(form.stats_experience_years),
        stats_positive_rate: Number(form.stats_positive_rate),
      };

      const res = await fetch("/api/super-admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "Sozlamalarni saqlab bo'lmadi" });
        return;
      }
      setForm(data.settings);
      toast({ variant: "success", title: "Klinika sozlamalari saqlandi" });
    } catch {
      toast({ variant: "error", title: "Server bilan aloqada xatolik" });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form) {
    return <div className="h-80 animate-pulse rounded-2xl bg-slate-200/70" />;
  }

  return (
    <div className="space-y-6">
      <StaffPageHeader
        eyebrow="Konfiguratsiya"
        title="Klinika sozlamalari"
        description="Brending, ommaviy sayt matnlari, statistika, elektron navbat va chek sozlamalari"
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Branding & Hero */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-5 w-5 text-[#0B4F8A]" />
                Brending va bosh sahifa
              </CardTitle>
              <CardDescription>Klinika nomi, logo va ommaviy sayt kirish qismi</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Klinika nomi *</Label>
                <Input
                  value={form.clinic_name}
                  onChange={(e) => setForm({ ...form, clinic_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Qisqa shior (Tagline) *</Label>
                <Input
                  value={form.tagline}
                  onChange={(e) => setForm({ ...form, tagline: e.target.value })}
                  required
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Logo URL</Label>
                  <Input
                    value={form.logo_url || ""}
                    onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                  />
                </div>
                <div className="flex items-end">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                    <Upload className="h-4 w-4" />
                    {uploadingField === "logo" ? "Yuklanmoqda..." : "Logo yuklash"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleImageUpload(e, "logo")}
                    />
                  </label>
                </div>
              </div>
              <div>
                <Label>Hero sarlavhasi *</Label>
                <Input
                  value={form.hero_title}
                  onChange={(e) => setForm({ ...form, hero_title: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Hero matni *</Label>
                <Textarea
                  rows={2}
                  value={form.hero_subtitle}
                  onChange={(e) => setForm({ ...form, hero_subtitle: e.target.value })}
                  required
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Hero rasm URL</Label>
                  <Input
                    value={form.hero_image_url || ""}
                    onChange={(e) => setForm({ ...form, hero_image_url: e.target.value })}
                  />
                </div>
                <div className="flex items-end">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                    <Upload className="h-4 w-4" />
                    {uploadingField === "hero" ? "Yuklanmoqda..." : "Hero rasm yuklash"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleImageUpload(e, "hero")}
                    />
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contact & Social */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="h-5 w-5 text-blue-600" />
                Aloqa, manzil va ish vaqti
              </CardTitle>
              <CardDescription>Ommaviy sayt va cheklarda aks etuvchi ma&apos;lumotlar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Telefon *</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div>
                <Label>Manzil *</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Ish vaqti *</Label>
                <Input
                  value={form.working_hours_summary}
                  onChange={(e) => setForm({ ...form, working_hours_summary: e.target.value })}
                  required
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Google Maps havolasi</Label>
                  <Input
                    value={form.map_link || ""}
                    onChange={(e) => setForm({ ...form, map_link: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Google Maps embed URL</Label>
                  <Input
                    value={form.map_embed_url || ""}
                    onChange={(e) => setForm({ ...form, map_embed_url: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Telegram</Label>
                  <Input
                    placeholder="https://t.me/medclinic"
                    value={form.social_links?.telegram || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        social_links: { ...form.social_links, telegram: e.target.value },
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Instagram</Label>
                  <Input
                    placeholder="https://instagram.com/medclinic"
                    value={form.social_links?.instagram || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        social_links: { ...form.social_links, instagram: e.target.value },
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Facebook</Label>
                  <Input
                    placeholder="https://facebook.com/medclinic"
                    value={form.social_links?.facebook || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        social_links: { ...form.social_links, facebook: e.target.value },
                      })
                    }
                  />
                </div>
                <div>
                  <Label>YouTube</Label>
                  <Input
                    placeholder="https://youtube.com/@medclinic"
                    value={form.social_links?.youtube || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        social_links: { ...form.social_links, youtube: e.target.value },
                      })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* About & Editable Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Klinika haqida va statistika</CardTitle>
              <CardDescription>
                Bo&apos;sh qoldirilgan sonlar bazadan avtomatik hisoblanadi
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Klinika haqida sarlavha</Label>
                <Input
                  value={form.about_title}
                  onChange={(e) => setForm({ ...form, about_title: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Tavsif</Label>
                <Textarea
                  rows={3}
                  value={form.about_description}
                  onChange={(e) => setForm({ ...form, about_description: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Missiya</Label>
                <Textarea
                  rows={2}
                  value={form.mission}
                  onChange={(e) => setForm({ ...form, mission: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Uskuna va imkoniyatlar</Label>
                <Textarea
                  rows={2}
                  value={form.equipment_summary}
                  onChange={(e) => setForm({ ...form, equipment_summary: e.target.value })}
                  required
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Shifokorlar soni (qo&apos;lda)</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="Avtomatik"
                    value={form.stats_doctors_override ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        stats_doctors_override:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Xizmatlar soni (qo&apos;lda)</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="Avtomatik"
                    value={form.stats_services_override ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        stats_services_override:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Bemorlar soni (qo&apos;lda)</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="Avtomatik"
                    value={form.stats_patients_override ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        stats_patients_override:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Tajriba (yil)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.stats_experience_years}
                    onChange={(e) =>
                      setForm({ ...form, stats_experience_years: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Ijobiy fikrlar (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={form.stats_positive_rate}
                    onChange={(e) =>
                      setForm({ ...form, stats_positive_rate: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Queue & Receipt Rules */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ListOrdered className="h-5 w-5 text-blue-600" />
                Navbat va chek sozlamalari
              </CardTitle>
              <CardDescription>
                Kunlik navbat tartibi, kelmagan bemor vaqti va kvitansiya matnlari
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Standart navbat prefiksi</Label>
                  <Input
                    maxLength={4}
                    value={form.default_queue_prefix}
                    onChange={(e) =>
                      setForm({ ...form, default_queue_prefix: e.target.value.toUpperCase() })
                    }
                    required
                  />
                </div>
                <div>
                  <Label>Kelmagan deb belgilash (daqiqa)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={240}
                    value={form.no_show_timeout_minutes}
                    onChange={(e) =>
                      setForm({ ...form, no_show_timeout_minutes: Number(e.target.value) })
                    }
                    required
                  />
                </div>
              </div>

              <div className="space-y-2.5 pt-1">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.daily_queue_reset}
                    onChange={(e) => setForm({ ...form, daily_queue_reset: e.target.checked })}
                  />
                  Navbat raqamlarini har kuni 001 dan qayta boshlash
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.allow_online_queue}
                    onChange={(e) => setForm({ ...form, allow_online_queue: e.target.checked })}
                  />
                  Sayt orqali onlayn navbat olishni yoqish
                </label>
              </div>

              <div>
                <Label>Chek sarlavhasi</Label>
                <Input
                  value={form.receipt_header}
                  onChange={(e) => setForm({ ...form, receipt_header: e.target.value })}
                />
              </div>
              <div>
                <Label>Chek pastki matni</Label>
                <Input
                  value={form.receipt_footer}
                  onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })}
                />
              </div>

              <div className="pt-2">
                <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? "Saqlanmoqda..." : "Barcha sozlamalarni saqlash"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </form>

      <StaffPasswordCard />
    </div>
  );
}
