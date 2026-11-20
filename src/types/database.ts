export type UserRole = "super_admin" | "admin" | "doctor";

export type QueueStatus =
  | "kutilmoqda"
  | "chaqirildi"
  | "qabulda"
  | "yakunlandi"
  | "kelmagan"
  | "bekor_qilindi";

export type PaymentMethod = "cash" | "card" | "transfer";

export type TicketPaymentStatus = "unpaid" | "partial" | "paid" | "refunded";

export type DoctorAvailability = "available" | "busy" | "break" | "off_duty";

export type DiscountType = "percentage" | "fixed";

export type CommissionType = "percentage" | "fixed";

export type EarningEntryType =
  | "accrual"
  | "refund_adjustment"
  | "payout"
  | "manual_adjustment";

export interface ClinicAdvantage {
  title: string;
  description: string;
  icon: string;
}

export interface SocialLinks {
  telegram?: string;
  instagram?: string;
  facebook?: string;
  youtube?: string;
}

export interface ClinicSettings {
  id: string;
  clinic_id: string;
  clinic_name: string;
  logo_url: string | null;
  tagline: string;
  hero_title: string;
  hero_subtitle: string;
  hero_image_url: string | null;
  about_title: string;
  about_description: string;
  mission: string;
  advantages: ClinicAdvantage[];
  equipment_summary: string;
  working_hours_summary: string;
  address: string;
  phone: string;
  email: string;
  map_embed_url: string | null;
  map_link: string | null;
  social_links: SocialLinks;
  currency: string;
  timezone: string;
  default_queue_prefix: string;
  daily_queue_reset: boolean;
  no_show_timeout_minutes: number;
  allow_online_queue: boolean;
  receipt_header: string;
  receipt_footer: string;
  stats_doctors_override: number | null;
  stats_services_override: number | null;
  stats_patients_override: number | null;
  stats_experience_years: number;
  stats_positive_rate: number;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  clinic_id: string;
  role: UserRole;
  full_name: string;
  username: string | null;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Room {
  id: string;
  clinic_id: string;
  room_number: string;
  name: string | null;
  floor: string | null;
  is_active: boolean;
}

export interface Service {
  id: string;
  clinic_id: string;
  name: string;
  category: string;
  description: string | null;
  icon_name: string;
  image_url: string | null;
  price: number;
  duration_minutes: number;
  queue_prefix: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DoctorSchedule {
  id: string;
  clinic_id: string;
  doctor_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  break_start: string | null;
  break_end: string | null;
  is_working: boolean;
}

export interface DoctorServiceLink {
  id: string;
  doctor_id: string;
  service_id: string;
  custom_price: number | null;
  is_active: boolean;
  service?: Service;
}

export interface Doctor {
  id: string;
  clinic_id: string;
  user_id: string | null;
  full_name: string;
  specialization: string;
  experience_years: number;
  biography: string | null;
  photo_url: string | null;
  room_id: string | null;
  room?: Room | null;
  consultation_price: number;
  queue_prefix: string | null;
  separate_queue: boolean;
  availability_status: DoctorAvailability;
  rating: number;
  reviews_count: number;
  is_active: boolean;
  doctor_services?: DoctorServiceLink[];
  doctor_schedules?: DoctorSchedule[];
  created_at: string;
  updated_at: string;
}

export interface Promotion {
  id: string;
  clinic_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  discount_type: DiscountType;
  discount_value: number;
  service_id: string | null;
  service?: { id: string; name: string; price: number } | null;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Patient {
  id: string;
  clinic_id: string;
  full_name: string;
  phone: string;
  normalized_phone: string;
  birth_date: string | null;
  notes: string | null;
  consent_given: boolean;
  consent_given_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QueueTicket {
  id: string;
  clinic_id: string;
  queue_date: string;
  ticket_number: string;
  sequence_number: number;
  prefix: string;
  patient_id: string;
  doctor_id: string;
  service_id: string;
  room_id: string | null;
  source: "online" | "walk_in";
  status: QueueStatus;
  priority_level: number;
  priority_reason: string | null;
  arrival_confirmed: boolean;
  arrival_confirmed_at: string | null;
  tracking_token: string;
  service_price: number;
  discount_amount: number;
  total_due: number;
  paid_amount: number;
  payment_status: TicketPaymentStatus;
  promotion_id: string | null;
  notes: string | null;
  called_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  no_show_at: string | null;
  created_at: string;
  updated_at: string;
  patient?: Patient;
  doctor?: Pick<Doctor, "id" | "full_name" | "specialization">;
  service?: Pick<Service, "id" | "name" | "category" | "price">;
  room?: Pick<Room, "id" | "room_number" | "name"> | null;
}

export interface Payment {
  id: string;
  clinic_id: string;
  receipt_number: string;
  queue_ticket_id: string;
  patient_id: string;
  doctor_id: string;
  service_id: string;
  amount: number;
  payment_method: PaymentMethod;
  is_confirmed: boolean;
  confirmed_at: string | null;
  override_reason: string | null;
  accepted_by: string | null;
  notes: string | null;
  paid_at: string;
  created_at: string;
  patient?: Pick<Patient, "id" | "full_name" | "phone">;
  doctor?: Pick<Doctor, "id" | "full_name">;
  service?: Pick<Service, "id" | "name">;
  ticket?: Pick<
    QueueTicket,
    "id" | "ticket_number" | "total_due" | "paid_amount" | "payment_status"
  >;
  accepted_by_profile?: Pick<UserProfile, "id" | "full_name"> | null;
  refunds?: Refund[];
}

export interface Refund {
  id: string;
  clinic_id: string;
  refund_number: string;
  payment_id: string;
  queue_ticket_id: string;
  amount: number;
  refund_method: PaymentMethod;
  reason: string;
  authorized_by: string;
  created_by: string;
  refunded_at: string;
}

export interface Expense {
  id: string;
  clinic_id: string;
  title: string;
  category: string;
  amount: number;
  expense_date: string;
  description: string | null;
  responsible_user_id: string | null;
  responsible_user?: Pick<UserProfile, "id" | "full_name"> | null;
  created_at: string;
}

export interface CommissionRule {
  id: string;
  clinic_id: string;
  doctor_id: string | null;
  service_id: string | null;
  commission_type: CommissionType;
  commission_value: number;
  effective_from: string;
  notes: string | null;
  is_active: boolean;
  doctor?: Pick<Doctor, "id" | "full_name"> | null;
  service?: Pick<Service, "id" | "name"> | null;
  created_at: string;
}

export interface DoctorEarningEntry {
  id: string;
  clinic_id: string;
  doctor_id: string;
  queue_ticket_id: string | null;
  consultation_id: string | null;
  payment_id: string | null;
  refund_id: string | null;
  commission_rule_id: string | null;
  entry_type: EarningEntryType;
  gross_amount: number;
  doctor_amount: number;
  effective_date: string;
  notes: string | null;
  created_at: string;
  doctor?: Pick<Doctor, "id" | "full_name" | "specialization">;
  ticket?: Pick<QueueTicket, "id" | "ticket_number" | "service_id"> & {
    service?: Pick<Service, "id" | "name"> | null;
  };
}

export interface AuditLog {
  id: string;
  clinic_id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  previous_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}

export interface PublicTicketTracking {
  ticket_id: string;
  clinic_id: string;
  clinic_name: string;
  clinic_phone: string;
  clinic_address: string;
  ticket_number: string;
  sequence_number: number;
  queue_date: string;
  status: QueueStatus;
  payment_status: TicketPaymentStatus;
  patient_name: string;
  doctor_id: string;
  doctor_name: string;
  doctor_specialization: string;
  room_number: string | null;
  service_name: string;
  total_due: number;
  paid_amount: number;
  current_serving_ticket_number: string | null;
  people_ahead: number;
  created_at: string;
  called_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}
