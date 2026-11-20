import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "danger" | "info" | "neutral";
}

const VARIANT_CLASSES: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "bg-[#EDF4FA] text-[#0B4F8A] border-[#CFE1F2]",
  success: "bg-teal-50 text-teal-800 border-teal-200/80",
  warning: "bg-amber-50 text-amber-800 border-amber-200/80",
  danger: "bg-rose-50 text-rose-700 border-rose-200/80",
  info: "bg-sky-50 text-sky-800 border-sky-200/80",
  neutral: "bg-slate-100/90 text-slate-700 border-slate-200/80",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-[-0.005em]",
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    />
  );
}
