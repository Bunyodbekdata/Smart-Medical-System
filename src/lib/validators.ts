import { z } from "zod";

export const uzPhoneSchema = z
  .string()
  .trim()
  .min(9, "Telefon raqami kamida 9 ta raqamdan iborat bo'lishi kerak")
  .max(20, "Telefon raqami juda uzun")
  .refine(
    (val) => {
      const digits = val.replace(/\D/g, "");
      return digits.length === 9 || (digits.length === 12 && digits.startsWith("998"));
    },
    { message: "O'zbekiston telefon raqamini kiriting (masalan: +998 90 123 45 67)" }
  );

export const onlineQueueRegistrationSchema = z.object({
  clinicId: z.string().uuid().optional(),
  serviceId: z.string().uuid("Tibbiy xizmatni tanlang"),
  doctorId: z.string().uuid("Shifokorni tanlang"),
  fullName: z
    .string()
    .trim()
    .min(3, "F.I.Sh. kamida 3 ta belgidan iborat bo'lishi kerak")
    .max(120, "F.I.Sh. juda uzun"),
  phone: uzPhoneSchema,
  notes: z.string().trim().max(500).optional().nullable(),
  consentGiven: z.literal(true, {
    error: "Shaxsiy ma'lumotlarni qayta ishlashga rozilik berishingiz shart",
  }),
});

export const walkInRegistrationSchema = z.object({
  patientId: z.string().uuid().optional().nullable(),
  fullName: z
    .string()
    .trim()
    .min(3, "Bemor F.I.Sh. kamida 3 ta belgidan iborat bo'lishi kerak")
    .max(120),
  phone: uzPhoneSchema,
  serviceId: z.string().uuid("Xizmatni tanlang"),
  doctorId: z.string().uuid("Shifokorni tanlang"),
  notes: z.string().trim().max(500).optional().nullable(),
  priorityLevel: z.number().int().min(0).max(2).default(0),
  priorityReason: z.string().trim().max(300).optional().nullable(),
  initialPayment: z
    .object({
      amount: z.number().positive("To'lov summasi musbat bo'lishi kerak"),
      paymentMethod: z.enum(["cash", "card", "transfer"]),
      isConfirmed: z.boolean().default(true),
      notes: z.string().trim().max(300).optional().nullable(),
    })
    .optional()
    .nullable(),
}).refine(
  (data) => data.priorityLevel === 0 || (data.priorityReason && data.priorityReason.trim().length >= 3),
  {
    message: "Ustuvorlik berilganda sabab kiritilishi shart",
    path: ["priorityReason"],
  }
);

export const staffLoginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(3, "Login yoki elektron pochtani kiriting")
    .max(150),
  password: z
    .string()
    .min(6, "Parol kamida 6 ta belgidan iborat bo'lishi kerak")
    .max(128),
});

export const paymentRecordSchema = z.object({
  ticketId: z.string().uuid("Navbat chiptasi tanlanmagan"),
  amount: z.number().positive("Summa 0 dan katta bo'lishi kerak"),
  paymentMethod: z.enum(["cash", "card", "transfer"]),
  isConfirmed: z.boolean().default(true),
  overrideReason: z.string().trim().max(300).optional().nullable(),
  notes: z.string().trim().max(300).optional().nullable(),
});

export const refundRecordSchema = z.object({
  paymentId: z.string().uuid("To'lov tanlanmagan"),
  amount: z.number().positive("Qaytarish summasi 0 dan katta bo'lishi kerak"),
  refundMethod: z.enum(["cash", "card", "transfer"]),
  reason: z.string().trim().min(5, "Qaytarish sababini kamida 5 ta belgi bilan yozing").max(500),
});

export const expenseSchema = z.object({
  title: z.string().trim().min(2, "Xarajat nomini kiriting").max(160),
  category: z.string().trim().min(2, "Kategoriyani tanlang").max(100),
  amount: z.number().positive("Summa 0 dan katta bo'lishi kerak"),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Sana formati noto'g'ri"),
  description: z.string().trim().max(500).optional().nullable(),
  responsibleUserId: z.string().uuid().optional().nullable(),
});

export const commissionRuleSchema = z.object({
  doctorId: z.string().uuid().optional().nullable(),
  serviceId: z.string().uuid().optional().nullable(),
  commissionType: z.enum(["percentage", "fixed"]),
  commissionValue: z.number().min(0, "Qiymat manfiy bo'lishi mumkin emas"),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Sana formati noto'g'ri"),
  notes: z.string().trim().max(300).optional().nullable(),
  isActive: z.boolean().default(true),
}).refine(
  (d) => d.commissionType !== "percentage" || d.commissionValue <= 100,
  { message: "Foiz ulushi 100% dan oshmasligi kerak", path: ["commissionValue"] }
);

export const serviceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Xizmat nomini kiriting").max(120),
  category: z.string().trim().min(2, "Kategoriyani kiriting").max(80),
  description: z.string().trim().max(500).optional().nullable(),
  iconName: z.string().trim().min(1).max(50).default("Stethoscope"),
  imageUrl: z.string().trim().max(500).optional().nullable(),
  price: z.number().min(0, "Narx manfiy bo'lishi mumkin emas"),
  durationMinutes: z.number().int().min(5).max(480),
  queuePrefix: z.string().trim().min(1).max(4).default("A"),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const promotionSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(3, "Aksiya nomini kiriting").max(160),
  description: z.string().trim().max(600).optional().nullable(),
  imageUrl: z.string().trim().max(500).optional().nullable(),
  discountType: z.enum(["percentage", "fixed"]),
  discountValue: z.number().positive("Chegirma qiymati 0 dan katta bo'lishi kerak"),
  serviceId: z.string().uuid().optional().nullable(),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Boshlanish sanasini tanlang"),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tugash sanasini tanlang"),
  isActive: z.boolean().default(true),
}).refine(
  (d) => d.endsAt >= d.startsAt,
  { message: "Tugash sanasi boshlanish sanasidan oldin bo'lishi mumkin emas", path: ["endsAt"] }
).refine(
  (d) => d.discountType !== "percentage" || d.discountValue <= 100,
  { message: "Chegirma foizi 100% dan oshmasligi kerak", path: ["discountValue"] }
);
