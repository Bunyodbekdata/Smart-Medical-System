"use client";

import React, { useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

export function StaffPasswordCard() {
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast({ variant: "error", title: "Parol kamida 8 ta belgidan iborat bo'lishi kerak" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ variant: "error", title: "Parollar mos kelmadi" });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/staff/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "error", title: data.error || "Parolni yangilab bo'lmadi" });
        return;
      }
      toast({ variant: "success", title: "Parol muvaffaqiyatli yangilandi" });
      setNewPassword("");
      setConfirmPassword("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EDF4FA] text-[#0B4F8A] ring-1 ring-[#D4E4F4]">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">Parolni o&apos;zgartirish</CardTitle>
            <CardDescription>
              Shaxsiy hisobingiz xavfsizligi uchun kamida 8 ta belgili paroldan foydalaning
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="new-pw">Yangi parol</Label>
            <div className="relative mt-1.5">
              <Input
                id="new-pw"
                type={showPassword ? "text" : "password"}
                className="pr-10"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute top-2.5 right-2.5 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label={showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <Label htmlFor="confirm-pw">Yangi parolni tasdiqlang</Label>
            <Input
              id="confirm-pw"
              type={showPassword ? "text" : "password"}
              className="mt-1.5"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? "Saqlanmoqda..." : "Parolni yangilash"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
