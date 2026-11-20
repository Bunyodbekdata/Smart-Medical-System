-- supabase/seed.sql
-- Development catalog seed data ONLY (do not use for production secrets or default credentials).
-- Staff authentication accounts must be provisioned via scripts/provision-staff.mjs or Super Admin UI.

DO $$
DECLARE
  v_clinic_id uuid := '11111111-1111-4111-8111-111111111111';
  v_room_101 uuid := '21111111-1111-4111-8111-111111111101';
  v_room_204 uuid := '21111111-1111-4111-8111-111111111204';
  v_room_105 uuid := '21111111-1111-4111-8111-111111111105';
  v_room_108 uuid := '21111111-1111-4111-8111-111111111108';
  v_room_210 uuid := '21111111-1111-4111-8111-111111111210';

  v_srv_stomatologiya uuid := '31111111-1111-4111-8111-111111111101';
  v_srv_terapiya uuid := '31111111-1111-4111-8111-111111111102';
  v_srv_laboratoriya uuid := '31111111-1111-4111-8111-111111111103';
  v_srv_uzi uuid := '31111111-1111-4111-8111-111111111104';
  v_srv_kardiologiya uuid := '31111111-1111-4111-8111-111111111105';

  v_doc_ali uuid := '41111111-1111-4111-8111-111111111101';
  v_doc_madina uuid := '41111111-1111-4111-8111-111111111102';
  v_doc_sardor uuid := '41111111-1111-4111-8111-111111111103';
  v_doc_dilnoza uuid := '41111111-1111-4111-8111-111111111104';
  v_d smallint;
BEGIN
  INSERT INTO public.clinics (id, slug, name, is_active)
  VALUES (v_clinic_id, 'xushvaqt-medclinic', 'MedClinic', true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.clinic_settings (
    clinic_id, clinic_name, tagline,
    hero_title, hero_subtitle,
    address, phone, email, working_hours_summary,
    stats_doctors_override, stats_services_override, stats_patients_override,
    stats_experience_years, stats_positive_rate
  ) VALUES (
    v_clinic_id,
    'MedClinic',
    'Zamonaviy diagnostika va davolash markazi',
    'Sizning sog''lig''ingiz — bizning ustuvor vazifamiz',
    'Zamonaviy uskunalar, tajribali shifokorlar va sifatli tibbiy xizmatlar.',
    'Toshkent shahri, Chilonzor tumani, Bunyodkor shoh ko''chasi, 45-uy',
    '+998 71 200 45 00',
    'qabul@medclinic.uz',
    'Dushanba - Shanba: 08:00 - 20:00 | Yakshanba: 09:00 - 15:00',
    NULL, NULL, NULL, 8, 98.0
  )
  ON CONFLICT (clinic_id) DO NOTHING;

  INSERT INTO public.rooms (id, clinic_id, room_number, name, floor) VALUES
    (v_room_204, v_clinic_id, '204', 'Stomatologiya kabineti', '2-qavat'),
    (v_room_101, v_clinic_id, '101', 'Terapiya kabineti', '1-qavat'),
    (v_room_105, v_clinic_id, '105', 'UZI diagnostika xonasi', '1-qavat'),
    (v_room_108, v_clinic_id, '108', 'Laboratoriya tahlil xonasi', '1-qavat'),
    (v_room_210, v_clinic_id, '210', 'Kardiologiya kabineti', '2-qavat')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.services (id, clinic_id, name, category, description, icon_name, price, duration_minutes, queue_prefix, sort_order) VALUES
    (v_srv_stomatologiya, v_clinic_id, 'Stomatologiya', 'Stomatologiya', 'Tish davolash, implant, protez va og''iz bo''shlig''i gigiyenasi xizmatlari.', 'SmilePlus', 180000, 30, 'A', 1),
    (v_srv_terapiya, v_clinic_id, 'Terapiya', 'Umumiy amaliyot', 'Umumiy sog''liqni tekshirish, dastlabki ko''rik va davolash rejasi.', 'Stethoscope', 120000, 20, 'A', 2),
    (v_srv_laboratoriya, v_clinic_id, 'Laboratoriya', 'Diagnostika', 'Umumiy va biokimyoviy qon tahlillari hamda tezkor laboratoriya diagnostikasi.', 'FlaskConical', 95000, 15, 'L', 3),
    (v_srv_uzi, v_clinic_id, 'UZI diagnostika', 'Diagnostika', 'Zamonaviy ekspert sinfidagi UZI apparatlarida ichki a''zolarni tekshirish.', 'ScanHeart', 160000, 25, 'U', 4),
    (v_srv_kardiologiya, v_clinic_id, 'Kardiologiya', 'Mutaxassis', 'Yurak-qon tomir tizimi tekshiruvi, EKG tahlili va kardiolog konsultatsiyasi.', 'HeartPulse', 200000, 30, 'K', 5)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.doctors (id, clinic_id, full_name, specialization, experience_years, biography, room_id, consultation_price, queue_prefix, availability_status, rating, reviews_count) VALUES
    (v_doc_ali, v_clinic_id, 'Dr. Ali Valiyev', 'Stomatolog', 8, 'Tish davolash va estetik stomatologiya bo''yicha oliy toifali mutaxassis.', v_room_204, 180000, 'A', 'available', 4.9, 320),
    (v_doc_madina, v_clinic_id, 'Dr. Madina Karimova', 'Terapevt', 6, 'Kattalar terapiyasi va profilaktik tibbiy ko''rik bo''yicha tajribali shifokor.', v_room_101, 120000, 'A', 'available', 4.8, 210),
    (v_doc_sardor, v_clinic_id, 'Dr. Sardor Rasulov', 'UZI mutaxassisi', 10, 'Ichki a''zolar va qon tomirlar ultratovush diagnostikasi bo''yicha mutaxassis.', v_room_105, 160000, 'U', 'available', 4.9, 410),
    (v_doc_dilnoza, v_clinic_id, 'Dr. Dilnoza Toshmatova', 'Kardiolog', 9, 'Yurak-qon tomir kasalliklari diagnostikasi va davolash bo''yicha mutaxassis.', v_room_210, 200000, 'K', 'available', 4.9, 185)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.doctor_services (clinic_id, doctor_id, service_id, custom_price) VALUES
    (v_clinic_id, v_doc_ali, v_srv_stomatologiya, 180000),
    (v_clinic_id, v_doc_madina, v_srv_terapiya, 120000),
    (v_clinic_id, v_doc_madina, v_srv_laboratoriya, 95000),
    (v_clinic_id, v_doc_sardor, v_srv_uzi, 160000),
    (v_clinic_id, v_doc_dilnoza, v_srv_kardiologiya, 200000)
  ON CONFLICT (doctor_id, service_id) DO NOTHING;

  FOR v_d IN 1..6 LOOP
    INSERT INTO public.doctor_schedules (clinic_id, doctor_id, day_of_week, start_time, end_time, break_start, break_end, is_working) VALUES
      (v_clinic_id, v_doc_ali, v_d, '09:00', '18:00', '13:00', '14:00', true),
      (v_clinic_id, v_doc_madina, v_d, '08:30', '17:30', '13:00', '14:00', true),
      (v_clinic_id, v_doc_sardor, v_d, '09:00', '18:00', '13:00', '14:00', true),
      (v_clinic_id, v_doc_dilnoza, v_d, '09:00', '17:00', '13:00', '14:00', true)
    ON CONFLICT (doctor_id, day_of_week) DO NOTHING;
  END LOOP;

  INSERT INTO public.promotions (clinic_id, title, description, discount_type, discount_value, service_id, starts_at, ends_at, is_active) VALUES
    (
      v_clinic_id,
      'Stomatologiya xizmatlariga 15% chegirma!',
      'Tish davolash va professional konsultatsiya xizmatlaridan foydalanib 15% chegirmaga ega bo''ling.',
      'percentage',
      15,
      v_srv_stomatologiya,
      (CURRENT_DATE - 5),
      (CURRENT_DATE + 45),
      true
    )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.commission_rules (clinic_id, doctor_id, service_id, commission_type, commission_value, effective_from, notes, is_active)
  VALUES (
    v_clinic_id, NULL, NULL, 'percentage', 40, (CURRENT_DATE - 30), 'Klinika bo''yicha standart shifokor ulushi (40%)', true
  )
  ON CONFLICT DO NOTHING;
END $$;
