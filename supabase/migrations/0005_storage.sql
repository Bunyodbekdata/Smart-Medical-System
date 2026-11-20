-- 0005_storage.sql
-- Supabase Storage bucket and policies for clinic media (logos, doctor photos, service & promo images)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'clinic-media',
      'clinic-media',
      true,
      5242880, -- 5 MB
      ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    DROP POLICY IF EXISTS clinic_media_public_read ON storage.objects;
    CREATE POLICY clinic_media_public_read ON storage.objects
      FOR SELECT TO public
      USING (bucket_id = 'clinic-media');

    DROP POLICY IF EXISTS clinic_media_super_admin_write ON storage.objects;
    CREATE POLICY clinic_media_super_admin_write ON storage.objects
      FOR ALL TO authenticated
      USING (bucket_id = 'clinic-media' AND public.current_user_role() = 'super_admin')
      WITH CHECK (bucket_id = 'clinic-media' AND public.current_user_role() = 'super_admin');
  END IF;
END $$;
