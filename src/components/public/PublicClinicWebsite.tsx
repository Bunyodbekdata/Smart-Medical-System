"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Award,
  CalendarClock,
  CheckCircle2,
  Clock,
  Cpu,
  ExternalLink,
  FlaskConical,
  HeartPulse,
  MapPin,
  Menu,
  Phone,
  Search,
  ShieldCheck,
  SmilePlus,
  Sparkles,
  Star,
  Stethoscope,
  Ticket,
  X,
} from "lucide-react";
import { ClinicLogo } from "@/components/shared/ClinicLogo";
import { MediaImage } from "@/components/shared/MediaImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OnlineQueueModal } from "./OnlineQueueModal";
import {
  clearActiveTicket,
  loadActiveTicket,
  type StoredActiveTicket,
} from "@/lib/active-ticket-storage";
import { formatCompactNumber, formatDateDDMMYYYY, formatUZS } from "@/lib/formatters";
import { calculatePromotionDiscount } from "@/lib/domain/queue-rules";
import type { PublicClinicBundle } from "@/lib/data/public-clinic";
import {
  DAYS_OF_WEEK_UZ,
  DOCTOR_AVAILABILITY_CLASSES,
  DOCTOR_AVAILABILITY_LABELS,
} from "@/lib/uz-labels";

const SERVICE_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  SmilePlus,
  Stethoscope,
  FlaskConical,
  ScanHeart: Activity,
  HeartPulse,
  Cpu,
  Award,
  Clock,
  ShieldCheck,
};

function getDoctorFallbackPhoto(fullName: string, index: number): string {
  const lower = fullName.toLowerCase();
  const isLikelyFemale =
    /(ova|eva|ina|a)\b/.test(lower) ||
    /(madina|dilnoza|malika|nigora|sevara|gulnora|aziza|shahnoza|nilufar|kamola|zulfiya|feruza)/.test(
      lower
    );
  if (isLikelyFemale) return "/images/doctor-placeholder-f.jpg";
  if (/(ali|sardor|azim|jasur|dilshod|timur|bobur|ulug|farrux|shohrux|bekzod)/.test(lower)) {
    return "/images/doctor-placeholder-m.jpg";
  }
  return index % 2 === 1
    ? "/images/doctor-placeholder-f.jpg"
    : "/images/doctor-placeholder-m.jpg";
}

export function PublicClinicWebsite({ bundle }: { bundle: PublicClinicBundle }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [preselectedServiceId, setPreselectedServiceId] = useState<string | null>(null);
  const [preselectedDoctorId, setPreselectedDoctorId] = useState<string | null>(null);
  const [selectedServiceCategory, setSelectedServiceCategory] = useState<string>("all");
  const [doctorSearch, setDoctorSearch] = useState("");
  const [selectedSpecialization, setSelectedSpecialization] = useState<string>("all");
  const [activeTicket, setActiveTicket] = useState<StoredActiveTicket | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setActiveTicket(loadActiveTicket());
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const settings = bundle.settings;
  const clinicName = settings?.clinic_name || "MedClinic";

  const serviceCategories = useMemo(() => {
    const cats = Array.from(new Set(bundle.services.map((s) => s.category)));
    return ["all", ...cats];
  }, [bundle.services]);

  const filteredServices = useMemo(() => {
    if (selectedServiceCategory === "all") return bundle.services;
    return bundle.services.filter((s) => s.category === selectedServiceCategory);
  }, [bundle.services, selectedServiceCategory]);

  const doctorSpecializations = useMemo(() => {
    const specs = Array.from(new Set(bundle.doctors.map((d) => d.specialization)));
    return ["all", ...specs];
  }, [bundle.doctors]);

  const filteredDoctors = useMemo(() => {
    const q = doctorSearch.trim().toLowerCase();
    return bundle.doctors.filter((doc) => {
      if (selectedSpecialization !== "all" && doc.specialization !== selectedSpecialization) {
        return false;
      }
      if (q) {
        return (
          doc.full_name.toLowerCase().includes(q) ||
          doc.specialization.toLowerCase().includes(q) ||
          (doc.doctor_services ?? []).some((ds) =>
            ds.service?.name?.toLowerCase().includes(q)
          )
        );
      }
      return true;
    });
  }, [bundle.doctors, selectedSpecialization, doctorSearch]);

  const availableDoctorsCount = useMemo(
    () => bundle.doctors.filter((d) => d.availability_status === "available").length,
    [bundle.doctors]
  );

  function openBookingModal(opts?: { serviceId?: string | null; doctorId?: string | null }) {
    setPreselectedServiceId(opts?.serviceId ?? null);
    setPreselectedDoctorId(opts?.doctorId ?? null);
    setModalOpen(true);
  }

  return (
    <div className="min-h-screen bg-[#F7F9FC] text-[#0A1628]">
      {/* Active Ticket Quick Return Bar */}
      {activeTicket ? (
        <div className="bg-[#0B4F8A] text-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 font-medium">
              <Ticket className="h-4 w-4 shrink-0 text-teal-300" />
              <span>
                Faol navbat chiptangiz:{" "}
                <strong className="font-extrabold tabular-nums">
                  {activeTicket.ticketNumber}
                </strong>
                {" • "}
                {activeTicket.doctorName} ({activeTicket.serviceName})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/queue/${activeTicket.trackingToken}`}
                className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 font-bold text-white transition-colors hover:bg-white/25"
              >
                Jonli kuzatish
                <ExternalLink className="h-3 w-3" />
              </Link>
              <button
                type="button"
                onClick={() => {
                  clearActiveTicket();
                  setActiveTicket(null);
                }}
                className="rounded-full p-1 text-sky-100 hover:bg-white/15 hover:text-white"
                aria-label="Xabarni yopish"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Top Executive Utility Bar (Desktop) */}
      <div className="hidden border-b border-slate-800/40 bg-[#091426] text-slate-300 lg:block">
        <div className="mx-auto flex h-10 max-w-7xl items-center justify-between px-4 text-xs sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-teal-400" />
              <span className="truncate max-w-md">
                {settings?.address || "Toshkent shahri"}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-400">
              <Clock className="h-3.5 w-3.5 text-teal-400" />
              {settings?.working_hours_summary || "Dushanba - Shanba: 08:00 - 20:00"}
            </span>
          </div>
          <div className="flex items-center gap-5">
            {settings?.phone ? (
              <a
                href={`tel:${settings.phone}`}
                className="inline-flex items-center gap-1.5 font-semibold text-white transition-colors hover:text-teal-300 tabular-nums"
              >
                <Phone className="h-3.5 w-3.5 text-teal-400" />
                {settings.phone}
              </a>
            ) : null}
            <span className="h-3.5 w-px bg-white/15" />
            <Link
              href="/staff/login"
              className="inline-flex items-center gap-1 font-semibold text-slate-300 transition-colors hover:text-white"
            >
              Xodimlar portali
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/92 backdrop-blur-md">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="shrink-0">
            <ClinicLogo
              name={clinicName}
              subtitle={settings?.tagline || "Tibbiyot markazi"}
              logoUrl={settings?.logo_url}
            />
          </Link>

          <nav className="hidden items-center gap-8 text-[13.5px] font-semibold text-slate-600 lg:flex">
            {[
              { href: "#bosh-sahifa", label: "Bosh sahifa" },
              { href: "#xizmatlar", label: "Xizmatlar" },
              { href: "#shifokorlar", label: "Shifokorlar" },
              { href: "#chegirmalar", label: "Aksiyalar" },
              { href: "#biz-haqimizda", label: "Klinika haqida" },
              { href: "#aloqa", label: "Aloqa" },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="transition-colors hover:text-[#0B4F8A]"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2.5">
            <Button
              onClick={() => openBookingModal()}
              disabled={!bundle.clinicId || bundle.services.length === 0}
              className="hidden sm:inline-flex"
            >
              Onlayn navbat olish
              <ArrowRight className="h-4 w-4" />
            </Button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="rounded-xl border border-slate-200 p-2 text-slate-700 hover:bg-slate-50 lg:hidden"
              aria-label="Navigatsiya menyusi"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav Drawer */}
        {mobileMenuOpen ? (
          <div className="border-t border-slate-100 bg-white px-4 py-4 shadow-lg lg:hidden">
            <div className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
              {[
                { href: "#bosh-sahifa", label: "Bosh sahifa" },
                { href: "#xizmatlar", label: "Xizmatlar" },
                { href: "#shifokorlar", label: "Shifokorlar" },
                { href: "#chegirmalar", label: "Aksiyalar" },
                { href: "#biz-haqimizda", label: "Klinika haqida" },
                { href: "#aloqa", label: "Aloqa" },
              ].map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-xl px-3 py-2.5 hover:bg-slate-50"
                >
                  {link.label}
                </a>
              ))}
              <div className="mt-2 border-t border-slate-100 pt-3">
                <Button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    openBookingModal();
                  }}
                  disabled={!bundle.clinicId || bundle.services.length === 0}
                  className="w-full"
                >
                  Onlayn navbat olish
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </header>

      {/* Setup Banner when Supabase is not yet configured */}
      {!bundle.configured || !bundle.clinicId ? (
        <div className="mx-auto mt-6 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <p className="font-bold">
              Ma&apos;lumotlar bazasi ulanishi sozlanmagan yoki klinika hali kiritilmagan
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800">
              Ilovani to&apos;liq ishga tushirish uchun <code className="font-mono">.env.local</code>{" "}
              faylini sozlang va migratsiyalarni bajaring.
            </p>
          </div>
        </div>
      ) : null}

      {/* Editorial Hero Section */}
      <section
        id="bosh-sahifa"
        className="relative overflow-hidden border-b border-slate-200/80 bg-white"
      >
        <div className="bg-clinic-grid pointer-events-none absolute inset-0 opacity-70" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 right-0 h-[460px] w-[520px] rounded-full bg-gradient-to-br from-[#0B4F8A]/8 via-teal-500/6 to-transparent blur-3xl"
        />

        <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
            {/* Left Editorial Copy */}
            <div className="lg:col-span-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-200/90 bg-teal-50/80 px-3.5 py-1.5 text-xs font-bold text-teal-800">
                <span className="h-2 w-2 animate-pulse rounded-full bg-teal-500" />
                Hozir {availableDoctorsCount} ta mutaxassis qabulga tayyor
              </div>

              <h1 className="mt-5 text-4xl font-extrabold tracking-[-0.035em] text-[#0A1628] sm:text-5xl lg:text-[52px] lg:leading-[1.08]">
                {settings?.hero_title || "Sizning sog‘lig‘ingiz — bizning ustuvor vazifamiz"}
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-[17px]">
                {settings?.hero_subtitle ||
                  "Zamonaviy diagnostika, tajribali shifokorlar va jonli elektron navbat tizimi bilan kutishlarsiz sifatli tibbiy xizmat."}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                <Button
                  size="lg"
                  onClick={() => openBookingModal()}
                  disabled={!bundle.clinicId || bundle.services.length === 0}
                  className="px-7"
                >
                  Onlayn navbat olish
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="#xizmatlar">Xizmatlar va narxlar</a>
                </Button>
              </div>

              {/* Subtle Trust Indicators */}
              <div className="mt-9 grid grid-cols-3 gap-4 border-t border-slate-200/80 pt-6">
                <div>
                  <p className="text-xs font-bold text-[#0A1628]">Shaffof narxlar</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">Yashirin to&apos;lovlarsiz</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-[#0A1628]">Jonli navbat</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">Telefondan kuzatuv</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-[#0A1628]">Oliy toifali</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {bundle.stats.experienceYears}+ yillik tajriba
                  </p>
                </div>
              </div>
            </div>

            {/* Right Architectural Photo Frame */}
            <div className="lg:col-span-6">
              <div className="relative">
                <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-slate-100 shadow-[0_24px_60px_-20px_rgba(10,22,40,0.22)]">
                  <MediaImage
                    src={settings?.hero_image_url || "/images/clinic-hero.jpg"}
                    fallbackSrc="/images/clinic-hero.jpg"
                    alt={`${clinicName} klinikasi`}
                    width={1200}
                    height={750}
                    priority
                    className="aspect-[16/10] w-full object-cover"
                  />
                </div>

                {/* Floating Frosted Glass Queue Status Card */}
                <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-[0_14px_36px_-12px_rgba(10,22,40,0.18)] backdrop-blur-md sm:absolute sm:right-5 sm:bottom-5 sm:left-5 sm:mt-0">
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0B4F8A] text-white">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#0A1628]">
                        Elektron navbat tizimi faol
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Onlayn ro&apos;yxatdan o&apos;ting va navbatingizni real vaqtda kuzating
                      </p>
                    </div>
                  </div>
                  <div className="hidden shrink-0 text-right sm:block">
                    <p className="text-lg font-extrabold tracking-tight text-[#0B4F8A] tabular-nums">
                      {bundle.stats.positiveRate}%
                    </p>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Mamnunlik
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Architectural Unified Statistics Strip */}
      <section className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        <div className="grid divide-y divide-slate-200/80 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_4px_20px_-10px_rgba(10,22,40,0.08)] sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
          {[
            {
              value: `${formatCompactNumber(bundle.stats.doctorsCount)}+`,
              label: "Tajribali shifokorlar",
              sub: "Oliy toifali mutaxassislar",
            },
            {
              value: `${formatCompactNumber(bundle.stats.servicesCount)}+`,
              label: "Tibbiy xizmat turlari",
              sub: "Diagnostika va davolash",
            },
            {
              value: `${formatCompactNumber(bundle.stats.patientsCount)}+`,
              label: "Ishonch bildirgan bemorlar",
              sub: "Yagona elektron karta",
            },
            {
              value: `${bundle.stats.experienceYears} yil`,
              label: "Klinik tajriba",
              sub: `${bundle.stats.positiveRate}% ijobiy baholar`,
            },
          ].map((stat) => (
            <div key={stat.label} className="p-6">
              <p className="text-3xl font-extrabold tracking-[-0.03em] text-[#0A1628] tabular-nums">
                {stat.value}
              </p>
              <p className="mt-1.5 text-sm font-bold text-slate-800">{stat.label}</p>
              <p className="mt-0.5 text-xs text-slate-500">{stat.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 3-Step Online Queue Process */}
      <section className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0B4F8A]">
              Qulay qabul jarayoni
            </p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-[-0.025em] text-[#0A1628]">
              Elektron navbat 3 oddiy qadamda
            </h2>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => openBookingModal()}
            disabled={!bundle.clinicId || bundle.services.length === 0}
          >
            Hozir yozilish
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            {
              step: "01",
              title: "Xizmat va shifokorni tanlang",
              desc: "Shaffof narxlar, aksiyalar va shifokorlarning joriy bandligini oldindan ko'ring.",
            },
            {
              step: "02",
              title: "Shaxsiy chipta raqamini oling",
              desc: "Bir necha soniyada navbat raqami va maxfiy jonli kuzatuv havolasi yaratiladi.",
            },
            {
              step: "03",
              title: "Jonli kuzatib, vaqtida keling",
              desc: "Oldingizdagi bemorlar sonini telefonda kuzating va klinika zalida ortiqcha kutmang.",
            },
          ].map((item) => (
            <div
              key={item.step}
              className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(10,22,40,0.03)] transition-all hover:border-[#0B4F8A]/30 hover:shadow-md"
            >
              <span className="inline-flex h-8 w-10 items-center justify-center rounded-lg bg-[#EDF4FA] text-xs font-extrabold tracking-wider text-[#0B4F8A] tabular-nums">
                {item.step}
              </span>
              <h3 className="mt-4 text-base font-bold tracking-[-0.015em] text-[#0A1628]">
                {item.title}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Medical Services Section */}
      <section id="xizmatlar" className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0B4F8A]">
              Yo&apos;nalishlar va narxlar
            </p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-[-0.03em] text-[#0A1628] sm:text-3xl">
              Tibbiy xizmatlarimiz
            </h2>
            <p className="mt-1.5 text-sm text-slate-500">
              Har bir xizmat uchun aniq narxlar, qabul davomiyligi va tezkor onlayn navbat
            </p>
          </div>
          {serviceCategories.length > 2 ? (
            <div className="flex flex-wrap gap-2">
              {serviceCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedServiceCategory(cat)}
                  className={`cursor-pointer rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                    selectedServiceCategory === cat
                      ? "bg-[#0A1628] text-white shadow-xs"
                      : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-[#0A1628]"
                  }`}
                >
                  {cat === "all" ? "Barchasi" : cat}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredServices.map((service) => {
            const Icon = SERVICE_ICON_MAP[service.icon_name] ?? Stethoscope;
            const assignedDoctorsCount = bundle.doctors.filter((d) =>
              d.doctor_services?.some((ds) => ds.service_id === service.id && ds.is_active)
            ).length;
            const promo =
              bundle.promotions.find((p) => p.service_id === service.id) ?? null;
            const discountInfo = promo
              ? calculatePromotionDiscount(Number(service.price), promo)
              : null;

            return (
              <div
                key={service.id}
                className="group flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(10,22,40,0.03)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#0B4F8A]/35 hover:shadow-[0_14px_34px_-16px_rgba(10,22,40,0.14)]"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    {service.image_url ? (
                      <MediaImage
                        src={service.image_url}
                        alt={service.name}
                        width={48}
                        height={48}
                        className="h-12 w-12 rounded-xl object-cover ring-1 ring-slate-200/80"
                      />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EDF4FA] text-[#0B4F8A] transition-colors duration-200 group-hover:bg-[#0B4F8A] group-hover:text-white">
                        <Icon className="h-5 w-5" />
                      </div>
                    )}
                    <div className="flex flex-col items-end gap-1">
                      {promo ? (
                        <Badge variant="success">
                          {promo.discount_type === "percentage"
                            ? `-${Number(promo.discount_value)}%`
                            : `-${formatUZS(promo.discount_value)}`}
                        </Badge>
                      ) : (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                          {service.duration_minutes} daq
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {service.category}
                  </p>
                  <h3 className="mt-1 text-lg font-bold tracking-[-0.015em] text-[#0A1628]">
                    {service.name}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-500">
                    {service.description ||
                      "Malakali mutaxassislar tomonidan ko'rsatiladigan tibbiy xizmat."}
                  </p>
                </div>

                <div className="mt-6 border-t border-slate-100 pt-4">
                  <div className="flex items-end justify-between gap-2">
                    <div className="tabular-nums">
                      {discountInfo && discountInfo.discountAmount > 0 ? (
                        <div className="flex flex-col">
                          <span className="text-[11px] text-slate-400 line-through">
                            {formatUZS(service.price)}
                          </span>
                          <span className="text-base font-extrabold text-[#0B4F8A]">
                            {formatUZS(discountInfo.finalPrice)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-base font-extrabold text-[#0A1628]">
                          {formatUZS(service.price)}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-medium text-slate-500">
                      {assignedDoctorsCount} shifokor
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => openBookingModal({ serviceId: service.id })}
                    disabled={assignedDoctorsCount === 0}
                    className="mt-4 inline-flex w-full cursor-pointer items-center justify-between rounded-xl border border-slate-200/90 bg-slate-50/70 px-3.5 py-2 text-xs font-bold text-[#0A1628] transition-all group-hover:border-[#0B4F8A]/30 group-hover:bg-[#EDF4FA] group-hover:text-[#0B4F8A] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span>Navbat olish</span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Doctors Section — Editorial Specialist Portraits */}
      <section id="shifokorlar" className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0B4F8A]">
              Tibbiy jamoa
            </p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-[-0.03em] text-[#0A1628] sm:text-3xl">
              Tajribali shifokorlarimiz
            </h2>
            <p className="mt-1.5 text-sm text-slate-500">
              O&apos;zingizga mos mutaxassisni tanlang va to&apos;g&apos;ridan-to&apos;g&apos;ri
              qabulga yoziling
            </p>
          </div>

          {bundle.doctors.length > 2 ? (
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute top-3 left-3.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={doctorSearch}
                onChange={(e) => setDoctorSearch(e.target.value)}
                placeholder="Shifokor yoki mutaxassislik..."
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pr-3.5 pl-10 text-sm text-[#0A1628] shadow-xs placeholder:text-slate-400 focus:border-[#0B4F8A] focus:ring-3 focus:ring-[#0B4F8A]/12 focus:outline-none"
              />
            </div>
          ) : null}
        </div>

        {doctorSpecializations.length > 2 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {doctorSpecializations.map((spec) => (
              <button
                key={spec}
                type="button"
                onClick={() => setSelectedSpecialization(spec)}
                className={`cursor-pointer rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                  selectedSpecialization === spec
                    ? "bg-[#0A1628] text-white shadow-xs"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-[#0A1628]"
                }`}
              >
                {spec === "all" ? "Barcha mutaxassislar" : spec}
              </button>
            ))}
          </div>
        ) : null}

        {filteredDoctors.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
            Qidiruv bo&apos;yicha shifokor topilmadi. Filtrni tozalab qayta urinib ko&apos;ring.
          </div>
        ) : (
          <div
            className={`mt-8 grid gap-6 md:grid-cols-2 ${
              filteredDoctors.length === 4 ? "xl:grid-cols-4" : "lg:grid-cols-3"
            }`}
          >
            {filteredDoctors.map((doctor, index) => {
              const workingDays = (doctor.doctor_schedules ?? [])
                .filter((s) => s.is_working)
                .sort((a, b) => a.day_of_week - b.day_of_week);
              const scheduleSummary =
                workingDays.length > 0
                  ? `${DAYS_OF_WEEK_UZ[workingDays[0].day_of_week].slice(0, 2)}–${DAYS_OF_WEEK_UZ[
                      workingDays[workingDays.length - 1].day_of_week
                    ].slice(0, 2)} • ${workingDays[0].start_time.slice(0, 5)}–${workingDays[0].end_time.slice(0, 5)}`
                  : "Jadval bo'yicha";

              const fallbackPhoto = getDoctorFallbackPhoto(doctor.full_name, index);

              return (
                <div
                  key={doctor.id}
                  className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(10,22,40,0.03)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#0B4F8A]/35 hover:shadow-[0_16px_38px_-18px_rgba(10,22,40,0.16)]"
                >
                  <div>
                    {/* Editorial Doctor Portrait Header */}
                    <div className="relative h-56 w-full overflow-hidden bg-slate-100">
                      <MediaImage
                        src={doctor.photo_url || fallbackPhoto}
                        fallbackSrc={fallbackPhoto}
                        alt={doctor.full_name}
                        width={520}
                        height={520}
                        className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0A1628]/60 via-[#0A1628]/15 to-transparent" />

                      {/* Status Pill */}
                      <span
                        className={`absolute top-3.5 left-3.5 rounded-full border px-2.5 py-1 text-[11px] font-bold backdrop-blur-md ${
                          DOCTOR_AVAILABILITY_CLASSES[doctor.availability_status]
                        }`}
                      >
                        {DOCTOR_AVAILABILITY_LABELS[doctor.availability_status]}
                      </span>

                      {/* Rating Pill */}
                      <span className="absolute top-3.5 right-3.5 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-[#0A1628] shadow-xs backdrop-blur-md tabular-nums">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        {Number(doctor.rating).toFixed(1)}
                        <span className="font-medium text-slate-400">
                          ({doctor.reviews_count})
                        </span>
                      </span>
                    </div>

                    <div className="p-6 pb-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-[#0B4F8A]">
                        {doctor.specialization}
                      </p>
                      <h3 className="mt-1 text-lg font-extrabold tracking-[-0.015em] text-[#0A1628]">
                        {doctor.full_name}
                      </h3>
                      <p className="mt-0.5 text-xs font-medium text-slate-500">
                        {doctor.experience_years} yillik klinik tajriba
                        {doctor.room?.room_number ? ` • ${doctor.room.room_number}-kabinet` : ""}
                      </p>

                      {doctor.biography ? (
                        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-500">
                          {doctor.biography}
                        </p>
                      ) : null}

                      <div className="mt-3.5 flex flex-wrap gap-1.5">
                        {(doctor.doctor_services ?? [])
                          .filter((ds) => ds.is_active && ds.service)
                          .map((ds) => (
                            <span
                              key={ds.id}
                              className="rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700"
                            >
                              {ds.service?.name}
                            </span>
                          ))}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] text-slate-500">{scheduleSummary}</p>
                        <p className="mt-0.5 text-sm font-extrabold text-[#0A1628] tabular-nums">
                          {formatUZS(doctor.consultation_price)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => openBookingModal({ doctorId: doctor.id })}
                      >
                        Navbat olish
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Executive Promotions Feature Banner */}
      {bundle.promotions.length > 0 ? (
        <section id="chegirmalar" className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 lg:px-8">
          <div className="space-y-5">
            {bundle.promotions.map((promo) => (
              <div
                key={promo.id}
                className="relative overflow-hidden rounded-3xl border border-slate-800 bg-[#09172B] text-white shadow-[0_24px_60px_-24px_rgba(9,23,43,0.55)]"
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-teal-500/20 blur-3xl"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute right-0 bottom-0 h-72 w-72 rounded-full bg-[#0B4F8A]/35 blur-3xl"
                />

                <div className="relative grid items-center gap-8 p-7 sm:p-10 lg:grid-cols-12 lg:p-12">
                  <div className="lg:col-span-7">
                    <div className="inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-400/10 px-3.5 py-1 text-xs font-bold text-teal-300">
                      <Sparkles className="h-3.5 w-3.5" />
                      Maxsus taklif •{" "}
                      {promo.discount_type === "percentage"
                        ? `${Number(promo.discount_value)}% chegirma`
                        : `${formatUZS(promo.discount_value)} chegirma`}
                      {promo.service ? ` • ${promo.service.name}` : ""}
                    </div>
                    <h2 className="mt-4 text-2xl font-extrabold tracking-[-0.025em] text-white sm:text-4xl sm:leading-[1.15]">
                      {promo.title}
                    </h2>
                    {promo.description ? (
                      <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
                        {promo.description}
                      </p>
                    ) : null}
                    <div className="mt-6 flex flex-wrap items-center gap-4">
                      <Button
                        size="lg"
                        onClick={() =>
                          openBookingModal({ serviceId: promo.service_id ?? null })
                        }
                        className="bg-white text-[#0A1628] hover:bg-slate-100"
                      >
                        Aksiya bilan yozilish
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                      <span className="text-xs font-semibold text-slate-400 tabular-nums">
                        Amal qilish muddati: {formatDateDDMMYYYY(promo.ends_at)} gacha
                      </span>
                    </div>
                  </div>

                  <div className="lg:col-span-5">
                    <div className="overflow-hidden rounded-2xl border border-white/12 bg-white/5 shadow-2xl">
                      <MediaImage
                        src={promo.image_url || "/images/promo-dental.jpg"}
                        fallbackSrc="/images/promo-dental.jpg"
                        alt={promo.title}
                        width={640}
                        height={480}
                        className="aspect-[4/3] w-full object-cover"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* About the Clinic — Architectural Split */}
      <section id="biz-haqimizda" className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-slate-200/80 bg-white p-7 shadow-[0_4px_24px_-12px_rgba(10,22,40,0.08)] sm:p-10 lg:p-12">
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0B4F8A]">
                Biz haqimizda
              </p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.03em] text-[#0A1628] sm:text-3xl">
                {settings?.about_title || "Klinikamiz haqida"}
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-slate-600">
                {settings?.about_description ||
                  "Zamonaviy diagnostika va davolash uskunalariga ega xususiy tibbiyot markazi."}
              </p>

              <div className="mt-6 rounded-2xl border-l-4 border-[#0B4F8A] bg-[#F4F8FC] p-5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#0B4F8A]">
                  Bizning missiyamiz
                </p>
                <p className="mt-1.5 text-sm font-semibold leading-relaxed text-[#0A1628]">
                  {settings?.mission ||
                    "Har bir bemorga xavfsiz, tezkor va shaffof tibbiy xizmat ko'rsatish."}
                </p>
              </div>

              <div className="mt-6 space-y-2.5 border-t border-slate-100 pt-5 text-xs text-slate-600">
                <p>
                  <span className="font-bold text-[#0A1628]">Uskunalar: </span>
                  {settings?.equipment_summary ||
                    "Zamonaviy UZI, laboratoriya va stomatologik uskunalar."}
                </p>
                <p className="flex items-center gap-2 font-semibold text-[#0A1628]">
                  <CalendarClock className="h-4 w-4 text-[#0B4F8A]" />
                  {settings?.working_hours_summary || "Dushanba - Shanba: 08:00 - 20:00"}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
              {(settings?.advantages ?? []).map((adv, idx) => {
                const Icon = SERVICE_ICON_MAP[adv.icon] ?? CheckCircle2;
                return (
                  <div
                    key={`${adv.title}-${idx}`}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-[#F9FBFE] p-6 transition-all hover:border-[#0B4F8A]/30 hover:bg-white hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B4F8A] text-white shadow-xs">
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="text-xs font-extrabold text-slate-300 tabular-nums">
                        0{idx + 1}
                      </span>
                    </div>
                    <div className="mt-5">
                      <h3 className="text-base font-bold text-[#0A1628]">{adv.title}</h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                        {adv.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Executive Footer */}
      <footer id="aloqa" className="mt-20 bg-[#081120] text-slate-300">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid gap-10 md:grid-cols-12">
            <div className="md:col-span-4">
              <ClinicLogo
                name={clinicName}
                subtitle={settings?.tagline || "Tibbiyot markazi"}
                logoUrl={settings?.logo_url}
                dark
              />
              <p className="mt-4 max-w-xs text-xs leading-relaxed text-slate-400">
                Elektron navbat va shaffof xizmat tizimi bilan vaqtingizni tejang va yuqori
                sifatli tibbiy ko&apos;rikdan o&apos;ting.
              </p>
            </div>

            <div className="space-y-3 text-xs md:col-span-2">
              <p className="font-bold uppercase tracking-[0.12em] text-slate-500">
                Bo&apos;limlar
              </p>
              <ul className="space-y-2.5 text-slate-300">
                <li>
                  <a href="#xizmatlar" className="transition-colors hover:text-white">
                    Xizmatlar
                  </a>
                </li>
                <li>
                  <a href="#shifokorlar" className="transition-colors hover:text-white">
                    Shifokorlar
                  </a>
                </li>
                <li>
                  <a href="#chegirmalar" className="transition-colors hover:text-white">
                    Aksiyalar
                  </a>
                </li>
                <li>
                  <a href="#biz-haqimizda" className="transition-colors hover:text-white">
                    Biz haqimizda
                  </a>
                </li>
              </ul>
            </div>

            <div className="space-y-3 text-xs md:col-span-3">
              <p className="font-bold uppercase tracking-[0.12em] text-slate-500">
                Aloqa
              </p>
              <p className="flex items-start gap-2.5 text-slate-300">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-teal-400" />
                <span>{settings?.address || "Toshkent shahri"}</span>
              </p>
              <p className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 shrink-0 text-teal-400" />
                <a
                  href={`tel:${settings?.phone || ""}`}
                  className="font-semibold text-white hover:text-teal-300 tabular-nums"
                >
                  {settings?.phone || "+998 71 200 00 00"}
                </a>
              </p>
              <p className="flex items-center gap-2.5 text-slate-400">
                <Clock className="h-4 w-4 shrink-0 text-teal-400" />
                <span>{settings?.working_hours_summary || "08:00 - 20:00"}</span>
              </p>
            </div>

            <div className="space-y-3 text-xs md:col-span-3">
              <p className="font-bold uppercase tracking-[0.12em] text-slate-500">
                Tizimga kirish va havolalar
              </p>
              <div className="flex flex-wrap gap-2">
                {settings?.map_link ? (
                  <a
                    href={settings.map_link}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-white/12 px-3 py-1.5 font-medium text-slate-200 transition-colors hover:bg-white/10"
                  >
                    Google Xarita
                  </a>
                ) : null}
                {settings?.social_links?.telegram ? (
                  <a
                    href={settings.social_links.telegram}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-white/12 px-3 py-1.5 font-medium text-slate-200 transition-colors hover:bg-white/10"
                  >
                    Telegram
                  </a>
                ) : null}
                {settings?.social_links?.instagram ? (
                  <a
                    href={settings.social_links.instagram}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-white/12 px-3 py-1.5 font-medium text-slate-200 transition-colors hover:bg-white/10"
                  >
                    Instagram
                  </a>
                ) : null}
              </div>
              <div className="pt-2">
                <Link
                  href="/staff/login"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-teal-400/25 bg-teal-400/10 px-3.5 py-2 font-semibold text-teal-300 transition-colors hover:bg-teal-400/20 hover:text-white"
                >
                  Xodimlar portali
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-slate-500">
            <span>
              © {new Date().getFullYear()} {clinicName}. Barcha huquqlar himoyalangan.
            </span>
            <span>Elektron navbat va klinika boshqaruvi platformasi</span>
          </div>
        </div>
      </footer>

      <OnlineQueueModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        clinicId={bundle.clinicId}
        services={bundle.services}
        doctors={bundle.doctors}
        promotions={bundle.promotions}
        initialServiceId={preselectedServiceId}
        initialDoctorId={preselectedDoctorId}
        onTicketCreated={() => setActiveTicket(loadActiveTicket())}
      />
    </div>
  );
}
