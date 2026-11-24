"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  User,
} from "lucide-react";
import { ClinicLogo } from "@/components/shared/ClinicLogo";
import { MediaImage } from "@/components/shared/MediaImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSafeRedirectPath } from "@/lib/formatters";
import type { UserRole } from "@/types/database";

const ERROR_MESSAGES: Record<string, string> = {
  doctor_profile_missing:
    "Sizning shifokor profilingiz faol emas yoki biriktirilmagan. Klinika rahbariyatiga murojaat qiling.",
};

export function StaffLoginForm({
  clinicName,
  clinicLogoUrl,
  configured,
  nextPath = null,
  initialErrorCode = null,
  hasActiveBrokenSession = false,
}: {
  clinicName: string;
  clinicLogoUrl?: string | null;
  configured: boolean;
  nextPath?: string | null;
  initialErrorCode?: string | null;
  hasActiveBrokenSession?: boolean;
}) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signingOutBroken, setSigningOutBroken] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(
    initialErrorCode ? (ERROR_MESSAGES[initialErrorCode] ?? null) : null
  );

  async function handleClearBrokenSession() {
    setSigningOutBroken(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setErrorMsg(null);
      router.replace("/staff/login");
      router.refresh();
    } finally {
      setSigningOutBroken(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: identifier.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Tizimga kirishda xatolik yuz berdi.");
        return;
      }

      const role = data.role as UserRole | undefined;
      const target = role
        ? getSafeRedirectPath(nextPath, role)
        : (data.redirectTo || "/admin");

      router.push(target);
      router.refresh();
    } catch {
      setErrorMsg("Tarmoq xatosi. Internet aloqasini tekshiring va qayta urinib ko'ring.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-[#F7F9FC] lg:grid-cols-12">
      {/* Left Executive Clinical Showcase (Desktop) */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#091426] p-10 text-white lg:col-span-5 lg:flex xl:p-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-[#0B4F8A]/40 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-teal-500/20 blur-3xl"
        />

        <div className="relative flex items-center justify-between">
          <ClinicLogo
            name={clinicName}
            subtitle="Xodimlar boshqaruv portali"
            logoUrl={clinicLogoUrl}
            dark
          />
        </div>

        <div className="relative my-auto py-8">
          <div className="overflow-hidden rounded-2xl border border-white/12 shadow-2xl">
            <MediaImage
              src="/images/clinic-hero.jpg"
              alt={clinicName}
              width={720}
              height={440}
              className="aspect-[16/10] w-full object-cover"
            />
          </div>

          <h2 className="mt-7 text-2xl font-extrabold tracking-[-0.025em] leading-snug text-white">
            Yagona tibbiy boshqaruv va jonli elektron navbat tizimi
          </h2>
          <p className="mt-2.5 text-sm leading-relaxed text-slate-300">
            Administratorlar, shifokorlar va klinika rahbariyati uchun xavfsiz, rolga
            asoslangan ish muhiti.
          </p>

          <ul className="mt-6 space-y-2.5 text-xs text-slate-300">
            {[
              "Real vaqtda sinxronlashtirilgan bemorlar navbati",
              "Shaffof kassa, kvitansiyalar va shifokor ulushi hisobi",
              "O'zgarmas xavfsizlik va audit jurnali nazorati",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-500">
          © {new Date().getFullYear()} {clinicName} • Xavfsiz SSL ulanish
        </p>
      </div>

      {/* Right Clean Minimal Login Panel */}
      <div className="flex flex-col justify-center px-4 py-12 sm:px-8 lg:col-span-7">
        <div className="mx-auto w-full max-w-md animate-fade-in">
          <div className="mb-8 flex items-center justify-between">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 transition-colors hover:text-[#0B4F8A]"
            >
              <ArrowLeft className="h-4 w-4" />
              Bosh sahifaga qaytish
            </Link>
            <div className="lg:hidden">
              <ClinicLogo name={clinicName} logoUrl={clinicLogoUrl} />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white p-7 shadow-[0_14px_40px_-16px_rgba(10,22,40,0.12)] sm:p-9">
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EDF4FA] text-[#0B4F8A]">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold tracking-[-0.02em] text-[#0A1628]">
                  Tizimga kirish
                </h1>
                <p className="text-xs text-slate-500">
                  Administrator, shifokor va rahbariyat hisobi
                </p>
              </div>
            </div>

            {!configured ? (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800">
                Ma&apos;lumotlar bazasi muhit o&apos;zgaruvchilari sozlanmagan. Iltimos,{" "}
                <code className="font-mono">.env.local</code> faylini sozlang va xodim hisobini
                yarating.
              </div>
            ) : null}

            {hasActiveBrokenSession ? (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-2.5 text-xs text-amber-900">
                <span>Joriy sessiyadan chiqib boshqa hisob orqali kirishingiz mumkin.</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={signingOutBroken}
                  onClick={() => void handleClearBrokenSession()}
                >
                  {signingOutBroken ? "Chiqilmoqda..." : "Sessiyani yopish"}
                </Button>
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <Label htmlFor="staff-identifier">Login yoki elektron pochta</Label>
                <div className="relative mt-1.5">
                  <User className="pointer-events-none absolute top-3 left-3.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="staff-identifier"
                    autoComplete="username"
                    autoFocus
                    placeholder="masalan: dr_ali yoki ali@medclinic.uz"
                    className="pl-10"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="staff-password">Parol</Label>
                <div className="relative mt-1.5">
                  <Lock className="pointer-events-none absolute top-3 left-3.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="staff-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="pr-10 pl-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute top-2.5 right-2.5 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                    aria-label={showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {errorMsg ? (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700"
                >
                  {errorMsg}
                </div>
              ) : null}

              <Button
                type="submit"
                size="lg"
                className="mt-2 w-full"
                disabled={submitting || !configured}
              >
                {submitting ? "Tekshirilmoqda..." : "Kirish"}
              </Button>
            </form>

            <p className="mt-6 border-t border-slate-100 pt-4 text-center text-[11px] leading-relaxed text-slate-400">
              Hisob ma&apos;lumotlari faqat klinika rahbari (Super Admin) tomonidan
              taqdim etiladi. Barcha harakatlar audit jurnalida qayd etiladi.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
