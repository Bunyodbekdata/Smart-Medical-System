import type {
  DoctorAvailability,
  EarningEntryType,
  PaymentMethod,
  QueueStatus,
  TicketPaymentStatus,
  UserRole,
} from "@/types/database";

export const QUEUE_STATUS_LABELS: Record<QueueStatus, string> = {
  kutilmoqda: "Kutilmoqda",
  chaqirildi: "Chaqirildi",
  qabulda: "Qabulda",
  yakunlandi: "Yakunlandi",
  kelmagan: "Kelmagan",
  bekor_qilindi: "Bekor qilindi",
};

export const QUEUE_STATUS_BADGE_CLASSES: Record<QueueStatus, string> = {
  kutilmoqda: "bg-amber-50 text-amber-800 border-amber-200/90",
  chaqirildi: "bg-sky-50 text-sky-800 border-sky-200/90",
  qabulda: "bg-[#EDF4FA] text-[#0B4F8A] border-[#CFE1F2]",
  yakunlandi: "bg-teal-50 text-teal-800 border-teal-200/90",
  kelmagan: "bg-rose-50 text-rose-700 border-rose-200/90",
  bekor_qilindi: "bg-slate-100 text-slate-600 border-slate-200/90",
};

export const PAYMENT_STATUS_LABELS: Record<TicketPaymentStatus, string> = {
  unpaid: "To'lanmagan",
  partial: "Qisman to'langan",
  paid: "To'langan",
  refunded: "Qaytarilgan",
};

export const PAYMENT_STATUS_BADGE_CLASSES: Record<TicketPaymentStatus, string> = {
  unpaid: "bg-rose-50 text-rose-700 border-rose-200/90",
  partial: "bg-amber-50 text-amber-800 border-amber-200/90",
  paid: "bg-teal-50 text-teal-800 border-teal-200/90",
  refunded: "bg-slate-100 text-slate-600 border-slate-200/90",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Naqd pul",
  card: "Bank kartasi",
  transfer: "Bank o'tkazmasi",
};

export const DOCTOR_AVAILABILITY_LABELS: Record<DoctorAvailability, string> = {
  available: "Qabulga tayyor",
  busy: "Qabulda band",
  break: "Tanaffusda",
  off_duty: "Ish vaqtidan tashqari",
};

export const DOCTOR_AVAILABILITY_CLASSES: Record<DoctorAvailability, string> = {
  available: "bg-teal-50/95 text-teal-800 border-teal-200/90",
  busy: "bg-[#EDF4FA]/95 text-[#0B4F8A] border-[#CFE1F2]",
  break: "bg-amber-50/95 text-amber-800 border-amber-200/90",
  off_duty: "bg-slate-100/95 text-slate-600 border-slate-200/90",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Administrator / Kassir",
  doctor: "Shifokor",
};

export const EARNING_ENTRY_TYPE_LABELS: Record<EarningEntryType, string> = {
  accrual: "Qabuldan ulush",
  refund_adjustment: "Qaytarish tuzatishi",
  payout: "To'lab berildi",
  manual_adjustment: "Qo'lda tuzatish",
};

export const DAYS_OF_WEEK_UZ: Record<number, string> = {
  1: "Dushanba",
  2: "Seshanba",
  3: "Chorshanba",
  4: "Payshanba",
  5: "Juma",
  6: "Shanba",
  7: "Yakshanba",
};

export const EXPENSE_CATEGORIES_UZ = [
  "Tibbiy sarf materiallari",
  "Jihozlar va texnik xizmat",
  "Kommunal to'lovlar",
  "Ijara haqi",
  "Xodimlar oyligi",
  "Marketing va reklama",
  "Boshqa xarajatlar",
] as const;
