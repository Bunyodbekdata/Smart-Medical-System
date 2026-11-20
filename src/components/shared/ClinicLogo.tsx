import { cn } from "@/lib/utils";
import { MediaImage } from "./MediaImage";

interface ClinicLogoProps {
  name?: string;
  subtitle?: string;
  logoUrl?: string | null;
  dark?: boolean;
  className?: string;
}

export function ClinicLogo({
  name = "MedClinic",
  subtitle,
  logoUrl,
  dark = false,
  className,
}: ClinicLogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {logoUrl ? (
        <MediaImage
          src={logoUrl}
          alt={name}
          width={38}
          height={38}
          className="h-9.5 w-9.5 shrink-0 rounded-xl object-cover ring-1 ring-slate-200/80"
        />
      ) : (
        <div
          className={cn(
            "relative flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-xl shadow-xs",
            dark
              ? "bg-gradient-to-br from-[#1465A8] to-[#0D9488] text-white ring-1 ring-white/15"
              : "bg-gradient-to-br from-[#0B4F8A] to-[#0E7490] text-white shadow-[0_4px_12px_-3px_rgba(11,79,138,0.45)]"
          )}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            aria-hidden="true"
          >
            <rect x="10" y="4" width="4" height="16" rx="1.5" fill="currentColor" />
            <rect x="4" y="10" width="16" height="4" rx="1.5" fill="currentColor" />
            <circle cx="18.5" cy="5.5" r="2" fill="#5EEAD4" />
          </svg>
        </div>
      )}
      <div className="min-w-0">
        <span
          className={cn(
            "block truncate text-[16px] font-extrabold tracking-[-0.025em] leading-tight",
            dark ? "text-white" : "text-[#0A1628]"
          )}
        >
          {name}
        </span>
        {subtitle ? (
          <span
            className={cn(
              "mt-0.5 block truncate text-[11px] font-medium leading-tight",
              dark ? "text-slate-400" : "text-slate-500"
            )}
          >
            {subtitle}
          </span>
        ) : null}
      </div>
    </div>
  );
}
