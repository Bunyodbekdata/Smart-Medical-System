-- 0002_rpc_and_triggers.sql
-- Business logic RPCs, concurrency-safe queue & receipt generation, financial & commission ledgers

-- ============================================================
-- 1. AUTH & ROLE HELPERS (SECURITY DEFINER, NO RLS RECURSION)
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_user_clinic_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT clinic_id
  FROM public.user_profiles
  WHERE id = auth.uid() AND is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_profiles
  WHERE id = auth.uid() AND is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_doctor_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id
  FROM public.doctors d
  INNER JOIN public.user_profiles up ON up.id = d.user_id
  WHERE up.id = auth.uid() AND up.is_active = true AND d.is_active = true
  LIMIT 1;
$$;

-- ============================================================
-- 2. NORMALIZATION & AUDIT LOG HELPER
-- ============================================================

CREATE OR REPLACE FUNCTION public.normalize_uz_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_clinic_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_summary text,
  p_previous_values jsonb DEFAULT NULL,
  p_new_values jsonb DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_name text;
  v_actor_role text;
  v_log_id uuid;
BEGIN
  IF p_actor_user_id IS NOT NULL THEN
    SELECT full_name, role::text
    INTO v_actor_name, v_actor_role
    FROM public.user_profiles
    WHERE id = p_actor_user_id;
  ELSE
    v_actor_name := 'Onlayn bemor';
    v_actor_role := 'public';
  END IF;

  INSERT INTO public.audit_logs (
    clinic_id,
    actor_user_id,
    actor_name,
    actor_role,
    action,
    entity_type,
    entity_id,
    summary,
    previous_values,
    new_values,
    reason
  ) VALUES (
    p_clinic_id,
    p_actor_user_id,
    coalesce(v_actor_name, 'Tizim'),
    coalesce(v_actor_role, 'system'),
    p_action,
    p_entity_type,
    p_entity_id,
    p_summary,
    p_previous_values,
    p_new_values,
    p_reason
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- ============================================================
-- 3. CONCURRENCY-SAFE QUEUE TICKET GENERATION
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_queue_ticket(
  p_clinic_id uuid,
  p_patient_full_name text,
  p_patient_phone text,
  p_doctor_id uuid,
  p_service_id uuid,
  p_source text DEFAULT 'online',
  p_consent_given boolean DEFAULT false,
  p_notes text DEFAULT NULL,
  p_patient_id uuid DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_priority_level integer DEFAULT 0,
  p_priority_reason text DEFAULT NULL
)
RETURNS TABLE (
  ticket_id uuid,
  ticket_number text,
  tracking_token uuid,
  patient_id uuid,
  doctor_id uuid,
  service_id uuid,
  room_id uuid,
  queue_date date,
  status public.queue_status,
  service_price numeric,
  discount_amount numeric,
  total_due numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_settings public.clinic_settings%ROWTYPE;
  v_doctor public.doctors%ROWTYPE;
  v_service public.services%ROWTYPE;
  v_custom_price numeric(14,2);
  v_base_price numeric(14,2);
  v_promo public.promotions%ROWTYPE;
  v_discount numeric(14,2) := 0;
  v_total_due numeric(14,2);
  v_today date := public.tashkent_today();
  v_counter_date date;
  v_prefix text;
  v_scope_key text;
  v_seq integer;
  v_ticket_num text;
  v_norm_phone text := public.normalize_uz_phone(p_patient_phone);
  v_patient_id uuid := p_patient_id;
  v_ticket_id uuid;
  v_tracking_token uuid;
  v_actor_name text;
BEGIN
  IF p_source NOT IN ('online', 'walk_in') THEN
    RAISE EXCEPTION 'Invalid queue source: %', p_source;
  END IF;

  IF p_source = 'online' AND NOT p_consent_given THEN
    RAISE EXCEPTION 'Shaxsiy ma''lumotlarni qayta ishlashga rozilik majburiy';
  END IF;

  IF coalesce(trim(p_patient_full_name), '') = '' OR length(v_norm_phone) < 9 THEN
    RAISE EXCEPTION 'Bemor ismi va to''g''ri telefon raqami kiritilishi shart';
  END IF;

  IF p_priority_level > 0 THEN
    IF p_created_by IS NULL THEN
      RAISE EXCEPTION 'Ustuvorlik faqat vakolatli xodim tomonidan belgilanadi';
    END IF;
    IF coalesce(trim(p_priority_reason), '') = '' THEN
      RAISE EXCEPTION 'Ustuvorlik sababi kiritilishi shart';
    END IF;
  END IF;

  PERFORM 1
  FROM public.clinics
  WHERE id = p_clinic_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Klinika topilmadi yoki faol emas';
  END IF;

  SELECT * INTO v_settings
  FROM public.clinic_settings
  WHERE clinic_id = p_clinic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Klinika sozlamalari topilmadi';
  END IF;

  IF p_source = 'online' AND NOT v_settings.allow_online_queue THEN
    RAISE EXCEPTION 'Onlayn navbat olish vaqtincha to''xtatilgan';
  END IF;

  SELECT * INTO v_doctor
  FROM public.doctors
  WHERE id = p_doctor_id AND clinic_id = p_clinic_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tanlangan shifokor topilmadi yoki faol emas';
  END IF;

  IF p_source = 'online' AND v_doctor.availability_status = 'off_duty' THEN
    RAISE EXCEPTION 'Tanlangan shifokor bugun qabul qilmaydi';
  END IF;

  SELECT * INTO v_service
  FROM public.services
  WHERE id = p_service_id AND clinic_id = p_clinic_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tanlangan xizmat topilmadi yoki faol emas';
  END IF;

  SELECT ds.custom_price INTO v_custom_price
  FROM public.doctor_services ds
  WHERE ds.doctor_id = p_doctor_id AND ds.service_id = p_service_id AND ds.is_active = true;

  IF NOT FOUND THEN
    -- Fallback check: allow if doctor has consultation_price or assigned service
    RAISE EXCEPTION 'Tanlangan shifokor ushbu xizmatni ko''rsatmaydi';
  END IF;

  v_base_price := coalesce(v_custom_price, v_service.price);

  -- Check active promotion on this service (prefer service-specific over general)
  SELECT pr.* INTO v_promo
  FROM public.promotions pr
  WHERE pr.clinic_id = p_clinic_id
    AND pr.is_active = true
    AND v_today BETWEEN pr.starts_at AND pr.ends_at
    AND (pr.service_id = p_service_id OR pr.service_id IS NULL)
  ORDER BY (CASE WHEN pr.service_id = p_service_id THEN 0 ELSE 1 END), pr.discount_value DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_promo.discount_type = 'percentage' THEN
      v_discount := round((v_base_price * v_promo.discount_value) / 100.0, 2);
    ELSE
      v_discount := least(v_base_price, v_promo.discount_value);
    END IF;
  END IF;

  v_total_due := greatest(0, v_base_price - v_discount);

  -- Resolve or create patient
  IF v_patient_id IS NOT NULL THEN
    PERFORM 1 FROM public.patients WHERE id = v_patient_id AND clinic_id = p_clinic_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Bemor topilmadi';
    END IF;
    UPDATE public.patients
    SET
      full_name = coalesce(nullif(trim(p_patient_full_name), ''), full_name),
      consent_given = consent_given OR p_consent_given,
      consent_given_at = CASE WHEN NOT consent_given AND p_consent_given THEN now() ELSE consent_given_at END
    WHERE id = v_patient_id;
  ELSE
    -- Reuse existing patient if exact normalized phone + case-insensitive name match, else create new record
    SELECT id INTO v_patient_id
    FROM public.patients
    WHERE clinic_id = p_clinic_id
      AND normalized_phone = v_norm_phone
      AND lower(trim(full_name)) = lower(trim(p_patient_full_name))
    LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO public.patients (
        clinic_id, full_name, phone, normalized_phone,
        consent_given, consent_given_at, created_by
      ) VALUES (
        p_clinic_id, trim(p_patient_full_name), trim(p_patient_phone), v_norm_phone,
        p_consent_given, CASE WHEN p_consent_given THEN now() ELSE NULL END, p_created_by
      )
      RETURNING id INTO v_patient_id;

      PERFORM public.write_audit_log(
        p_clinic_id,
        p_created_by,
        'patient.registered',
        'patient',
        v_patient_id,
        format('Yangi bemor ro''yxatga olindi: %s (%s)', trim(p_patient_full_name), trim(p_patient_phone)),
        NULL,
        jsonb_build_object('full_name', trim(p_patient_full_name), 'phone', trim(p_patient_phone), 'source', p_source),
        NULL
      );
    END IF;
  END IF;

  -- Concurrency-safe counter increment
  v_counter_date := CASE WHEN v_settings.daily_queue_reset THEN v_today ELSE DATE '1970-01-01' END;
  v_prefix := upper(coalesce(nullif(trim(v_doctor.queue_prefix), ''), nullif(trim(v_service.queue_prefix), ''), nullif(trim(v_settings.default_queue_prefix), ''), 'A'));
  v_scope_key := CASE
    WHEN v_doctor.separate_queue THEN 'doctor:' || p_doctor_id::text || ':prefix:' || v_prefix
    ELSE 'prefix:' || v_prefix
  END;

  INSERT INTO public.queue_counters (clinic_id, queue_date, scope_key, prefix, last_number)
  VALUES (p_clinic_id, v_counter_date, v_scope_key, v_prefix, 1)
  ON CONFLICT (clinic_id, queue_date, scope_key)
  DO UPDATE SET last_number = public.queue_counters.last_number + 1, updated_at = now()
  RETURNING last_number INTO v_seq;

  v_ticket_num := v_prefix || '-' || lpad(v_seq::text, 3, '0');

  INSERT INTO public.queue_tickets (
    clinic_id,
    queue_date,
    ticket_number,
    sequence_number,
    prefix,
    patient_id,
    doctor_id,
    service_id,
    room_id,
    source,
    status,
    priority_level,
    priority_reason,
    arrival_confirmed,
    arrival_confirmed_at,
    service_price,
    discount_amount,
    total_due,
    promotion_id,
    notes,
    created_by
  ) VALUES (
    p_clinic_id,
    v_today,
    v_ticket_num,
    v_seq,
    v_prefix,
    v_patient_id,
    p_doctor_id,
    p_service_id,
    v_doctor.room_id,
    p_source,
    'kutilmoqda',
    p_priority_level,
    p_priority_reason,
    (p_source = 'walk_in'),
    CASE WHEN p_source = 'walk_in' THEN now() ELSE NULL END,
    v_base_price,
    v_discount,
    v_total_due,
    v_promo.id,
    p_notes,
    p_created_by
  )
  RETURNING queue_tickets.id, queue_tickets.tracking_token INTO v_ticket_id, v_tracking_token;

  IF p_created_by IS NOT NULL THEN
    SELECT full_name INTO v_actor_name FROM public.user_profiles WHERE id = p_created_by;
  ELSE
    v_actor_name := 'Onlayn ro''yxatdan o''tish';
  END IF;

  INSERT INTO public.queue_history (
    clinic_id, queue_ticket_id, from_status, to_status, changed_by, actor_name, reason, metadata
  ) VALUES (
    p_clinic_id, v_ticket_id, NULL, 'kutilmoqda', p_created_by, v_actor_name,
    CASE WHEN p_priority_level > 0 THEN p_priority_reason ELSE NULL END,
    jsonb_build_object('source', p_source, 'ticket_number', v_ticket_num, 'priority_level', p_priority_level)
  );

  PERFORM public.write_audit_log(
    p_clinic_id,
    p_created_by,
    'queue.created',
    'queue_ticket',
    v_ticket_id,
    format('Navbat chiptasi yaratildi: %s (%s)', v_ticket_num, p_source),
    NULL,
    jsonb_build_object(
      'ticket_number', v_ticket_num,
      'doctor_id', p_doctor_id,
      'service_id', p_service_id,
      'source', p_source,
      'priority_level', p_priority_level
    ),
    p_priority_reason
  );

  RETURN QUERY
  SELECT
    v_ticket_id,
    v_ticket_num,
    v_tracking_token,
    v_patient_id,
    p_doctor_id,
    p_service_id,
    v_doctor.room_id,
    v_today,
    'kutilmoqda'::public.queue_status,
    v_base_price,
    v_discount,
    v_total_due;
END;
$$;

-- ============================================================
-- 4. QUEUE STATE MACHINE & CONSULTATION LIFECYCLE
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_valid_queue_transition(
  p_from public.queue_status,
  p_to public.queue_status
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_from = p_to THEN false
    WHEN p_from = 'kutilmoqda' THEN p_to IN ('chaqirildi', 'kelmagan', 'bekor_qilindi')
    WHEN p_from = 'chaqirildi' THEN p_to IN ('qabulda', 'kelmagan', 'bekor_qilindi', 'kutilmoqda')
    WHEN p_from = 'qabulda' THEN p_to IN ('yakunlandi', 'bekor_qilindi')
    WHEN p_from = 'kelmagan' THEN p_to IN ('kutilmoqda')
    ELSE false -- 'yakunlandi' and 'bekor_qilindi' are terminal
  END;
$$;

-- Forward declaration of doctor earnings sync so transition_queue_status can call it
CREATE OR REPLACE FUNCTION public.sync_doctor_earning_for_ticket(
  p_ticket_id uuid,
  p_actor_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket public.queue_tickets%ROWTYPE;
  v_rule public.commission_rules%ROWTYPE;
  v_paid numeric(14,2) := 0;
  v_refunded numeric(14,2) := 0;
  v_net_collected numeric(14,2) := 0;
  v_target_commission numeric(14,2) := 0;
  v_current_accrued numeric(14,2) := 0;
  v_delta numeric(14,2) := 0;
  v_consultation_id uuid;
  v_latest_payment_id uuid;
  v_latest_refund_id uuid;
BEGIN
  SELECT * INTO v_ticket FROM public.queue_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_paid
  FROM public.payments
  WHERE queue_ticket_id = p_ticket_id AND is_confirmed = true;

  SELECT coalesce(sum(amount), 0) INTO v_refunded
  FROM public.refunds
  WHERE queue_ticket_id = p_ticket_id;

  v_net_collected := greatest(0, v_paid - v_refunded);

  IF v_ticket.status = 'yakunlandi' AND v_net_collected > 0 THEN
    -- Select highest-specificity active commission rule effective on ticket queue_date
    SELECT * INTO v_rule
    FROM public.commission_rules
    WHERE clinic_id = v_ticket.clinic_id
      AND is_active = true
      AND effective_from <= v_ticket.queue_date
      AND (doctor_id = v_ticket.doctor_id OR doctor_id IS NULL)
      AND (service_id = v_ticket.service_id OR service_id IS NULL)
    ORDER BY
      (CASE
        WHEN doctor_id IS NOT NULL AND service_id IS NOT NULL THEN 4
        WHEN doctor_id IS NOT NULL AND service_id IS NULL THEN 3
        WHEN doctor_id IS NULL AND service_id IS NOT NULL THEN 2
        ELSE 1
      END) DESC,
      effective_from DESC,
      created_at DESC
    LIMIT 1;

    IF FOUND THEN
      IF v_rule.commission_type = 'percentage' THEN
        v_target_commission := round((v_net_collected * v_rule.commission_value) / 100.0, 2);
      ELSE
        -- Fixed commission scales proportionally if partially paid/refunded, capped at commission_value
        IF v_ticket.total_due > 0 THEN
          v_target_commission := least(
            v_net_collected,
            round(v_rule.commission_value * least(1.0, v_net_collected / v_ticket.total_due), 2)
          );
        ELSE
          v_target_commission := v_rule.commission_value;
        END IF;
      END IF;
    END IF;
  END IF;

  SELECT coalesce(sum(doctor_amount), 0) INTO v_current_accrued
  FROM public.doctor_earnings
  WHERE queue_ticket_id = p_ticket_id
    AND entry_type IN ('accrual', 'refund_adjustment');

  v_delta := round(v_target_commission - v_current_accrued, 2);

  IF abs(v_delta) >= 0.01 THEN
    SELECT id INTO v_consultation_id FROM public.consultations WHERE queue_ticket_id = p_ticket_id LIMIT 1;
    SELECT id INTO v_latest_payment_id FROM public.payments WHERE queue_ticket_id = p_ticket_id AND is_confirmed = true ORDER BY paid_at DESC LIMIT 1;
    SELECT id INTO v_latest_refund_id FROM public.refunds WHERE queue_ticket_id = p_ticket_id ORDER BY refunded_at DESC LIMIT 1;

    INSERT INTO public.doctor_earnings (
      clinic_id,
      doctor_id,
      queue_ticket_id,
      consultation_id,
      payment_id,
      refund_id,
      commission_rule_id,
      entry_type,
      gross_amount,
      doctor_amount,
      effective_date,
      notes,
      created_by
    ) VALUES (
      v_ticket.clinic_id,
      v_ticket.doctor_id,
      p_ticket_id,
      v_consultation_id,
      v_latest_payment_id,
      CASE WHEN v_delta < 0 THEN v_latest_refund_id ELSE NULL END,
      v_rule.id,
      CASE WHEN v_delta > 0 THEN 'accrual'::public.earning_entry_type ELSE 'refund_adjustment'::public.earning_entry_type END,
      v_net_collected,
      v_delta,
      v_ticket.queue_date,
      CASE
        WHEN v_delta > 0 THEN format('Yakunlangan qabul ulushi (%s)', v_ticket.ticket_number)
        ELSE format('Qaytarish sababli ulush tuzatishi (%s)', v_ticket.ticket_number)
      END,
      p_actor_id
    );
  END IF;

  RETURN v_target_commission;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_queue_status(
  p_ticket_id uuid,
  p_new_status public.queue_status,
  p_actor_id uuid,
  p_reason text DEFAULT NULL,
  p_visit_notes text DEFAULT NULL
)
RETURNS public.queue_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket public.queue_tickets%ROWTYPE;
  v_updated public.queue_tickets%ROWTYPE;
  v_actor_name text;
  v_active_count integer;
  v_duration integer;
BEGIN
  SELECT * INTO v_ticket FROM public.queue_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Navbat chiptasi topilmadi';
  END IF;

  IF NOT public.is_valid_queue_transition(v_ticket.status, p_new_status) THEN
    RAISE EXCEPTION 'Noto''g''ri holat o''tishi: % -> %', v_ticket.status, p_new_status;
  END IF;

  IF p_new_status = 'qabulda' THEN
    SELECT count(*) INTO v_active_count
    FROM public.queue_tickets
    WHERE clinic_id = v_ticket.clinic_id
      AND doctor_id = v_ticket.doctor_id
      AND status = 'qabulda'
      AND id <> v_ticket.id;

    IF v_active_count > 0 THEN
      RAISE EXCEPTION 'Shifokorda hozir faol qabul mavjud. Avval joriy qabulni yakunlang.';
    END IF;
  END IF;

  SELECT full_name INTO v_actor_name FROM public.user_profiles WHERE id = p_actor_id;

  UPDATE public.queue_tickets
  SET
    status = p_new_status,
    called_at = CASE WHEN p_new_status = 'chaqirildi' THEN now() ELSE called_at END,
    started_at = CASE WHEN p_new_status = 'qabulda' THEN now() ELSE started_at END,
    completed_at = CASE WHEN p_new_status = 'yakunlandi' THEN now() ELSE completed_at END,
    cancelled_at = CASE WHEN p_new_status = 'bekor_qilindi' THEN now() ELSE cancelled_at END,
    no_show_at = CASE WHEN p_new_status = 'kelmagan' THEN now() ELSE no_show_at END,
    arrival_confirmed = CASE WHEN p_new_status IN ('qabulda', 'yakunlandi') THEN true ELSE arrival_confirmed END,
    arrival_confirmed_at = CASE WHEN p_new_status IN ('qabulda', 'yakunlandi') AND arrival_confirmed_at IS NULL THEN now() ELSE arrival_confirmed_at END
  WHERE id = p_ticket_id
  RETURNING * INTO v_updated;

  -- Consultation tracking
  IF p_new_status = 'qabulda' THEN
    INSERT INTO public.consultations (
      clinic_id, queue_ticket_id, doctor_id, patient_id, service_id, started_at, status, visit_notes
    ) VALUES (
      v_ticket.clinic_id, v_ticket.id, v_ticket.doctor_id, v_ticket.patient_id, v_ticket.service_id, now(), 'in_progress', p_visit_notes
    )
    ON CONFLICT (queue_ticket_id) DO UPDATE
    SET status = 'in_progress', started_at = now(), visit_notes = coalesce(p_visit_notes, public.consultations.visit_notes);
  ELSIF p_new_status = 'yakunlandi' THEN
    v_duration := greatest(0, extract(epoch FROM (now() - coalesce(v_ticket.started_at, now())))::integer);
    UPDATE public.consultations
    SET
      status = 'completed',
      ended_at = now(),
      duration_seconds = v_duration,
      visit_notes = coalesce(p_visit_notes, visit_notes)
    WHERE queue_ticket_id = v_ticket.id;

    -- Accrue doctor commission if paid
    PERFORM public.sync_doctor_earning_for_ticket(v_ticket.id, p_actor_id);
  ELSIF p_new_status = 'bekor_qilindi' AND v_ticket.status = 'qabulda' THEN
    UPDATE public.consultations
    SET status = 'cancelled', ended_at = now()
    WHERE queue_ticket_id = v_ticket.id;
  END IF;

  INSERT INTO public.queue_history (
    clinic_id, queue_ticket_id, from_status, to_status, changed_by, actor_name, reason
  ) VALUES (
    v_ticket.clinic_id, v_ticket.id, v_ticket.status, p_new_status, p_actor_id, coalesce(v_actor_name, 'Xodim'), p_reason
  );

  PERFORM public.write_audit_log(
    v_ticket.clinic_id,
    p_actor_id,
    'queue.status_changed',
    'queue_ticket',
    v_ticket.id,
    format('Navbat holati o''zgartirildi (%s): %s -> %s', v_ticket.ticket_number, v_ticket.status, p_new_status),
    jsonb_build_object('status', v_ticket.status),
    jsonb_build_object('status', p_new_status),
    p_reason
  );

  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.call_next_queue_ticket(
  p_doctor_id uuid,
  p_actor_id uuid
)
RETURNS public.queue_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := public.tashkent_today();
  v_next_id uuid;
  v_active_exists boolean;
BEGIN
  SELECT exists(
    SELECT 1 FROM public.queue_tickets
    WHERE doctor_id = p_doctor_id AND queue_date = v_today AND status IN ('qabulda', 'chaqirildi')
  ) INTO v_active_exists;

  IF v_active_exists THEN
    RAISE EXCEPTION 'Avval joriy chaqirilgan yoki qabuldagi bemorni yakunlang yoki kelmagan deb belgilang';
  END IF;

  SELECT id INTO v_next_id
  FROM public.queue_tickets
  WHERE doctor_id = p_doctor_id
    AND queue_date = v_today
    AND status = 'kutilmoqda'
  ORDER BY priority_level DESC, sequence_number ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Navbatda kutayotgan bemorlar yo''q';
  END IF;

  RETURN public.transition_queue_status(v_next_id, 'chaqirildi', p_actor_id, 'Shifokor keyingi bemorni chaqirdi', NULL);
END;
$$;

-- ============================================================
-- 5. PAYMENTS, REFUNDS & TICKET TOTAL SYNCHRONIZATION
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_ticket_payment_totals(
  p_ticket_id uuid
)
RETURNS public.queue_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket public.queue_tickets%ROWTYPE;
  v_confirmed_paid numeric(14,2) := 0;
  v_refunded numeric(14,2) := 0;
  v_net_paid numeric(14,2) := 0;
  v_status public.ticket_payment_status;
  v_updated public.queue_tickets%ROWTYPE;
BEGIN
  SELECT * INTO v_ticket FROM public.queue_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Navbat chiptasi topilmadi';
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_confirmed_paid
  FROM public.payments
  WHERE queue_ticket_id = p_ticket_id AND is_confirmed = true;

  SELECT coalesce(sum(amount), 0) INTO v_refunded
  FROM public.refunds
  WHERE queue_ticket_id = p_ticket_id;

  v_net_paid := greatest(0, v_confirmed_paid - v_refunded);

  IF v_confirmed_paid = 0 THEN
    v_status := 'unpaid';
  ELSIF v_refunded > 0 AND v_net_paid = 0 THEN
    v_status := 'refunded';
  ELSIF v_net_paid >= v_ticket.total_due THEN
    v_status := 'paid';
  ELSIF v_net_paid > 0 THEN
    v_status := 'partial';
  ELSE
    v_status := 'unpaid';
  END IF;

  UPDATE public.queue_tickets
  SET
    paid_amount = v_net_paid,
    payment_status = v_status
  WHERE id = p_ticket_id
  RETURNING * INTO v_updated;

  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_ticket_payment(
  p_ticket_id uuid,
  p_amount numeric,
  p_payment_method public.payment_method,
  p_actor_id uuid,
  p_is_confirmed boolean DEFAULT true,
  p_override_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket public.queue_tickets%ROWTYPE;
  v_today date := public.tashkent_today();
  v_seq integer;
  v_receipt text;
  v_payment public.payments%ROWTYPE;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'To''lov summasi 0 dan katta bo''lishi kerak';
  END IF;

  SELECT * INTO v_ticket FROM public.queue_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Navbat chiptasi topilmadi';
  END IF;

  INSERT INTO public.receipt_counters (clinic_id, receipt_date, last_number)
  VALUES (v_ticket.clinic_id, v_today, 1)
  ON CONFLICT (clinic_id, receipt_date)
  DO UPDATE SET last_number = public.receipt_counters.last_number + 1
  RETURNING last_number INTO v_seq;

  v_receipt := 'CHK-' || to_char(v_today, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  INSERT INTO public.payments (
    clinic_id,
    receipt_number,
    queue_ticket_id,
    patient_id,
    doctor_id,
    service_id,
    amount,
    payment_method,
    is_confirmed,
    confirmed_at,
    confirmed_by,
    override_reason,
    accepted_by,
    notes
  ) VALUES (
    v_ticket.clinic_id,
    v_receipt,
    v_ticket.id,
    v_ticket.patient_id,
    v_ticket.doctor_id,
    v_ticket.service_id,
    round(p_amount, 2),
    p_payment_method,
    p_is_confirmed,
    CASE WHEN p_is_confirmed THEN now() ELSE NULL END,
    CASE WHEN p_is_confirmed THEN p_actor_id ELSE NULL END,
    p_override_reason,
    p_actor_id,
    p_notes
  )
  RETURNING * INTO v_payment;

  PERFORM public.sync_ticket_payment_totals(v_ticket.id);
  PERFORM public.sync_doctor_earning_for_ticket(v_ticket.id, p_actor_id);

  PERFORM public.write_audit_log(
    v_ticket.clinic_id,
    p_actor_id,
    'payment.created',
    'payment',
    v_payment.id,
    format('To''lov qabul qilindi (%s): %s UZS (%s)', v_receipt, round(p_amount, 2), p_payment_method),
    NULL,
    jsonb_build_object(
      'receipt_number', v_receipt,
      'ticket_number', v_ticket.ticket_number,
      'amount', round(p_amount, 2),
      'payment_method', p_payment_method,
      'is_confirmed', p_is_confirmed
    ),
    p_override_reason
  );

  RETURN v_payment;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_payment_refund(
  p_payment_id uuid,
  p_amount numeric,
  p_refund_method public.payment_method,
  p_reason text,
  p_authorized_by uuid,
  p_created_by uuid
)
RETURNS public.refunds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_already_refunded numeric(14,2) := 0;
  v_today date := public.tashkent_today();
  v_seq integer;
  v_refund_num text;
  v_refund public.refunds%ROWTYPE;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Qaytarish summasi 0 dan katta bo''lishi kerak';
  END IF;

  IF coalesce(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Qaytarish sababi ko''rsatilishi shart';
  END IF;

  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'To''lov topilmadi';
  END IF;

  IF NOT v_payment.is_confirmed THEN
    RAISE EXCEPTION 'Tasdiqlanmagan to''lovni qaytarib bo''lmaydi';
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_already_refunded
  FROM public.refunds
  WHERE payment_id = p_payment_id;

  IF round(p_amount, 2) > (v_payment.amount - v_already_refunded) THEN
    RAISE EXCEPTION 'Qaytariladigan summa mavjud to''lov qoldig''idan oshib ketdi';
  END IF;

  INSERT INTO public.receipt_counters (clinic_id, receipt_date, last_number)
  VALUES (v_payment.clinic_id, v_today, 1)
  ON CONFLICT (clinic_id, receipt_date)
  DO UPDATE SET last_number = public.receipt_counters.last_number + 1
  RETURNING last_number INTO v_seq;

  v_refund_num := 'REF-' || to_char(v_today, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  INSERT INTO public.refunds (
    clinic_id,
    refund_number,
    payment_id,
    queue_ticket_id,
    amount,
    refund_method,
    reason,
    authorized_by,
    created_by
  ) VALUES (
    v_payment.clinic_id,
    v_refund_num,
    v_payment.id,
    v_payment.queue_ticket_id,
    round(p_amount, 2),
    p_refund_method,
    trim(p_reason),
    p_authorized_by,
    p_created_by
  )
  RETURNING * INTO v_refund;

  PERFORM public.sync_ticket_payment_totals(v_payment.queue_ticket_id);
  PERFORM public.sync_doctor_earning_for_ticket(v_payment.queue_ticket_id, p_created_by);

  PERFORM public.write_audit_log(
    v_payment.clinic_id,
    p_created_by,
    'refund.created',
    'refund',
    v_refund.id,
    format('To''lov qaytarildi (%s): %s UZS', v_refund_num, round(p_amount, 2)),
    jsonb_build_object('payment_id', v_payment.id, 'paid_amount', v_payment.amount),
    jsonb_build_object('refund_number', v_refund_num, 'refund_amount', round(p_amount, 2)),
    trim(p_reason)
  );

  RETURN v_refund;
END;
$$;

-- ============================================================
-- 6. PRIVACY-SAFE PUBLIC QUEUE TRACKING QUERY
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_public_ticket_tracking(p_token uuid)
RETURNS TABLE (
  ticket_id uuid,
  clinic_id uuid,
  clinic_name text,
  clinic_phone text,
  clinic_address text,
  ticket_number text,
  sequence_number integer,
  queue_date date,
  status public.queue_status,
  payment_status public.ticket_payment_status,
  patient_name text,
  doctor_id uuid,
  doctor_name text,
  doctor_specialization text,
  room_number text,
  service_name text,
  total_due numeric,
  paid_amount numeric,
  current_serving_ticket_number text,
  people_ahead integer,
  created_at timestamptz,
  called_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_t public.queue_tickets%ROWTYPE;
BEGIN
  SELECT * INTO v_t FROM public.queue_tickets WHERE tracking_token = p_token;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v_t.id,
    v_t.clinic_id,
    cs.clinic_name,
    cs.phone,
    cs.address,
    v_t.ticket_number,
    v_t.sequence_number,
    v_t.queue_date,
    v_t.status,
    v_t.payment_status,
    p.full_name,
    v_t.doctor_id,
    d.full_name,
    d.specialization,
    r.room_number,
    s.name,
    v_t.total_due,
    v_t.paid_amount,
    (
      SELECT qt2.ticket_number
      FROM public.queue_tickets qt2
      WHERE qt2.clinic_id = v_t.clinic_id
        AND qt2.doctor_id = v_t.doctor_id
        AND qt2.queue_date = v_t.queue_date
        AND qt2.status IN ('qabulda', 'chaqirildi')
      ORDER BY (CASE WHEN qt2.status = 'qabulda' THEN 0 ELSE 1 END), qt2.called_at DESC NULLS LAST
      LIMIT 1
    ) AS current_serving_ticket_number,
    CASE
      WHEN v_t.status = 'kutilmoqda' THEN (
        SELECT count(*)::integer
        FROM public.queue_tickets qt3
        WHERE qt3.clinic_id = v_t.clinic_id
          AND qt3.doctor_id = v_t.doctor_id
          AND qt3.queue_date = v_t.queue_date
          AND qt3.status IN ('kutilmoqda', 'chaqirildi')
          AND qt3.id <> v_t.id
          AND (
            qt3.priority_level > v_t.priority_level
            OR (qt3.priority_level = v_t.priority_level AND qt3.sequence_number < v_t.sequence_number)
          )
      )
      ELSE 0
    END AS people_ahead,
    v_t.created_at,
    v_t.called_at,
    v_t.started_at,
    v_t.completed_at
  FROM public.clinic_settings cs
  INNER JOIN public.patients p ON p.id = v_t.patient_id
  INNER JOIN public.doctors d ON d.id = v_t.doctor_id
  INNER JOIN public.services s ON s.id = v_t.service_id
  LEFT JOIN public.rooms r ON r.id = v_t.room_id
  WHERE cs.clinic_id = v_t.clinic_id;
END;
$$;
