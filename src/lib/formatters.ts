const TASHKENT_TZ = "Asia/Tashkent";

export function formatUZS(amount: number | string | null | undefined): string {
  const num = Number(amount ?? 0);
  if (!Number.isFinite(num)) return "0 so'm";
  const rounded = Math.round(num);
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  })
    .format(rounded)
    .replace(/,/g, " ");
  return `${formatted} so'm`;
}

export function formatCompactNumber(value: number | string | null | undefined): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  })
    .format(Math.round(num))
    .replace(/,/g, " ");
}

export function formatDateDDMMYYYY(input: string | Date | null | undefined): string {
  if (!input) return "—";
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, d] = input.split("-");
    return `${d}.${m}.${y}`;
  }
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TASHKENT_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const year = parts.find((p) => p.type === "year")?.value ?? "2026";
  return `${day}.${month}.${year}`;
}

export function formatTimeHHMM(input: string | Date | null | undefined): string {
  if (!input) return "—";
  if (typeof input === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(input)) {
    return input.slice(0, 5);
  }
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TASHKENT_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatDateTimeUZ(input: string | Date | null | undefined): string {
  if (!input) return "—";
  return `${formatDateDDMMYYYY(input)} ${formatTimeHHMM(input)}`;
}

export function getTashkentDateString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TASHKENT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "2026";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function normalizeUzPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function formatUzPhone(phone: string): string {
  const digits = normalizeUzPhone(phone);
  if (digits.length === 12 && digits.startsWith("998")) {
    return `+998 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10, 12)}`;
  }
  if (digits.length === 9) {
    return `+998 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
  }
  return phone;
}

/**
 * Progressive phone input formatter for Uzbekistan numbers (+998 XX XXX XX XX).
 */
export function formatUzPhoneInput(raw: string): string {
  const digits = normalizeUzPhone(raw);
  if (!digits) return "+998 ";

  const local = digits.startsWith("998") ? digits.slice(3, 12) : digits.slice(0, 9);
  const parts: string[] = ["+998"];
  if (local.length > 0) parts.push(local.slice(0, 2));
  if (local.length > 2) parts.push(local.slice(2, 5));
  if (local.length > 5) parts.push(local.slice(5, 7));
  if (local.length > 7) parts.push(local.slice(7, 9));

  return parts.length === 1 ? "+998 " : parts.join(" ");
}

/**
 * Compact UZS label for chart Y-axes (e.g. 1.5 mln, 250 ming, 0).
 */
export function formatShortUZS(value: number | string | null | undefined): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num) || num === 0) return "0";
  const abs = Math.abs(num);
  const sign = num < 0 ? "-" : "";
  if (abs >= 1_000_000_000) {
    return `${sign}${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, "")} mlrd`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")} mln`;
  }
  if (abs >= 1_000) {
    return `${sign}${Math.round(abs / 1_000)} ming`;
  }
  return `${sign}${Math.round(abs)}`;
}

/**
 * Sanitizes user search text before interpolation into PostgREST .or() filter expressions.
 */
export function sanitizePostgrestFilter(input: string): string {
  return input
    .replace(/[,()\\*%]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

/**
 * Validates that an optional post-login `next` path is an internal path
 * allowed for the authenticated role, preventing open redirects and cross-role loops.
 */
export function getSafeRedirectPath(
  nextPath: string | null | undefined,
  role: "super_admin" | "admin" | "doctor"
): string {
  const fallback = getRoleHomeRoute(role);
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return fallback;
  }

  const cleanPath = nextPath.split("?")[0] ?? "";
  if (role === "super_admin" && (cleanPath.startsWith("/super-admin") || cleanPath.startsWith("/admin"))) {
    return nextPath;
  }
  if (role === "admin" && cleanPath.startsWith("/admin")) {
    return nextPath;
  }
  if (role === "doctor" && cleanPath.startsWith("/doctor")) {
    return nextPath;
  }
  return fallback;
}

/**
 * Escapes and joins rows into UTF-8 BOM CSV text so Excel opens Cyrillic/Uzbek cleanly.
 */
export function buildCsvContent(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>
): string {
  const escapeCell = (val: string | number | null | undefined) => {
    const str = String(val ?? "");
    // Guard against spreadsheet formula injection (=, +, -, @)
    const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const lines = [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => row.map(escapeCell).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}

export function getRoleHomeRoute(role: "super_admin" | "admin" | "doctor"): string {
  switch (role) {
    case "super_admin":
      return "/super-admin";
    case "admin":
      return "/admin";
    case "doctor":
      return "/doctor";
  }
}

export function parseSafeInt(
  value: string | null | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export function parseIsoDateOrDefault(
  value: string | null | undefined,
  fallback: string = getTashkentDateString()
): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return fallback;
  const probe = new Date(`${trimmed}T00:00:00+05:00`);
  if (Number.isNaN(probe.getTime())) return fallback;
  return trimmed;
}
