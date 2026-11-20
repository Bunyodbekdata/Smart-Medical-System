import type { Promotion, QueueStatus, TicketPaymentStatus } from "@/types/database";

const VALID_TRANSITIONS: Record<QueueStatus, QueueStatus[]> = {
  kutilmoqda: ["chaqirildi", "kelmagan", "bekor_qilindi"],
  chaqirildi: ["qabulda", "kelmagan", "bekor_qilindi", "kutilmoqda"],
  qabulda: ["yakunlandi", "bekor_qilindi"],
  kelmagan: ["kutilmoqda"],
  yakunlandi: [],
  bekor_qilindi: [],
};

export function isValidQueueTransition(from: QueueStatus, to: QueueStatus): boolean {
  if (from === to) return false;
  return VALID_TRANSITIONS[from].includes(to);
}

export function getAllowedTransitions(from: QueueStatus): QueueStatus[] {
  return VALID_TRANSITIONS[from];
}

export function formatTicketNumber(prefix: string, sequenceNumber: number): string {
  const cleanPrefix = (prefix || "A").trim().toUpperCase().slice(0, 4);
  return `${cleanPrefix}-${String(sequenceNumber).padStart(3, "0")}`;
}

export function computeTicketPaymentStatus(
  totalDue: number,
  confirmedPaid: number,
  refunded: number
): { netPaid: number; remaining: number; status: TicketPaymentStatus } {
  const netPaid = Math.max(0, Number((confirmedPaid - refunded).toFixed(2)));
  const remaining = Math.max(0, Number((totalDue - netPaid).toFixed(2)));

  if (confirmedPaid <= 0) {
    return { netPaid: 0, remaining: totalDue, status: "unpaid" };
  }
  if (refunded > 0 && netPaid === 0) {
    return { netPaid: 0, remaining: totalDue, status: "refunded" };
  }
  if (netPaid >= totalDue) {
    return { netPaid, remaining: 0, status: "paid" };
  }
  if (netPaid > 0) {
    return { netPaid, remaining, status: "partial" };
  }
  return { netPaid: 0, remaining: totalDue, status: "unpaid" };
}

export function isPromotionActiveOnDate(promotion: Pick<Promotion, "is_active" | "starts_at" | "ends_at">, dateStr: string): boolean {
  if (!promotion.is_active) return false;
  return dateStr >= promotion.starts_at && dateStr <= promotion.ends_at;
}

export function calculatePromotionDiscount(
  basePrice: number,
  promotion: Pick<Promotion, "discount_type" | "discount_value"> | null | undefined
): { discountAmount: number; finalPrice: number } {
  if (!promotion || basePrice <= 0) {
    return { discountAmount: 0, finalPrice: Math.max(0, basePrice) };
  }
  let discountAmount = 0;
  if (promotion.discount_type === "percentage") {
    discountAmount = Math.round((basePrice * promotion.discount_value) / 100);
  } else {
    discountAmount = Math.min(basePrice, promotion.discount_value);
  }
  discountAmount = Math.max(0, Math.min(basePrice, discountAmount));
  return {
    discountAmount,
    finalPrice: Math.max(0, basePrice - discountAmount),
  };
}
