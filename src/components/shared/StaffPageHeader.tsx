import React from "react";
import { cn } from "@/lib/utils";

interface StaffPageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function StaffPageHeader({
  eyebrow,
  title,
  description,
  badge,
  actions,
  className,
}: StaffPageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between gap-4 border-b border-slate-200/80 pb-5 sm:flex-row sm:items-end",
        className
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0B4F8A]">
            {eyebrow}
          </p>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-extrabold tracking-[-0.03em] text-[#0A1628] sm:text-[26px]">
            {title}
          </h1>
          {badge}
        </div>
        {description ? (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        ) : null}
      </div>

      {actions ? (
        <div className="no-print flex flex-wrap items-center gap-2.5">{actions}</div>
      ) : null}
    </div>
  );
}
