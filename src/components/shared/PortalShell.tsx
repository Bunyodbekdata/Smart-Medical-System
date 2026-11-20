"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Building2,
  CalendarClock,
  Clock,
  CreditCard,
  FileText,
  Home,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Menu,
  Percent,
  Settings,
  ShieldCheck,
  Stethoscope,
  UserCheck,
  Users,
  Wallet,
  WifiOff,
  X,
} from "lucide-react";
import { ClinicLogo } from "./ClinicLogo";
import { formatDateDDMMYYYY, formatTimeHHMM } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/database";
import { ROLE_LABELS } from "@/lib/uz-labels";

export type PortalIconKey =
  | "home"
  | "dashboard"
  | "patients"
  | "queue"
  | "payments"
  | "reports"
  | "services"
  | "promotions"
  | "settings"
  | "earnings"
  | "doctors"
  | "employees"
  | "finance"
  | "audit"
  | "schedule";

const ICON_MAP: Record<PortalIconKey, React.ComponentType<{ className?: string }>> = {
  home: Home,
  dashboard: LayoutDashboard,
  patients: Users,
  queue: ListOrdered,
  payments: CreditCard,
  reports: BarChart3,
  services: Stethoscope,
  promotions: Percent,
  settings: Settings,
  earnings: Wallet,
  doctors: UserCheck,
  employees: Building2,
  finance: Activity,
  audit: ShieldCheck,
  schedule: CalendarClock,
};

export interface NavItem {
  href: string;
  label: string;
  icon: PortalIconKey;
}

interface PortalShellProps {
  clinicName: string;
  clinicLogoUrl?: string | null;
  portalSubtitle: string;
  userName: string;
  userRole: UserRole;
  userSubtext?: string;
  navItems: NavItem[];
  children: React.ReactNode;
}

export function PortalShell({
  clinicName,
  clinicLogoUrl,
  portalSubtitle,
  userName,
  userRole,
  userSubtext,
  navItems,
  children,
}: PortalShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [nowClock, setNowClock] = useState<{ time: string; date: string } | null>(null);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setNowClock({
        time: formatTimeHHMM(now),
        date: formatDateDDMMYYYY(now),
      });
    };
    updateClock();
    const timer = window.setInterval(updateClock, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const syncOnline = () => setIsOnline(navigator.onLine);
    syncOnline();
    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);
    return () => {
      window.removeEventListener("online", syncOnline);
      window.removeEventListener("offline", syncOnline);
    };
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/staff/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  const isInAdminPortal = pathname.startsWith("/admin");
  const canSwitchPortal = userRole === "super_admin";

  const activeNavItem = navItems.find((item) => {
    const isExactRoot =
      item.href === "/admin" || item.href === "/doctor" || item.href === "/super-admin";
    return isExactRoot
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
  });

  const renderSidebarContent = () => (
    <div className="relative flex h-full flex-col overflow-hidden border-r border-slate-800/80 bg-[#081222] text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-20 -right-20 h-44 w-44 rounded-full bg-[#0B4F8A]/30 blur-3xl"
      />
      <div className="relative flex items-center justify-between border-b border-white/10 px-5 py-5">
        <ClinicLogo
          name={clinicName}
          subtitle={portalSubtitle}
          logoUrl={clinicLogoUrl}
          dark
        />
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="Menyuni yopish"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative px-5 pt-5 pb-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Ishchi bo&apos;limlar
        </p>
      </div>

      <nav className="relative flex-1 space-y-1 overflow-y-auto px-3 pb-4" aria-label="Asosiy navigatsiya">
        {navItems.map((item) => {
          const Icon = ICON_MAP[item.icon] ?? FileText;
          const isExactRoot =
            item.href === "/admin" ||
            item.href === "/doctor" ||
            item.href === "/super-admin";
          const active = isExactRoot
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-semibold transition-all duration-150",
                active
                  ? "bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                  : "text-slate-400 hover:bg-white/6 hover:text-slate-100"
              )}
            >
              {active ? (
                <span className="absolute top-2 bottom-2 left-0 w-1 rounded-r-full bg-teal-400" />
              ) : null}
              <Icon
                className={cn(
                  "h-4.5 w-4.5 shrink-0",
                  active ? "text-teal-300" : "text-slate-400"
                )}
              />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="relative space-y-1 border-t border-white/10 bg-[#060E1B]/70 p-3">
        {canSwitchPortal ? (
          <Link
            href={isInAdminPortal ? "/super-admin" : "/admin"}
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2.5 rounded-xl border border-teal-400/20 bg-teal-400/10 px-3.5 py-2 text-xs font-semibold text-teal-300 transition-colors hover:bg-teal-400/18 hover:text-white"
          >
            <ArrowLeftRight className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {isInAdminPortal ? "Super Admin paneli" : "Qabulxona (Admin)"}
            </span>
          </Link>
        ) : null}
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-400 transition-colors hover:bg-white/6 hover:text-white"
        >
          <Home className="h-4 w-4 shrink-0" />
          <span>Ommaviy saytga o&apos;tish</span>
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/15 hover:text-rose-200 disabled:opacity-50"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>{loggingOut ? "Chiqilmoqda..." : "Tizimdan chiqish"}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#F5F8FC]">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden w-66 shrink-0 lg:block">
        <div className="sticky top-0 h-screen">{renderSidebarContent()}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen ? (
        <div className="no-print fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-[#0A1628]/55 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 h-full w-68 shadow-2xl">
            {renderSidebarContent()}
          </div>
        </div>
      ) : null}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/92 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 lg:hidden"
              aria-label="Menyuni ochish"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="hidden items-center gap-2 text-xs sm:flex">
              <span className="font-semibold text-slate-400">{portalSubtitle}</span>
              <span className="text-slate-300">/</span>
              <span className="font-bold text-[#0A1628]">
                {activeNavItem?.label || "Asosiy sahifa"}
              </span>
            </div>

            {isOnline ? (
              <div className="hidden items-center gap-1.5 rounded-full border border-teal-200/90 bg-teal-50/80 px-2.5 py-0.5 text-[11px] font-semibold text-teal-800 xl:inline-flex">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-500" />
                Jonli rejim
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                <WifiOff className="h-3.5 w-3.5" />
                Oflayn
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {nowClock ? (
              <div className="hidden items-center gap-1.5 rounded-xl border border-slate-200/80 bg-[#F8FAFC] px-3 py-1.5 text-xs font-semibold text-slate-700 tabular-nums md:inline-flex">
                <Clock className="h-3.5 w-3.5 text-[#0B4F8A]" />
                <span>{nowClock.time}</span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-500">{nowClock.date}</span>
              </div>
            ) : null}

            <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white px-2.5 py-1.5 shadow-[0_1px_2px_rgba(10,22,40,0.03)]">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#0B4F8A] to-[#0E7490] text-xs font-bold text-white shadow-xs">
                {userName
                  .split(" ")
                  .filter(Boolean)
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </div>
              <div className="hidden pr-1 text-left sm:block">
                <p className="text-xs leading-tight font-bold text-[#0A1628]">{userName}</p>
                <p className="text-[11px] leading-tight font-medium text-slate-500">
                  {userSubtext || ROLE_LABELS[userRole]}
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1440px] animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
