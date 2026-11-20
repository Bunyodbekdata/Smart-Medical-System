-- 0003_rls_policies.sql
-- Strict Row Level Security (RLS) and RPC execution permissions

-- ============================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================

ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PUBLIC CATALOG POLICIES (CLINIC WEBSITE)
-- ============================================================

CREATE POLICY clinics_public_read ON public.clinics
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

CREATE POLICY clinic_settings_public_read ON public.clinic_settings
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY rooms_public_read ON public.rooms
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

CREATE POLICY services_public_read ON public.services
  FOR SELECT TO anon
  USING (is_active = true);

CREATE POLICY services_staff_read ON public.services
  FOR SELECT TO authenticated
  USING (clinic_id = public.current_user_clinic_id());

CREATE POLICY doctors_public_read ON public.doctors
  FOR SELECT TO anon
  USING (is_active = true);

CREATE POLICY doctors_staff_read ON public.doctors
  FOR SELECT TO authenticated
  USING (clinic_id = public.current_user_clinic_id());

CREATE POLICY doctor_services_public_read ON public.doctor_services
  FOR SELECT TO anon
  USING (is_active = true);

CREATE POLICY doctor_services_staff_read ON public.doctor_services
  FOR SELECT TO authenticated
  USING (clinic_id = public.current_user_clinic_id());

CREATE POLICY doctor_schedules_public_read ON public.doctor_schedules
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY promotions_public_read ON public.promotions
  FOR SELECT TO anon
  USING (is_active = true AND public.tashkent_today() BETWEEN starts_at AND ends_at);

CREATE POLICY promotions_staff_read ON public.promotions
  FOR SELECT TO authenticated
  USING (clinic_id = public.current_user_clinic_id());

-- ============================================================
-- SUPER ADMIN MANAGEMENT POLICIES
-- ============================================================

CREATE POLICY clinic_settings_super_admin_write ON public.clinic_settings
  FOR ALL TO authenticated
  USING (clinic_id = public.current_user_clinic_id() AND public.current_user_role() = 'super_admin')
  WITH CHECK (clinic_id = public.current_user_clinic_id() AND public.current_user_role() = 'super_admin');

CREATE POLICY rooms_super_admin_write ON public.rooms
  FOR ALL TO authenticated
  USING (clinic_id = public.current_user_clinic_id() AND public.current_user_role() = 'super_admin')
  WITH CHECK (clinic_id = public.current_user_clinic_id() AND public.current_user_role() = 'super_admin');

CREATE POLICY services_super_admin_write ON public.services
  FOR ALL TO authenticated
  USING (clinic_id = public.current_user_clinic_id() AND public.current_user_role() = 'super_admin')
  WITH CHECK (clinic_id = public.current_user_clinic_id() AND public.current_user_role() = 'super_admin');

CREATE POLICY doctors_super_admin_write ON public.doctors
  FOR ALL TO authenticated
  USING (clinic_id = public.current_user_clinic_id() AND public.current_user_role() = 'super_admin')
  WITH CHECK (clinic_id = public.current_user_clinic_id() AND public.current_user_role() = 'super_admin');

CREATE POLICY doctor_services_super_admin_write ON public.doctor_services
  FOR ALL TO authenticated
  USING (clinic_id = public.current_user_clinic_id() AND public.current_user_role() = 'super_admin')
  WITH CHECK (clinic_id = public.current_user_clinic_id() AND public.current_user_role() = 'super_admin');

CREATE POLICY doctor_schedules_super_admin_write ON public.doctor_schedules
  FOR ALL TO authenticated
  USING (clinic_id = public.current_user_clinic_id() AND public.current_user_role() = 'super_admin')
  WITH CHECK (clinic_id = public.current_user_clinic_id() AND public.current_user_role() = 'super_admin');

CREATE POLICY promotions_super_admin_write ON public.promotions
  FOR ALL TO authenticated
  USING (clinic_id = public.current_user_clinic_id() AND public.current_user_role() = 'super_admin')
  WITH CHECK (clinic_id = public.current_user_clinic_id() AND public.current_user_role() = 'super_admin');

-- ============================================================
-- USER PROFILES POLICIES
-- ============================================================

CREATE POLICY user_profiles_self_or_admin_read ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR (
      clinic_id = public.current_user_clinic_id()
      AND public.current_user_role() IN ('admin', 'super_admin')
    )
  );

CREATE POLICY user_profiles_super_admin_write ON public.user_profiles
  FOR ALL TO authenticated
  USING (clinic_id = public.current_user_clinic_id() AND public.current_user_role() = 'super_admin')
  WITH CHECK (clinic_id = public.current_user_clinic_id() AND public.current_user_role() = 'super_admin');

-- ============================================================
-- PATIENTS POLICIES (ZERO ANON ACCESS, SCOPED FOR DOCTORS)
-- ============================================================

CREATE POLICY patients_admin_read_write ON public.patients
  FOR ALL TO authenticated
  USING (
    clinic_id = public.current_user_clinic_id()
    AND public.current_user_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (
    clinic_id = public.current_user_clinic_id()
    AND public.current_user_role() IN ('admin', 'super_admin')
  );

CREATE POLICY patients_doctor_assigned_read ON public.patients
  FOR SELECT TO authenticated
  USING (
    clinic_id = public.current_user_clinic_id()
    AND public.current_user_role() = 'doctor'
    AND EXISTS (
      SELECT 1 FROM public.queue_tickets qt
      WHERE qt.patient_id = patients.id
        AND qt.doctor_id = public.current_doctor_id()
    )
  );

-- ============================================================
-- QUEUE TICKETS, HISTORY & CONSULTATIONS POLICIES
-- ============================================================

CREATE POLICY queue_tickets_admin_read ON public.queue_tickets
  FOR SELECT TO authenticated
  USING (
    clinic_id = public.current_user_clinic_id()
    AND public.current_user_role() IN ('admin', 'super_admin')
  );

CREATE POLICY queue_tickets_doctor_own_read ON public.queue_tickets
  FOR SELECT TO authenticated
  USING (
    clinic_id = public.current_user_clinic_id()
    AND public.current_user_role() = 'doctor'
    AND doctor_id = public.current_doctor_id()
  );

CREATE POLICY queue_history_staff_read ON public.queue_history
  FOR SELECT TO authenticated
  USING (
    clinic_id = public.current_user_clinic_id()
    AND (
      public.current_user_role() IN ('admin', 'super_admin')
      OR (
        public.current_user_role() = 'doctor'
        AND EXISTS (
          SELECT 1 FROM public.queue_tickets qt
          WHERE qt.id = queue_history.queue_ticket_id
            AND qt.doctor_id = public.current_doctor_id()
        )
      )
    )
  );

CREATE POLICY consultations_admin_read ON public.consultations
  FOR SELECT TO authenticated
  USING (
    clinic_id = public.current_user_clinic_id()
    AND public.current_user_role() IN ('admin', 'super_admin')
  );

CREATE POLICY consultations_doctor_own_read ON public.consultations
  FOR SELECT TO authenticated
  USING (
    clinic_id = public.current_user_clinic_id()
    AND public.current_user_role() = 'doctor'
    AND doctor_id = public.current_doctor_id()
  );

-- ============================================================
-- PAYMENTS, REFUNDS, EXPENSES, COMMISSIONS, EARNINGS, AUDIT LOGS
-- ============================================================

CREATE POLICY payments_admin_read ON public.payments
  FOR SELECT TO authenticated
  USING (
    clinic_id = public.current_user_clinic_id()
    AND public.current_user_role() IN ('admin', 'super_admin')
  );

CREATE POLICY payments_doctor_own_read ON public.payments
  FOR SELECT TO authenticated
  USING (
    clinic_id = public.current_user_clinic_id()
    AND public.current_user_role() = 'doctor'
    AND doctor_id = public.current_doctor_id()
  );

CREATE POLICY refunds_admin_read ON public.refunds
  FOR SELECT TO authenticated
  USING (
    clinic_id = public.current_user_clinic_id()
    AND public.current_user_role() IN ('admin', 'super_admin')
  );

CREATE POLICY expenses_super_admin_all ON public.expenses
  FOR ALL TO authenticated
  USING (clinic_id = public.current_user_clinic_id() AND public.current_user_role() = 'super_admin')
  WITH CHECK (clinic_id = public.current_user_clinic_id() AND public.current_user_role() = 'super_admin');

CREATE POLICY commission_rules_super_admin_all ON public.commission_rules
  FOR ALL TO authenticated
  USING (clinic_id = public.current_user_clinic_id() AND public.current_user_role() = 'super_admin')
  WITH CHECK (clinic_id = public.current_user_clinic_id() AND public.current_user_role() = 'super_admin');

CREATE POLICY commission_rules_doctor_read ON public.commission_rules
  FOR SELECT TO authenticated
  USING (
    clinic_id = public.current_user_clinic_id()
    AND public.current_user_role() = 'doctor'
    AND (doctor_id = public.current_doctor_id() OR doctor_id IS NULL)
  );

CREATE POLICY doctor_earnings_super_admin_all ON public.doctor_earnings
  FOR ALL TO authenticated
  USING (clinic_id = public.current_user_clinic_id() AND public.current_user_role() = 'super_admin')
  WITH CHECK (clinic_id = public.current_user_clinic_id() AND public.current_user_role() = 'super_admin');

CREATE POLICY doctor_earnings_doctor_own_read ON public.doctor_earnings
  FOR SELECT TO authenticated
  USING (
    clinic_id = public.current_user_clinic_id()
    AND public.current_user_role() = 'doctor'
    AND doctor_id = public.current_doctor_id()
  );

CREATE POLICY audit_logs_super_admin_read ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    clinic_id = public.current_user_clinic_id()
    AND public.current_user_role() = 'super_admin'
  );

-- ============================================================
-- LOCK DOWN SECURITY DEFINER RPC EXECUTION PERMISSIONS
-- ============================================================

REVOKE ALL ON FUNCTION public.create_queue_ticket(uuid, text, text, uuid, uuid, text, boolean, text, uuid, uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_queue_status(uuid, public.queue_status, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.call_next_queue_ticket(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_ticket_payment(uuid, numeric, public.payment_method, uuid, boolean, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_payment_refund(uuid, numeric, public.payment_method, text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_ticket_payment_totals(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_doctor_earning_for_ticket(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.write_audit_log(uuid, uuid, text, text, uuid, text, jsonb, jsonb, text) FROM PUBLIC;

-- Grant public ticket tracking only (strictly anonymized for non-owners)
GRANT EXECUTE ON FUNCTION public.get_public_ticket_tracking(uuid) TO anon, authenticated, service_role;

-- Mutation RPCs are invoked exclusively by server-side Next.js API routes / Server Actions via service_role
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.create_queue_ticket(uuid, text, text, uuid, uuid, text, boolean, text, uuid, uuid, integer, text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.transition_queue_status(uuid, public.queue_status, uuid, text, text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.call_next_queue_ticket(uuid, uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.record_ticket_payment(uuid, numeric, public.payment_method, uuid, boolean, text, text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.record_payment_refund(uuid, numeric, public.payment_method, text, uuid, uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.sync_ticket_payment_totals(uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.sync_doctor_earning_for_ticket(uuid, uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.write_audit_log(uuid, uuid, text, text, uuid, text, jsonb, jsonb, text) TO service_role;
  END IF;
END $$;
