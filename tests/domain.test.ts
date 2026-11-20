import { describe, expect, it } from "vitest";
import {
  calculateDoctorCommission,
  selectBestCommissionRule,
  summarizeClinicFinances,
} from "@/lib/domain/finance-rules";
import {
  calculatePromotionDiscount,
  computeTicketPaymentStatus,
  formatTicketNumber,
  isPromotionActiveOnDate,
  isValidQueueTransition,
} from "@/lib/domain/queue-rules";
import {
  buildCsvContent,
  formatCompactNumber,
  formatDateDDMMYYYY,
  formatShortUZS,
  formatTimeHHMM,
  formatUZS,
  formatUzPhone,
  formatUzPhoneInput,
  getRoleHomeRoute,
  getSafeRedirectPath,
  normalizeUzPhone,
  sanitizePostgrestFilter,
} from "@/lib/formatters";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";
import type { CommissionRule } from "@/types/database";

describe("Uzbek localization & formatting helpers", () => {
  it("formats UZS amounts with spaces and so'm suffix", () => {
    expect(formatUZS(180000)).toBe("180 000 so'm");
    expect(formatUZS(0)).toBe("0 so'm");
    expect(formatUZS("3500000")).toBe("3 500 000 so'm");
    expect(formatCompactNumber(5240)).toBe("5 240");
  });

  it("formats dates in DD.MM.YYYY in Asia/Tashkent timezone", () => {
    expect(formatDateDDMMYYYY("2026-11-13")).toBe("13.11.2026");
    // 2026-11-13T20:30:00Z is 2026-11-14 01:30 in Asia/Tashkent (+05:00)
    expect(formatDateDDMMYYYY("2026-11-13T20:30:00Z")).toBe("14.11.2026");
    expect(formatTimeHHMM("2026-11-13T20:30:00Z")).toBe("01:30");
  });

  it("normalizes and formats Uzbekistan phone numbers", () => {
    expect(normalizeUzPhone("+998 (90) 123-45-67")).toBe("998901234567");
    expect(formatUzPhone("998901234567")).toBe("+998 90 123 45 67");
  });

  it("maps roles to their dedicated portal routes", () => {
    expect(getRoleHomeRoute("super_admin")).toBe("/super-admin");
    expect(getRoleHomeRoute("admin")).toBe("/admin");
    expect(getRoleHomeRoute("doctor")).toBe("/doctor");
  });
});

describe("Queue transition, ticket numbering & promotion discount rules", () => {
  it("enforces valid queue state transitions", () => {
    expect(isValidQueueTransition("kutilmoqda", "chaqirildi")).toBe(true);
    expect(isValidQueueTransition("chaqirildi", "qabulda")).toBe(true);
    expect(isValidQueueTransition("qabulda", "yakunlandi")).toBe(true);
    expect(isValidQueueTransition("kelmagan", "kutilmoqda")).toBe(true);
    expect(isValidQueueTransition("yakunlandi", "qabulda")).toBe(false);
    expect(isValidQueueTransition("bekor_qilindi", "kutilmoqda")).toBe(false);
    expect(isValidQueueTransition("kutilmoqda", "kutilmoqda")).toBe(false);
  });

  it("formats ticket numbers cleanly with prefix and 3-digit zero padding", () => {
    expect(formatTicketNumber("a", 1)).toBe("A-001");
    expect(formatTicketNumber("st", 25)).toBe("ST-025");
    expect(formatTicketNumber("UZ", 1200)).toBe("UZ-1200");
  });

  it("calculates percentage and fixed promotion discounts and hides expired promos", () => {
    const pct = calculatePromotionDiscount(200000, {
      discount_type: "percentage",
      discount_value: 15,
    });
    expect(pct).toEqual({ discountAmount: 30000, finalPrice: 170000 });

    const fixed = calculatePromotionDiscount(120000, {
      discount_type: "fixed",
      discount_value: 150000,
    });
    expect(fixed).toEqual({ discountAmount: 120000, finalPrice: 0 });

    expect(
      isPromotionActiveOnDate(
        { is_active: true, starts_at: "2026-11-01", ends_at: "2026-11-10" },
        "2026-11-13"
      )
    ).toBe(false);
    expect(
      isPromotionActiveOnDate(
        { is_active: true, starts_at: "2026-11-01", ends_at: "2026-11-30" },
        "2026-11-13"
      )
    ).toBe(true);
  });

  it("computes ticket payment statuses accurately across unpaid, partial, paid, and refunded", () => {
    expect(computeTicketPaymentStatus(180000, 0, 0).status).toBe("unpaid");
    expect(computeTicketPaymentStatus(180000, 100000, 0)).toEqual({
      netPaid: 100000,
      remaining: 80000,
      status: "partial",
    });
    expect(computeTicketPaymentStatus(180000, 180000, 0).status).toBe("paid");
    expect(computeTicketPaymentStatus(180000, 180000, 180000).status).toBe("refunded");
    expect(computeTicketPaymentStatus(180000, 180000, 50000)).toEqual({
      netPaid: 130000,
      remaining: 50000,
      status: "partial",
    });
  });
});

describe("Doctor commissions, clinic finances & rate limiting", () => {
  const baseRule = (overrides: Partial<CommissionRule>): CommissionRule => ({
    id: "r1",
    clinic_id: "c1",
    doctor_id: null,
    service_id: null,
    commission_type: "percentage",
    commission_value: 40,
    effective_from: "2026-01-01",
    notes: null,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  });

  it("picks the most specific active commission rule (doctor+service > doctor > service > default)", () => {
    const rules: CommissionRule[] = [
      baseRule({ id: "clinic-default", commission_value: 35 }),
      baseRule({ id: "service-only", service_id: "s1", commission_value: 45 }),
      baseRule({ id: "doctor-only", doctor_id: "d1", commission_value: 50 }),
      baseRule({ id: "exact-match", doctor_id: "d1", service_id: "s1", commission_value: 60 }),
    ];

    expect(selectBestCommissionRule(rules, "d1", "s1", "2026-11-13")?.id).toBe("exact-match");
    expect(selectBestCommissionRule(rules, "d1", "s2", "2026-11-13")?.id).toBe("doctor-only");
    expect(selectBestCommissionRule(rules, "d2", "s1", "2026-11-13")?.id).toBe("service-only");
    expect(selectBestCommissionRule(rules, "d2", "s2", "2026-11-13")?.id).toBe("clinic-default");
  });

  it("calculates percentage and pro-rated fixed commissions", () => {
    expect(
      calculateDoctorCommission(180000, 180000, {
        commission_type: "percentage",
        commission_value: 40,
      })
    ).toBe(72000);

    expect(
      calculateDoctorCommission(100000, 200000, {
        commission_type: "fixed",
        commission_value: 60000,
      })
    ).toBe(30000);
  });

  it("summarizes gross revenue, refunds, net revenue, doctor liabilities, expenses, and profit", () => {
    const summary = summarizeClinicFinances({
      payments: [
        { amount: 500000, is_confirmed: true },
        { amount: 300000, is_confirmed: true },
        { amount: 100000, is_confirmed: false },
      ],
      refunds: [{ amount: 100000 }],
      tickets: [
        { total_due: 500000, paid_amount: 400000, status: "yakunlandi" },
        { total_due: 300000, paid_amount: 300000, status: "yakunlandi" },
      ],
      earnings: [
        { entry_type: "accrual", doctor_amount: 280000 },
        { entry_type: "refund_adjustment", doctor_amount: -40000 },
        { entry_type: "payout", doctor_amount: 100000 },
      ],
      expenses: [{ amount: 150000 }],
    });

    expect(summary).toEqual({
      grossPayments: 800000,
      refundedAmount: 100000,
      netRevenue: 700000,
      outstandingBalances: 100000,
      doctorCommissionsAccrued: 240000,
      doctorPayoutsPaid: 100000,
      doctorBalanceOwed: 140000,
      clinicExpenses: 150000,
      netFinancialResult: 310000,
    });
  });

  it("blocks abusive bursts in the sliding-window rate limiter and resets cleanly", () => {
    const key = `test-limit-${Date.now()}`;
    expect(checkRateLimit(key, 2, 10_000).allowed).toBe(true);
    expect(checkRateLimit(key, 2, 10_000).allowed).toBe(true);
    const blocked = checkRateLimit(key, 2, 10_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    resetRateLimit(key);
    expect(checkRateLimit(key, 2, 10_000).allowed).toBe(true);
  });

  it("progressively formats Uzbekistan phone input and compact chart labels", () => {
    expect(formatUzPhoneInput("901234567")).toBe("+998 90 123 45 67");
    expect(formatUzPhoneInput("+99890123")).toBe("+998 90 123");
    expect(formatUzPhoneInput("")).toBe("+998 ");

    expect(formatShortUZS(0)).toBe("0");
    expect(formatShortUZS(450_000)).toBe("450 ming");
    expect(formatShortUZS(1_500_000)).toBe("1.5 mln");
    expect(formatShortUZS(2_000_000_000)).toBe("2 mlrd");
  });

  it("sanitizes PostgREST filter strings and validates safe post-login redirects", () => {
    expect(sanitizePostgrestFilter("Ali,id.eq.(123)*%")).toBe("Ali id.eq. 123");

    expect(getSafeRedirectPath("//evil.com", "admin")).toBe("/admin");
    expect(getSafeRedirectPath("https://evil.com", "super_admin")).toBe("/super-admin");
    expect(getSafeRedirectPath("/super-admin/finance", "admin")).toBe("/admin");
    expect(getSafeRedirectPath("/admin/queue", "admin")).toBe("/admin/queue");
    expect(getSafeRedirectPath("/admin/queue", "super_admin")).toBe("/admin/queue");
    expect(getSafeRedirectPath("/doctor/earnings", "doctor")).toBe("/doctor/earnings");
    expect(getSafeRedirectPath("/admin", "doctor")).toBe("/doctor");
  });

  it("builds Excel-safe UTF-8 BOM CSV with formula injection protection", () => {
    const csv = buildCsvContent(
      ["Bemor", "Izoh", "Summa"],
      [["=HYPERLINK(\"http://evil\")", "Ali, \"VIP\"", 180000]]
    );
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(csv).toContain(`"Ali, ""VIP"""`);
    expect(csv).toContain(`"180000"`);
  });
});
