"use client";

import React, { useCallback, useEffect, useState } from "react";
import { KeyRound, Pencil, Plus, Shield, Users } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatDateTimeUZ } from "@/lib/formatters";
import { ROLE_LABELS } from "@/lib/uz-labels";
import type { UserProfile, UserRole } from "@/types/database";

interface ActivityRow {
  id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  action: string;
  summary: string;
  created_at: string;
}

export function SuperAdminEmployeesClient() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"admin" | "super_admin">("admin");
  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [pwTarget, setPwTarget] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const loadEmployees = useCallback(async () => {
    try {
      const res = await fetch("/api/super-admin/employees", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "Xodimlarni yuklab bo'lmadi" });
        return;
      }
      setEmployees(data.employees ?? []);
      setActivity(data.activityHistory ?? []);
    } catch {
      toast({ variant: "error", title: "Server bilan aloqada xatolik" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadEmployees();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadEmployees]);

  function openCreate() {
    setEditing(null);
    setFullName("");
    setUsername("");
    setEmail("");
    setPhone("");
    setRole("admin");
    setPassword("");
    setIsActive(true);
    setFormOpen(true);
  }

  function openEdit(emp: UserProfile) {
    setEditing(emp);
    setFullName(emp.full_name);
    setUsername(emp.username ?? "");
    setEmail(emp.email);
    setPhone(emp.phone ?? "");
    setRole((emp.role === "super_admin" ? "super_admin" : "admin") as "admin" | "super_admin");
    setIsActive(emp.is_active);
    setFormOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = editing
        ? await fetch("/api/super-admin/employees", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "update",
              userId: editing.id,
              fullName,
              username,
              phone: phone || null,
              role,
              isActive,
            }),
          })
        : await fetch("/api/super-admin/employees", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fullName,
              username,
              email,
              phone: phone || null,
              password,
              role,
            }),
          });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "Saqlashda xatolik" });
        return;
      }
      toast({
        variant: "success",
        title: editing ? "Xodim ma'lumotlari yangilandi" : "Yangi xodim qo'shildi",
      });
      setFormOpen(false);
      await loadEmployees();
    } catch {
      toast({ variant: "error", title: "Server xatosi" });
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPw(e: React.FormEvent) {
    e.preventDefault();
    if (!pwTarget) return;
    setSaving(true);
    try {
      const res = await fetch("/api/super-admin/employees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset_password",
          userId: pwTarget.id,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "Parolni tiklab bo'lmadi" });
        return;
      }
      toast({ variant: "success", title: "Xodim paroli yangilandi" });
      setPwTarget(null);
      setNewPassword("");
    } catch {
      toast({ variant: "error", title: "Server xatosi" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <StaffPageHeader
        eyebrow="Kadrlar va ruxsatlar"
        title="Xodimlar boshqaruvi"
        description="Administratorlar, kassirlar va rahbar hisoblarini boshqarish"
        badge={<Badge variant="default" className="tabular-nums">{employees.length} nafar</Badge>}
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Yangi xodim
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="overflow-hidden lg:col-span-7">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-5 w-5 text-[#0B4F8A]" />
              Klinika xodimlari
            </CardTitle>
            <CardDescription>
              Shifokorlar ro&apos;yxati alohida &quot;Shifokorlar&quot; bo&apos;limida boshqariladi
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <TableSkeleton rows={4} columns={5} />
            ) : employees.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={Users}
                  title="Xodimlar topilmadi"
                  description="Yangi administrator yoki kassir qo'shish uchun tugmani bosing."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-y border-slate-200/80 bg-[#F8FAFC] text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">
                      <th className="px-4 py-3.5">F.I.O.</th>
                      <th className="px-4 py-3.5">Login / Email</th>
                      <th className="px-4 py-3.5">Rol</th>
                      <th className="px-4 py-3.5">Holat</th>
                      <th className="px-4 py-3.5 text-right">Amallar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {employees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-slate-900">{emp.full_name}</p>
                          <p className="text-xs text-slate-500">{emp.phone || "—"}</p>
                        </td>
                        <td className="px-4 py-3.5 text-xs">
                          <p className="font-medium text-slate-800">{emp.username || "—"}</p>
                          <p className="text-slate-500">{emp.email}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge variant="info">{ROLE_LABELS[emp.role as UserRole]}</Badge>
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge variant={emp.is_active ? "success" : "neutral"}>
                            {emp.is_active ? "Faol" : "Bloklangan"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="outline" onClick={() => openEdit(emp)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setPwTarget(emp);
                                setNewPassword("");
                              }}
                              title="Parolni tiklash"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
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

        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle className="text-base">So&apos;nggi xodim faoliyati</CardTitle>
            <CardDescription>Audit jurnalidan oxirgi muhim amallar</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[520px] space-y-3 overflow-y-auto">
            {activity.length === 0 ? (
              <p className="text-sm text-slate-500">Hozircha faoliyat yozuvlari yo&apos;q.</p>
            ) : (
              activity.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs"
                >
                  <div className="flex items-center justify-between font-semibold text-slate-800">
                    <span>{item.actor_name || "Xodim"}</span>
                    <span className="text-[11px] font-normal text-slate-400">
                      {formatDateTimeUZ(item.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-600">{item.summary}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Xodimni tahrirlash" : "Yangi xodim qo'shish"}</DialogTitle>
            <DialogDescription>
              Login (username) yoki elektron pochta orqali Staff Portalga kirish imkoniyati
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <Label>F.I.O. *</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Username (Login) *</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            {!editing && (
              <div>
                <Label>Elektron pochta *</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            )}
            <div>
              <Label>Telefon</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label>Rol *</Label>
              <SelectInput
                value={role}
                onChange={(e) => setRole(e.target.value as "admin" | "super_admin")}
              >
                <option value="admin">Administrator / Kassir</option>
                <option value="super_admin">Super Admin (Rahbar)</option>
              </SelectInput>
            </div>
            {!editing ? (
              <div>
                <Label>Parol (kamida 8 belgi) *</Label>
                <Input
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            ) : (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                Faol hisob (tizimga kirishga ruxsat)
              </label>
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

      {/* Reset Password */}
      <Dialog
        open={Boolean(pwTarget)}
        onOpenChange={(open) => {
          if (!open) setPwTarget(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Xodim parolini yangilash</DialogTitle>
            <DialogDescription>{pwTarget?.full_name}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleResetPw} className="space-y-4">
            <div>
              <Label>Yangi parol (kamida 8 belgi)</Label>
              <Input
                type="password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPwTarget(null)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Yangilanmoqda..." : "Yangilash"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
