import React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatTone = "sapphire" | "teal" | "amber" | "rose" | "slate" | "featured";

interface StaffStatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: LucideIcon;
  tone?: StatTone;
  compact?: boolean;
  className?: string;
}

const ICON_TONE_CLASSES: Record<Exclude<StatTone, "featured">, string> = {
  sapphire: "bg-[#EDF4FA] text-[#0B4F8A] ring-1 ring-[#D4E4F4]",
  teal: "bg-teal-50 text-teal-700 ring-1 ring-teal-200/70",
  amber: "bg-amber-50 text-amber-700 ring-1 ring-amber-200/70",
  rose: "bg-rose-50 text-rose-700 ring-1 ring-rose-200/70",
  slate: "bg-slate-100 text-slate-700 ring-1 ring-slate-200/80",
};

const VALUE_TONE_CLASSES: Record<Exclude<StatTone, "featured">, string> = {
  sapphire: "text-[#0A1628]",
  teal: "text-teal-800",
  amber: "text-[#0A1628]",
  rose: "text-rose-700",
  slate: "text-[#0A1628]",
};

export function StaffStatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "sapphire",
  compact = false,
  className,
}: StaffStatCardProps) {
  if (tone === "featured") {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-[#091426] via-[#0C2544] to-[#0B4F8A] text-white shadow-[0_14px_34px_-16px_rgba(9,20,38,0.55)]",
          compact ? "p-4" : "p-5",
          className
        )}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-teal-400/20 blur-2xl"
        />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-sky-200/85">
              {label}
            </p>
            <p
              className={cn(
                "mt-2 font-extrabold tracking-[-0.025em] text-white tabular-nums",
                compact ? "text-lg" : "text-2xl"
              )}
            >
              {value}
            </p>
            {hint ? (
              <p className="mt-1 truncate text-[11px] font-medium text-sky-100/75">{hint}</p>
            ) : null}
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/12 text-teal-300 ring-1 ring-white/15">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(10,22,40,0.03),0_8px_20px_-14px_rgba(10,22,40,0.08)] transition-all duration-150 hover:border-slate-300/90",
        compact ? "p-4" : "p-5",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            {label}
          </p>
          <p
            className={cn(
              "mt-2 font-extrabold tracking-[-0.025em] tabular-nums",
              compact ? "text-lg" : "text-2xl",
              VALUE_TONE_CLASSES[tone]
            )}
          >
            {value}
          </p>
          {hint ? (
            <p className="mt-1 truncate text-[11px] font-medium text-slate-400">{hint}</p>
          ) : null}
        </div>
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            ICON_TONE_CLASSES[tone]
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
