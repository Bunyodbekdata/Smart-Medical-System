-- 0001_initial_schema.sql
-- Normalized, multi-clinic PostgreSQL schema for MedClinic / Xushvaqt Clinic Platform
-- Timezone convention: Asia/Tashkent, Currency: UZS

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('super_admin', 'admin', 'doctor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.queue_status AS ENUM (
    'kutilmoqda',
    'chaqirildi',
    'qabulda',
    'yakunlandi',
    'kelmagan',
    'bekor_qilindi'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('cash', 'card', 'transfer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ticket_payment_status AS ENUM ('unpaid', 'partial', 'paid', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.doctor_availability AS ENUM ('available', 'busy', 'break', 'off_duty');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.discount_type AS ENUM ('percentage', 'fixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.commission_type AS ENUM ('percentage', 'fixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.earning_entry_type AS ENUM ('accrual', 'refund_adjustment', 'payout', 'manual_adjustment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- UTILITY TRIGGER FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tashkent_today()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date;
$$;

-- ============================================================
-- 1. CLINICS & SETTINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_clinics_updated_at
  BEFORE UPDATE ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.clinic_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL UNIQUE REFERENCES public.clinics(id) ON DELETE CASCADE,
  clinic_name text NOT NULL DEFAULT 'MedClinic',
  logo_url text,
  tagline text NOT NULL DEFAULT 'Zamonaviy tibbiy markaz',
  hero_title text NOT NULL DEFAULT 'Sizning sog''lig''ingiz — bizning ustuvor vazifamiz',
  hero_subtitle text NOT NULL DEFAULT 'Zamonaviy uskunalar, tajribali shifokorlar va sifatli tibbiy xizmatlar.',
  hero_image_url text,
  about_title text NOT NULL DEFAULT 'Klinikamiz haqida',
  about_description text NOT NULL DEFAULT 'Bizning klinikamiz zamonaviy diagnostika va davolash uskunalariga ega bo''lib, har bir bemorga individual yondashuv va yuqori sifatli tibbiy xizmat ko''rsatadi.',
  mission text NOT NULL DEFAULT 'Xalqaro standartlar darajasidagi xavfsiz, tezkor va shaffof tibbiy xizmat ko''rsatish.',
  advantages jsonb NOT NULL DEFAULT '[
    {"title":"Zamonaviy uskunalar","description":"Yevropa va Osiyoning yetakchi ishlab chiqaruvchilaridan diagnostika apparatlari.","icon":"Cpu"},
    {"title":"Tajribali mutaxassislar","description":"Ko''p yillik amaliyotga ega malakali shifokorlar jamoasi.","icon":"Award"},
    {"title":"Elektron navbat","description":"Uzoq kutishlarsiz onlayn navbat olish va jonli kuzatuv.","icon":"Clock"},
    {"title":"Shaffof to''lov tizimi","description":"Aniq narxlar va tezkor elektron kvitansiya rasmiylashtiruvi.","icon":"ShieldCheck"}
  ]'::jsonb,
  equipment_summary text NOT NULL DEFAULT 'Raqamli UZI skanerlari, zamonaviy stomatologik qurilmalar, avtomatlashtirilgan laboratoriya analizatorlari va EKG tizimlari.',
  working_hours_summary text NOT NULL DEFAULT 'Dushanba - Shanba: 08:00 - 20:00, Yakshanba: 09:00 - 15:00',
  address text NOT NULL DEFAULT 'Toshkent shahri, Amir Temur shoh ko''chasi, 108-uy',
  phone text NOT NULL DEFAULT '+998 71 200 00 00',
  email text NOT NULL DEFAULT 'info@medclinic.uz',
  map_embed_url text,
  map_link text DEFAULT 'https://maps.google.com/?q=Tashkent',
  social_links jsonb NOT NULL DEFAULT '{"telegram":"","instagram":"","facebook":"","youtube":""}'::jsonb,
  currency text NOT NULL DEFAULT 'UZS',
  timezone text NOT NULL DEFAULT 'Asia/Tashkent',
  default_queue_prefix text NOT NULL DEFAULT 'A',
  daily_queue_reset boolean NOT NULL DEFAULT true,
  no_show_timeout_minutes integer NOT NULL DEFAULT 15 CHECK (no_show_timeout_minutes BETWEEN 1 AND 240),
  allow_online_queue boolean NOT NULL DEFAULT true,
  receipt_header text NOT NULL DEFAULT 'Rasmiy xizmat kvitansiyasi',
  receipt_footer text NOT NULL DEFAULT 'Sog''lig''ingiz uchun tashakkur! Savollar uchun qabulxonaga murojaat qiling.',
  -- Manageable clinic public statistics (NULL override uses live DB metrics)
  stats_doctors_override integer CHECK (stats_doctors_override IS NULL OR stats_doctors_override >= 0),
  stats_services_override integer CHECK (stats_services_override IS NULL OR stats_services_override >= 0),
  stats_patients_override integer CHECK (stats_patients_override IS NULL OR stats_patients_override >= 0),
  stats_experience_years integer NOT NULL DEFAULT 8 CHECK (stats_experience_years >= 0),
  stats_positive_rate numeric(5,2) NOT NULL DEFAULT 98.0 CHECK (stats_positive_rate >= 0 AND stats_positive_rate <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_clinic_settings_updated_at
  BEFORE UPDATE ON public.clinic_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 2. USER PROFILES (LINKED TO SUPABASE AUTH.USERS)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  role public.user_role NOT NULL,
  full_name text NOT NULL,
  username text,
  email text NOT NULL,
  phone text,
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_profiles_clinic_username UNIQUE (clinic_id, username),
  CONSTRAINT uq_user_profiles_email UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_clinic_role ON public.user_profiles(clinic_id, role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_username_lower ON public.user_profiles(lower(username));

CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 3. ROOMS, SERVICES, DOCTORS, SCHEDULES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  room_number text NOT NULL,
  name text,
  floor text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_rooms_clinic_number UNIQUE (clinic_id, room_number)
);

CREATE INDEX IF NOT EXISTS idx_rooms_clinic ON public.rooms(clinic_id);

CREATE TRIGGER trg_rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL,
  description text,
  icon_name text NOT NULL DEFAULT 'Stethoscope',
  image_url text,
  price numeric(14,2) NOT NULL CHECK (price >= 0),
  duration_minutes integer NOT NULL DEFAULT 20 CHECK (duration_minutes BETWEEN 5 AND 480),
  queue_prefix text NOT NULL DEFAULT 'A' CHECK (char_length(queue_prefix) BETWEEN 1 AND 4),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_services_clinic_name UNIQUE (clinic_id, name)
);

CREATE INDEX IF NOT EXISTS idx_services_clinic_active ON public.services(clinic_id, is_active);

CREATE TRIGGER trg_services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id uuid UNIQUE REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  specialization text NOT NULL,
  experience_years integer NOT NULL DEFAULT 1 CHECK (experience_years >= 0),
  biography text,
  photo_url text,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  consultation_price numeric(14,2) NOT NULL DEFAULT 0 CHECK (consultation_price >= 0),
  queue_prefix text CHECK (queue_prefix IS NULL OR char_length(queue_prefix) BETWEEN 1 AND 4),
  separate_queue boolean NOT NULL DEFAULT false,
  availability_status public.doctor_availability NOT NULL DEFAULT 'available',
  rating numeric(3,2) NOT NULL DEFAULT 5.0 CHECK (rating >= 0 AND rating <= 5.0),
  reviews_count integer NOT NULL DEFAULT 0 CHECK (reviews_count >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doctors_clinic_active ON public.doctors(clinic_id, is_active);
CREATE INDEX IF NOT EXISTS idx_doctors_user ON public.doctors(user_id);

CREATE TRIGGER trg_doctors_updated_at
  BEFORE UPDATE ON public.doctors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.doctor_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  custom_price numeric(14,2) CHECK (custom_price IS NULL OR custom_price >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_doctor_service UNIQUE (doctor_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_doctor_services_clinic ON public.doctor_services(clinic_id);
CREATE INDEX IF NOT EXISTS idx_doctor_services_service ON public.doctor_services(service_id);

CREATE TABLE IF NOT EXISTS public.doctor_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7), -- 1=Dushanba .. 7=Yakshanba
  start_time time NOT NULL DEFAULT '09:00',
  end_time time NOT NULL DEFAULT '18:00',
  break_start time,
  break_end time,
  is_working boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_doctor_schedule_day UNIQUE (doctor_id, day_of_week),
  CONSTRAINT chk_schedule_hours CHECK (NOT is_working OR end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_doctor_schedules_clinic_doc ON public.doctor_schedules(clinic_id, doctor_id);

CREATE TRIGGER trg_doctor_schedules_updated_at
  BEFORE UPDATE ON public.doctor_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 4. PROMOTIONS & DISCOUNTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  image_url text,
  discount_type public.discount_type NOT NULL DEFAULT 'percentage',
  discount_value numeric(14,2) NOT NULL CHECK (discount_value > 0),
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  starts_at date NOT NULL,
  ends_at date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_promotion_dates CHECK (ends_at >= starts_at),
  CONSTRAINT chk_promotion_percentage CHECK (discount_type <> 'percentage' OR discount_value <= 100)
);

CREATE INDEX IF NOT EXISTS idx_promotions_clinic_dates ON public.promotions(clinic_id, is_active, starts_at, ends_at);

CREATE TRIGGER trg_promotions_updated_at
  BEFORE UPDATE ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 5. PATIENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text NOT NULL,
  normalized_phone text NOT NULL,
  birth_date date,
  notes text,
  consent_given boolean NOT NULL DEFAULT false,
  consent_given_at timestamptz,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patients_clinic_phone ON public.patients(clinic_id, normalized_phone);
CREATE INDEX IF NOT EXISTS idx_patients_clinic_name ON public.patients(clinic_id, lower(full_name));

CREATE TRIGGER trg_patients_updated_at
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 6. CONCURRENCY-SAFE QUEUE SYSTEM
-- ============================================================

CREATE TABLE IF NOT EXISTS public.queue_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  queue_date date NOT NULL,
  scope_key text NOT NULL,
  prefix text NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_queue_counter_scope UNIQUE (clinic_id, queue_date, scope_key)
);

CREATE TABLE IF NOT EXISTS public.queue_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  queue_date date NOT NULL DEFAULT public.tashkent_today(),
  ticket_number text NOT NULL,
  sequence_number integer NOT NULL CHECK (sequence_number > 0),
  prefix text NOT NULL,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE RESTRICT,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('online', 'walk_in')),
  status public.queue_status NOT NULL DEFAULT 'kutilmoqda',
  priority_level integer NOT NULL DEFAULT 0 CHECK (priority_level BETWEEN 0 AND 2),
  priority_reason text,
  arrival_confirmed boolean NOT NULL DEFAULT false,
  arrival_confirmed_at timestamptz,
  tracking_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  service_price numeric(14,2) NOT NULL CHECK (service_price >= 0),
  discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total_due numeric(14,2) NOT NULL CHECK (total_due >= 0),
  paid_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  payment_status public.ticket_payment_status NOT NULL DEFAULT 'unpaid',
  promotion_id uuid REFERENCES public.promotions(id) ON DELETE SET NULL,
  notes text,
  called_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  no_show_at timestamptz,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_queue_ticket_number_per_day UNIQUE (clinic_id, queue_date, ticket_number)
);

-- Enforce at most ONE active 'qabulda' consultation per doctor at any time
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_consultation_per_doctor
  ON public.queue_tickets(clinic_id, doctor_id)
  WHERE status = 'qabulda';

CREATE INDEX IF NOT EXISTS idx_queue_tickets_clinic_date_status ON public.queue_tickets(clinic_id, queue_date, status);
CREATE INDEX IF NOT EXISTS idx_queue_tickets_doctor_date ON public.queue_tickets(doctor_id, queue_date, priority_level DESC, sequence_number ASC);
CREATE INDEX IF NOT EXISTS idx_queue_tickets_patient ON public.queue_tickets(patient_id);
CREATE INDEX IF NOT EXISTS idx_queue_tickets_tracking_token ON public.queue_tickets(tracking_token);

CREATE TRIGGER trg_queue_tickets_updated_at
  BEFORE UPDATE ON public.queue_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.queue_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  queue_ticket_id uuid NOT NULL REFERENCES public.queue_tickets(id) ON DELETE CASCADE,
  from_status public.queue_status,
  to_status public.queue_status NOT NULL,
  changed_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  actor_name text,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_queue_history_ticket ON public.queue_history(queue_ticket_id, created_at DESC);

-- ============================================================
-- 7. CONSULTATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  queue_ticket_id uuid NOT NULL UNIQUE REFERENCES public.queue_tickets(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  visit_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultations_clinic_doctor ON public.consultations(clinic_id, doctor_id, started_at DESC);

CREATE TRIGGER trg_consultations_updated_at
  BEFORE UPDATE ON public.consultations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 8. PAYMENTS, REFUNDS & EXPENSES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.receipt_counters (
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  receipt_date date NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (clinic_id, receipt_date)
);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  receipt_number text NOT NULL,
  queue_ticket_id uuid NOT NULL REFERENCES public.queue_tickets(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE RESTRICT,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_method public.payment_method NOT NULL DEFAULT 'cash',
  is_confirmed boolean NOT NULL DEFAULT true,
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  override_reason text,
  accepted_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  notes text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_payment_receipt_per_clinic UNIQUE (clinic_id, receipt_number)
);

CREATE INDEX IF NOT EXISTS idx_payments_clinic_date ON public.payments(clinic_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_ticket ON public.payments(queue_ticket_id);
CREATE INDEX IF NOT EXISTS idx_payments_doctor ON public.payments(doctor_id, paid_at DESC);

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  refund_number text NOT NULL,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  queue_ticket_id uuid NOT NULL REFERENCES public.queue_tickets(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  refund_method public.payment_method NOT NULL DEFAULT 'cash',
  reason text NOT NULL,
  authorized_by uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  refunded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_refund_number_per_clinic UNIQUE (clinic_id, refund_number)
);

CREATE INDEX IF NOT EXISTS idx_refunds_clinic_date ON public.refunds(clinic_id, refunded_at DESC);
CREATE INDEX IF NOT EXISTS idx_refunds_payment ON public.refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_refunds_ticket ON public.refunds(queue_ticket_id);

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  expense_date date NOT NULL DEFAULT public.tashkent_today(),
  description text,
  responsible_user_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_clinic_date ON public.expenses(clinic_id, expense_date DESC);

CREATE TRIGGER trg_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 9. COMMISSION RULES & DOCTOR EARNINGS LEDGER
-- ============================================================

CREATE TABLE IF NOT EXISTS public.commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  doctor_id uuid REFERENCES public.doctors(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE CASCADE,
  commission_type public.commission_type NOT NULL DEFAULT 'percentage',
  commission_value numeric(14,2) NOT NULL CHECK (commission_value >= 0),
  effective_from date NOT NULL DEFAULT public.tashkent_today(),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_commission_percentage CHECK (commission_type <> 'percentage' OR commission_value <= 100)
);

CREATE INDEX IF NOT EXISTS idx_commission_rules_lookup
  ON public.commission_rules(clinic_id, is_active, doctor_id, service_id, effective_from DESC);

CREATE TRIGGER trg_commission_rules_updated_at
  BEFORE UPDATE ON public.commission_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.doctor_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE RESTRICT,
  queue_ticket_id uuid REFERENCES public.queue_tickets(id) ON DELETE SET NULL,
  consultation_id uuid REFERENCES public.consultations(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  refund_id uuid REFERENCES public.refunds(id) ON DELETE SET NULL,
  commission_rule_id uuid REFERENCES public.commission_rules(id) ON DELETE SET NULL,
  entry_type public.earning_entry_type NOT NULL,
  gross_amount numeric(14,2) NOT NULL DEFAULT 0,
  doctor_amount numeric(14,2) NOT NULL,
  effective_date date NOT NULL DEFAULT public.tashkent_today(),
  notes text,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doctor_earnings_doctor_date ON public.doctor_earnings(clinic_id, doctor_id, effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_doctor_earnings_ticket ON public.doctor_earnings(queue_ticket_id);

-- ============================================================
-- 10. IMMUTABLE AUDIT LOGS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  actor_name text,
  actor_role text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  summary text NOT NULL,
  previous_values jsonb,
  new_values jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_clinic_created ON public.audit_logs(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_user_id);

-- Prevent updates or deletes on audit_logs even at SQL trigger level
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable and cannot be modified or deleted';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();
