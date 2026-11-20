-- 0004_realtime.sql
-- Enable Supabase Realtime publications safely for live queue and payment sync

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'queue_tickets'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_tickets;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'payments'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'consultations'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.consultations;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'doctors'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.doctors;
    END IF;
  END IF;
END $$;
