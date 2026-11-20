import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CLINIC_ID = "11111111-1111-4111-8111-111111111111";
const DOC_ALI_ID = "41111111-1111-4111-8111-111111111101";
const DOC_MADINA_ID = "41111111-1111-4111-8111-111111111102";
const SRV_STOM_ID = "31111111-1111-4111-8111-111111111101";
const SRV_TERAPIYA_ID = "31111111-1111-4111-8111-111111111102";

const SUPER_ADMIN_USER_ID = "90000000-0000-4000-8000-000000000001";
const ADMIN_USER_ID = "90000000-0000-4000-8000-000000000002";
const DOC_USER_ID = "90000000-0000-4000-8000-000000000003";

describe("PostgreSQL schema, RPC concurrency, queue lifecycle, ledger & audit integrity", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await PGlite.create();

    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY,
        email text UNIQUE
      );
      CREATE OR REPLACE FUNCTION auth.uid()
      RETURNS uuid
      LANGUAGE sql
      STABLE
      AS $$
        SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
      $$;
      CREATE OR REPLACE FUNCTION auth.role()
      RETURNS text
      LANGUAGE sql
      STABLE
      AS $$
        SELECT COALESCE(NULLIF(current_setting('app.test_role', true), ''), 'service_role');
      $$;

      DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      -- PGlite fallback if pgcrypto extension isn't bundled
      CREATE OR REPLACE FUNCTION public.gen_random_bytes(n integer)
      RETURNS bytea
      LANGUAGE sql
      AS $$
        SELECT decode(
          substr(md5(random()::text || clock_timestamp()::text) || md5(random()::text), 1, n * 2),
          'hex'
        );
      $$;
    `);

    const migrations = [
      "supabase/migrations/0001_initial_schema.sql",
      "supabase/migrations/0002_rpc_and_triggers.sql",
      "supabase/migrations/0003_rls_policies.sql",
      "supabase/migrations/0004_realtime.sql",
      "supabase/seed.sql",
    ];

    for (const rel of migrations) {
      let sql = fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");
      if (rel.endsWith("0001_initial_schema.sql")) {
        sql = sql.replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", "-- pgcrypto stubbed for PGlite");
      }
      await db.exec(sql);
    }

    await db.exec(`
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      GRANT SELECT ON public.patients, public.queue_tickets TO anon, authenticated;
    `);

    await db.query(
      `INSERT INTO auth.users (id, email) VALUES
        ($1, 'rahbar@medclinic.uz'),
        ($2, 'admin@medclinic.uz'),
        ($3, 'ali@medclinic.uz')`,
      [SUPER_ADMIN_USER_ID, ADMIN_USER_ID, DOC_USER_ID]
    );

    await db.query(
      `INSERT INTO public.user_profiles (id, clinic_id, role, full_name, username, email) VALUES
        ($1, $4, 'super_admin', 'Super Admin Test', 'rahbar', 'rahbar@medclinic.uz'),
        ($2, $4, 'admin', 'Admin Test', 'admin', 'admin@medclinic.uz'),
        ($3, $4, 'doctor', 'Dr. Ali Valiyev', 'dr_ali', 'ali@medclinic.uz')`,
      [SUPER_ADMIN_USER_ID, ADMIN_USER_ID, DOC_USER_ID, CLINIC_ID]
    );

    await db.query(`UPDATE public.doctors SET user_id = $1 WHERE id = $2`, [
      DOC_USER_ID,
      DOC_ALI_ID,
    ]);
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
  });

  it("Test 1 & 2: creates online and walk-in tickets in unified queue, applies active promotion, and protects privacy", async () => {
    // 1. Online booking (promotion from seed.sql applies 15% discount to Stomatologiya 180000 -> 153000)
    const onlineRes = await db.query<{
      ticket_id: string;
      ticket_number: string;
      tracking_token: string;
      service_price: string;
      discount_amount: string;
      total_due: string;
    }>(
      `SELECT * FROM public.create_queue_ticket(
        $1::uuid,
        'Aziza Karimova'::text,
        '+998 90 555 11 22'::text,
        $2::uuid,
        $3::uuid,
        'online'::text,
        true,
        NULL::text,
        NULL::uuid,
        NULL::uuid,
        0,
        NULL::text
      )`,
      [CLINIC_ID, DOC_ALI_ID, SRV_STOM_ID]
    );
    const onlineTicket = onlineRes.rows[0];
    expect(onlineTicket.ticket_number).toBe("A-001");
    expect(Number(onlineTicket.service_price)).toBe(180000);
    expect(Number(onlineTicket.discount_amount)).toBe(27000);
    expect(Number(onlineTicket.total_due)).toBe(153000);

    // 2. Walk-in booking enters the exact same queue as A-002
    const walkInRes = await db.query<{
      ticket_id: string;
      ticket_number: string;
      tracking_token: string;
    }>(
      `SELECT * FROM public.create_queue_ticket(
        $1::uuid,
        'Bobur Toshmatov'::text,
        '+998 91 777 88 99'::text,
        $2::uuid,
        $3::uuid,
        'walk_in'::text,
        true,
        'Shoshilinch emas'::text,
        NULL::uuid,
        $4::uuid,
        0,
        NULL::text
      )`,
      [CLINIC_ID, DOC_ALI_ID, SRV_STOM_ID, ADMIN_USER_ID]
    );
    const walkInTicket = walkInRes.rows[0];
    expect(walkInTicket.ticket_number).toBe("A-002");

    // 3. Public tracking RPC returns count of people ahead without exposing Aziza's PII to Bobur
    const trackRes = await db.query<{
      ticket_number: string;
      patient_name: string;
      people_ahead: number;
      room_number: string | null;
    }>(`SELECT * FROM public.get_public_ticket_tracking($1::uuid)`, [
      walkInTicket.tracking_token,
    ]);
    const tracking = trackRes.rows[0];
    expect(tracking.ticket_number).toBe("A-002");
    expect(tracking.patient_name).toBe("Bobur Toshmatov");
    expect(Number(tracking.people_ahead)).toBe(1);
    expect(tracking.room_number).toBe("204");
    expect(JSON.stringify(tracking)).not.toContain("Aziza Karimova");
    expect(JSON.stringify(tracking)).not.toContain("555 11 22");
  });

  it("Test 3: concurrent simultaneous registrations produce unique sequential numbers with daily reset", async () => {
    const promises = Array.from({ length: 8 }, (_, idx) =>
      db.query<{ ticket_number: string; sequence_number: number }>(
        `SELECT * FROM public.create_queue_ticket(
          $1::uuid,
          $2::text,
          $3::text,
          $4::uuid,
          $5::uuid,
          'online'::text,
          true,
          NULL::text,
          NULL::uuid,
          NULL::uuid,
          0,
          NULL::text
        )`,
        [CLINIC_ID, `Bemor ${idx + 1}`, `+99890100000${idx}`, DOC_MADINA_ID, SRV_TERAPIYA_ID]
      )
    );
    const results = await Promise.all(promises);
    const ticketNumbers = results.map((r) => r.rows[0].ticket_number).sort();
    expect(new Set(ticketNumbers).size).toBe(8);
    expect(ticketNumbers).toEqual([
      "A-003",
      "A-004",
      "A-005",
      "A-006",
      "A-007",
      "A-008",
      "A-009",
      "A-010",
    ]);

    // Simulate next day -> daily reset generates A-001 again
    await db.exec(`
      CREATE OR REPLACE FUNCTION public.tashkent_today()
      RETURNS date
      LANGUAGE sql
      STABLE
      AS $$
        SELECT ((now() AT TIME ZONE 'Asia/Tashkent')::date + 1);
      $$;
    `);

    const nextDay = await db.query<{ ticket_number: string }>(
      `SELECT * FROM public.create_queue_ticket(
        $1::uuid,
        'Ertangi Bemor'::text,
        '+998931234567'::text,
        $2::uuid,
        $3::uuid,
        'online'::text,
        true,
        NULL::text,
        NULL::uuid,
        NULL::uuid,
        0,
        NULL::text
      )`,
      [CLINIC_ID, DOC_MADINA_ID, SRV_TERAPIYA_ID]
    );
    expect(nextDay.rows[0].ticket_number).toBe("A-001");

    // Restore real tashkent_today()
    await db.exec(`
      CREATE OR REPLACE FUNCTION public.tashkent_today()
      RETURNS date
      LANGUAGE sql
      STABLE
      AS $$
        SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date;
      $$;
    `);
  });

  it("Test 4, 5, 6 & 7: enforces doctor queue separation, payment -> accrual earnings -> refund adjustment -> audit logs", async () => {
    const ticketsRes = await db.query<{ id: string; ticket_number: string; status: string }>(
      `SELECT id, ticket_number, status FROM public.queue_tickets
       WHERE clinic_id = $1 AND doctor_id = $2 AND queue_date = public.tashkent_today()
       ORDER BY sequence_number ASC`,
      [CLINIC_ID, DOC_ALI_ID]
    );
    const t1 = ticketsRes.rows[0];
    const t2 = ticketsRes.rows[1];
    expect(t1.ticket_number).toBe("A-001");
    expect(t2.ticket_number).toBe("A-002");

    // 1. Admin records partial payment (53,000 UZS), then remaining payment (100,000 UZS)
    const p1Res = await db.query<{ id: string; receipt_number: string }>(
      `SELECT * FROM public.record_ticket_payment(
        $1::uuid, 53000, 'cash'::public.payment_method, $2::uuid, true, NULL::text, NULL::text
      )`,
      [t1.id, ADMIN_USER_ID]
    );
    const tAfterP1 = await db.query<{ payment_status: string; paid_amount: string }>(
      `SELECT payment_status, paid_amount::text FROM public.queue_tickets WHERE id = $1`,
      [t1.id]
    );
    expect(tAfterP1.rows[0].payment_status).toBe("partial");
    expect(Number(tAfterP1.rows[0].paid_amount)).toBe(53000);

    const p2Res = await db.query<{ id: string; receipt_number: string }>(
      `SELECT * FROM public.record_ticket_payment(
        $1::uuid, 100000, 'card'::public.payment_method, $2::uuid, true, NULL::text, NULL::text
      )`,
      [t1.id, ADMIN_USER_ID]
    );
    const payment2Id = p2Res.rows[0].id;
    const tAfterP2 = await db.query<{ payment_status: string; paid_amount: string }>(
      `SELECT payment_status, paid_amount::text FROM public.queue_tickets WHERE id = $1`,
      [t1.id]
    );
    expect(tAfterP2.rows[0].payment_status).toBe("paid");
    expect(Number(tAfterP2.rows[0].paid_amount)).toBe(153000);
    expect(p2Res.rows[0].receipt_number).not.toBe(p1Res.rows[0].receipt_number);

    // 2. Doctor calls next patient -> calls A-001 to 'chaqirildi'
    const called = await db.query<{ id: string; status: string }>(
      `SELECT * FROM public.call_next_queue_ticket($1::uuid, $2::uuid)`,
      [DOC_ALI_ID, DOC_USER_ID]
    );
    expect(called.rows[0].id).toBe(t1.id);
    expect(called.rows[0].status).toBe("chaqirildi");

    // 3. Doctor starts consultation ('qabulda')
    await db.query(
      `SELECT * FROM public.transition_queue_status($1::uuid, 'qabulda'::public.queue_status, $2::uuid, NULL::text, 'Ko''rik boshlandi'::text)`,
      [t1.id, DOC_USER_ID]
    );

    // DB partial unique index prevents 2 simultaneous 'qabulda' tickets for same doctor
    await expect(
      db.query(`UPDATE public.queue_tickets SET status = 'qabulda' WHERE id = $1`, [t2.id])
    ).rejects.toThrow();

    // 4. Doctor completes consultation ('yakunlandi') -> triggers 40% commission accrual (61,200 UZS)
    await db.query(
      `SELECT * FROM public.transition_queue_status($1::uuid, 'yakunlandi'::public.queue_status, $2::uuid, NULL::text, 'Plomba qo''yildi'::text)`,
      [t1.id, DOC_USER_ID]
    );

    // Completing t1 must NOT auto-call or auto-start t2!
    const t2After = await db.query<{ status: string }>(
      `SELECT status FROM public.queue_tickets WHERE id = $1`,
      [t2.id]
    );
    expect(t2After.rows[0].status).toBe("kutilmoqda");

    const accrualRes = await db.query<{ entry_type: string; doctor_amount: string }>(
      `SELECT entry_type, doctor_amount::text FROM public.doctor_earnings WHERE queue_ticket_id = $1`,
      [t1.id]
    );
    expect(accrualRes.rows).toHaveLength(1);
    expect(accrualRes.rows[0].entry_type).toBe("accrual");
    expect(Number(accrualRes.rows[0].doctor_amount)).toBe(61200);

    // 5. Partial refund of 50,000 UZS creates negative doctor_earning adjustment (-20,000 -> net 41,200)
    await db.query(
      `SELECT * FROM public.record_payment_refund(
        $1::uuid, 50000, 'card'::public.payment_method, 'Xizmat qismi bekor qilindi'::text, $2::uuid, $2::uuid
      )`,
      [payment2Id, ADMIN_USER_ID]
    );

    const netEarningsRes = await db.query<{ total: string }>(
      `SELECT COALESCE(SUM(doctor_amount), 0)::text AS total FROM public.doctor_earnings WHERE queue_ticket_id = $1`,
      [t1.id]
    );
    expect(Number(netEarningsRes.rows[0].total)).toBe(41200);

    // Over-refund must be rejected
    await expect(
      db.query(
        `SELECT * FROM public.record_payment_refund(
          $1::uuid, 60000, 'card'::public.payment_method, 'Xato'::text, $2::uuid, $2::uuid
        )`,
        [payment2Id, ADMIN_USER_ID]
      )
    ).rejects.toThrow();
  });

  it("Test 8: audit_logs cannot be updated or deleted (immutable audit trail)", async () => {
    const logs = await db.query<{ id: string }>(`SELECT id FROM public.audit_logs LIMIT 1`);
    expect(logs.rows.length).toBeGreaterThan(0);
    const id = logs.rows[0].id;

    await expect(
      db.query(`UPDATE public.audit_logs SET summary = 'hacked' WHERE id = $1`, [id])
    ).rejects.toThrow();

    await expect(
      db.query(`DELETE FROM public.audit_logs WHERE id = $1`, [id])
    ).rejects.toThrow();
  });

  it("Test 9: RLS enforces doctor isolation and hides patient PII from anon", async () => {
    await db.exec(`
      SELECT set_config('app.current_user_id', '', false);
      SELECT set_config('app.test_role', 'anon', false);
      SET ROLE anon;
    `);
    const anonPatients = await db.query(`SELECT id FROM public.patients`);
    expect(anonPatients.rows).toHaveLength(0);

    await db.exec(`
      RESET ROLE;
      SELECT set_config('app.current_user_id', '${DOC_USER_ID}', false);
      SELECT set_config('app.test_role', 'authenticated', false);
      SET ROLE authenticated;
    `);
    const docTickets = await db.query<{ doctor_id: string }>(
      `SELECT DISTINCT doctor_id FROM public.queue_tickets`
    );
    expect(docTickets.rows.length).toBeGreaterThan(0);
    expect(docTickets.rows.every((r) => r.doctor_id === DOC_ALI_ID)).toBe(true);

    await db.exec(`RESET ROLE;`);
  });

  it("Test 10: LocalPgAdapter initializes migrations, seed, operational records, and relational PostgREST queries cleanly", async () => {
    process.env.MEDCLINIC_LOCAL_PG = "true";
    process.env.LOCAL_SUPER_ADMIN_USERNAME = "superadmin";
    process.env.LOCAL_SUPER_ADMIN_PASSWORD = "MedClinic#2026!";
    process.env.LOCAL_ADMIN_USERNAME = "admin";
    process.env.LOCAL_ADMIN_PASSWORD = "AdminClinic#2026!";
    process.env.LOCAL_DOCTOR_USERNAME = "dr_ali";
    process.env.LOCAL_DOCTOR_PASSWORD = "DoctorClinic#2026!";

    const { createLocalServiceRoleClient } = await import(
      "@/lib/supabase/local-pg-adapter"
    );
    const { getPublicClinicBundle } = await import("@/lib/data/public-clinic");

    const client = createLocalServiceRoleClient();
    const { data: profiles, error: profErr } = await client
      .from("user_profiles")
      .select("*")
      .eq("clinic_id", CLINIC_ID);

    expect(profErr).toBeNull();
    expect(profiles?.length).toBe(4);

    const bundle = await getPublicClinicBundle();
    expect(bundle.configured).toBe(true);
    expect(bundle.clinicId).toBe(CLINIC_ID);
    expect(bundle.services.length).toBe(5);
    expect(bundle.doctors.length).toBe(4);
    expect(bundle.promotions.length).toBe(1);
    expect(bundle.stats.patientsCount).toBeGreaterThanOrEqual(7);
  });
});
