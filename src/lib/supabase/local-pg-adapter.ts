import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Pool, types } from "pg";
import { cookies } from "next/headers";
import { getPostgresUrl } from "./env";

// Return PostgreSQL DATE (OID 1082) as exact 'YYYY-MM-DD' string without timezone drift
types.setTypeParser(1082, (val: string) => val);

export interface PgExecutor {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
}

export const LOCAL_SESSION_COOKIE = "medclinic_local_session";

const CLINIC_ID = "11111111-1111-4111-8111-111111111111";
const DOC_ALI_ID = "41111111-1111-4111-8111-111111111101";
const DOC_MADINA_ID = "41111111-1111-4111-8111-111111111102";
const DOC_SARDOR_ID = "41111111-1111-4111-8111-111111111103";

const SRV_STOM_ID = "31111111-1111-4111-8111-111111111101";
const SRV_TERAPIYA_ID = "31111111-1111-4111-8111-111111111102";
const SRV_LAB_ID = "31111111-1111-4111-8111-111111111103";
const SRV_UZI_ID = "31111111-1111-4111-8111-111111111104";

const SUPER_ADMIN_USER_ID = "90000000-0000-4000-8000-000000000001";
const ADMIN_USER_ID = "90000000-0000-4000-8000-000000000002";
const DOC_ALI_USER_ID = "90000000-0000-4000-8000-000000000003";
const DOC_MADINA_USER_ID = "90000000-0000-4000-8000-000000000004";

const DATE_ONLY_COLUMNS = new Set([
  "queue_date",
  "starts_at",
  "ends_at",
  "effective_date",
  "effective_from",
  "effective_to",
  "expense_date",
  "birth_date",
  "receipt_date",
]);

const JSON_COLUMNS = new Set([
  "social_links",
  "previous_values",
  "new_values",
  "metadata",
]);

interface RelationDef {
  type: "many-to-one" | "one-to-many";
  targetTable: string;
  localKey: string;
  foreignKey: string;
}

const TABLE_RELATIONS: Record<string, Record<string, RelationDef>> = {
  doctors: {
    room: { type: "many-to-one", targetTable: "rooms", localKey: "room_id", foreignKey: "id" },
    user_profile: {
      type: "many-to-one",
      targetTable: "user_profiles",
      localKey: "user_id",
      foreignKey: "id",
    },
    doctor_services: {
      type: "one-to-many",
      targetTable: "doctor_services",
      localKey: "id",
      foreignKey: "doctor_id",
    },
    doctor_schedules: {
      type: "one-to-many",
      targetTable: "doctor_schedules",
      localKey: "id",
      foreignKey: "doctor_id",
    },
  },
  services: {
    doctor_services: {
      type: "one-to-many",
      targetTable: "doctor_services",
      localKey: "id",
      foreignKey: "service_id",
    },
  },
  doctor_services: {
    service: {
      type: "many-to-one",
      targetTable: "services",
      localKey: "service_id",
      foreignKey: "id",
    },
    doctor: {
      type: "many-to-one",
      targetTable: "doctors",
      localKey: "doctor_id",
      foreignKey: "id",
    },
  },
  promotions: {
    service: {
      type: "many-to-one",
      targetTable: "services",
      localKey: "service_id",
      foreignKey: "id",
    },
  },
  queue_tickets: {
    patient: {
      type: "many-to-one",
      targetTable: "patients",
      localKey: "patient_id",
      foreignKey: "id",
    },
    doctor: {
      type: "many-to-one",
      targetTable: "doctors",
      localKey: "doctor_id",
      foreignKey: "id",
    },
    service: {
      type: "many-to-one",
      targetTable: "services",
      localKey: "service_id",
      foreignKey: "id",
    },
    room: {
      type: "many-to-one",
      targetTable: "rooms",
      localKey: "room_id",
      foreignKey: "id",
    },
  },
  payments: {
    patient: {
      type: "many-to-one",
      targetTable: "patients",
      localKey: "patient_id",
      foreignKey: "id",
    },
    doctor: {
      type: "many-to-one",
      targetTable: "doctors",
      localKey: "doctor_id",
      foreignKey: "id",
    },
    service: {
      type: "many-to-one",
      targetTable: "services",
      localKey: "service_id",
      foreignKey: "id",
    },
    ticket: {
      type: "many-to-one",
      targetTable: "queue_tickets",
      localKey: "queue_ticket_id",
      foreignKey: "id",
    },
    accepted_by_profile: {
      type: "many-to-one",
      targetTable: "user_profiles",
      localKey: "accepted_by",
      foreignKey: "id",
    },
    refunds: {
      type: "one-to-many",
      targetTable: "refunds",
      localKey: "id",
      foreignKey: "payment_id",
    },
  },
  expenses: {
    responsible_user: {
      type: "many-to-one",
      targetTable: "user_profiles",
      localKey: "responsible_user_id",
      foreignKey: "id",
    },
  },
  commission_rules: {
    doctor: {
      type: "many-to-one",
      targetTable: "doctors",
      localKey: "doctor_id",
      foreignKey: "id",
    },
    service: {
      type: "many-to-one",
      targetTable: "services",
      localKey: "service_id",
      foreignKey: "id",
    },
  },
  doctor_earnings: {
    doctor: {
      type: "many-to-one",
      targetTable: "doctors",
      localKey: "doctor_id",
      foreignKey: "id",
    },
    ticket: {
      type: "many-to-one",
      targetTable: "queue_tickets",
      localKey: "queue_ticket_id",
      foreignKey: "id",
    },
    commission_rule: {
      type: "many-to-one",
      targetTable: "commission_rules",
      localKey: "commission_rule_id",
      foreignKey: "id",
    },
  },
  consultations: {
    patient: {
      type: "many-to-one",
      targetTable: "patients",
      localKey: "patient_id",
      foreignKey: "id",
    },
    service: {
      type: "many-to-one",
      targetTable: "services",
      localKey: "service_id",
      foreignKey: "id",
    },
    ticket: {
      type: "many-to-one",
      targetTable: "queue_tickets",
      localKey: "queue_ticket_id",
      foreignKey: "id",
    },
  },
};

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, "hex");
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

function getSigningSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.LOCAL_AUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "medclinic-local-pg-session-key"
  );
}

export function createSignedSessionToken(userId: string): string {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = `${userId}.${exp}`;
  const sig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(payload)
    .digest("hex");
  return `${payload}.${sig}`;
}

export function verifySignedSessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  const expected = crypto
    .createHmac("sha256", getSigningSecret())
    .update(`${userId}.${expStr}`)
    .digest("hex");
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  return userId;
}

declare global {
  var __medclinicLocalPgPromise: Promise<PgExecutor> | undefined;
  var __medclinicPgPool: Pool | undefined;
}

async function provisionConfiguredStaffAccounts(db: PgExecutor) {
  const superAdminPass =
    process.env.SUPER_ADMIN_PASSWORD || process.env.LOCAL_SUPER_ADMIN_PASSWORD;
  const adminPass = process.env.ADMIN_PASSWORD || process.env.LOCAL_ADMIN_PASSWORD;
  const docPass = process.env.DOCTOR_PASSWORD || process.env.LOCAL_DOCTOR_PASSWORD;

  if (superAdminPass) {
    const saUsername = (
      process.env.SUPER_ADMIN_USERNAME ||
      process.env.LOCAL_SUPER_ADMIN_USERNAME ||
      "superadmin"
    ).toLowerCase();
    const saEmail = (
      process.env.SUPER_ADMIN_EMAIL ||
      process.env.LOCAL_SUPER_ADMIN_EMAIL ||
      "rahbar@medclinic.uz"
    ).toLowerCase();
    await db.query(
      `INSERT INTO auth.users (id, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [SUPER_ADMIN_USER_ID, saEmail, hashPassword(superAdminPass)]
    );
    await db.query(
      `INSERT INTO public.user_profiles (id, clinic_id, role, full_name, username, email, phone, is_active)
       VALUES ($1, $2, 'super_admin', 'Dilshod Karimov', $3, $4, '+998 90 100 00 01', true)
       ON CONFLICT (id) DO NOTHING`,
      [SUPER_ADMIN_USER_ID, CLINIC_ID, saUsername, saEmail]
    );
  }

  if (adminPass) {
    const admUsername = (
      process.env.ADMIN_USERNAME ||
      process.env.LOCAL_ADMIN_USERNAME ||
      "admin"
    ).toLowerCase();
    const admEmail = (
      process.env.ADMIN_EMAIL ||
      process.env.LOCAL_ADMIN_EMAIL ||
      "admin@medclinic.uz"
    ).toLowerCase();
    await db.query(
      `INSERT INTO auth.users (id, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [ADMIN_USER_ID, admEmail, hashPassword(adminPass)]
    );
    await db.query(
      `INSERT INTO public.user_profiles (id, clinic_id, role, full_name, username, email, phone, is_active)
       VALUES ($1, $2, 'admin', 'Aziza Rustamova', $3, $4, '+998 90 100 00 02', true)
       ON CONFLICT (id) DO NOTHING`,
      [ADMIN_USER_ID, CLINIC_ID, admUsername, admEmail]
    );
  }

  if (docPass) {
    const docUsername = (
      process.env.DOCTOR_USERNAME ||
      process.env.LOCAL_DOCTOR_USERNAME ||
      "dr_ali"
    ).toLowerCase();
    const docEmail = (
      process.env.DOCTOR_EMAIL ||
      process.env.LOCAL_DOCTOR_EMAIL ||
      "ali@medclinic.uz"
    ).toLowerCase();
    await db.query(
      `INSERT INTO auth.users (id, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [DOC_ALI_USER_ID, docEmail, hashPassword(docPass)]
    );
    await db.query(
      `INSERT INTO public.user_profiles (id, clinic_id, role, full_name, username, email, phone, is_active)
       VALUES ($1, $2, 'doctor', 'Dr. Ali Valiyev', $3, $4, '+998 90 100 00 03', true)
       ON CONFLICT (id) DO NOTHING`,
      [DOC_ALI_USER_ID, CLINIC_ID, docUsername, docEmail]
    );
    await db.query(
      `UPDATE public.doctors SET user_id = $1 WHERE id = $2 AND user_id IS NULL`,
      [DOC_ALI_USER_ID, DOC_ALI_ID]
    );

    await db.query(
      `INSERT INTO auth.users (id, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [DOC_MADINA_USER_ID, "madina@medclinic.uz", hashPassword(docPass)]
    );
    await db.query(
      `INSERT INTO public.user_profiles (id, clinic_id, role, full_name, username, email, phone, is_active)
       VALUES ($1, $2, 'doctor', 'Dr. Madina Karimova', 'dr_madina', 'madina@medclinic.uz', '+998 90 100 00 04', true)
       ON CONFLICT (id) DO NOTHING`,
      [DOC_MADINA_USER_ID, CLINIC_ID]
    );
    await db.query(
      `UPDATE public.doctors SET user_id = $1 WHERE id = $2 AND user_id IS NULL`,
      [DOC_MADINA_USER_ID, DOC_MADINA_ID]
    );
  }
}

async function initializeDirectPostgres(connectionString: string): Promise<PgExecutor> {
  const isLocalHost =
    connectionString.includes("localhost") || connectionString.includes("127.0.0.1");

  if (!globalThis.__medclinicPgPool) {
    globalThis.__medclinicPgPool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 15_000,
      ssl: isLocalHost ? false : { rejectUnauthorized: false },
    });
  }

  const pool = globalThis.__medclinicPgPool;
  const executor: PgExecutor = {
    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
      const res = await pool.query(sql, params);
      return { rows: res.rows as T[] };
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
  };

  // Fast check: skip heavy migrations if schema is already initialized on Neon
  const check = await executor.query<{ tbl: string | null }>(
    `SELECT to_regclass('public.clinics') AS tbl`
  );

  if (!check.rows[0]?.tbl) {
    await executor.exec(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY,
        email text UNIQUE NOT NULL,
        password_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
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
    `);

    const migrations = [
      "migrations/0001_initial_schema.sql",
      "migrations/0002_rpc_and_triggers.sql",
      "seed.sql",
    ];

    for (const rel of migrations) {
      const fullPath = path.join(process.cwd(), "supabase", rel);
      const sql = fs.readFileSync(fullPath, "utf8");
      await executor.exec(sql);
    }
  }

  // Ensure initial staff accounts exist if configured via env vars and no users yet
  const usersCount = await executor.query<{ cnt: string }>(
    `SELECT count(*)::text AS cnt FROM auth.users`
  );
  if (Number(usersCount.rows[0]?.cnt ?? 0) === 0) {
    await provisionConfiguredStaffAccounts(executor);
  }

  return executor;
}

async function initializeLocalPg(): Promise<PgExecutor> {
  const postgresUrl = getPostgresUrl();
  if (postgresUrl) {
    return initializeDirectPostgres(postgresUrl);
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const db = await PGlite.create();

  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY,
      email text UNIQUE NOT NULL,
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
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
    "migrations/0001_initial_schema.sql",
    "migrations/0002_rpc_and_triggers.sql",
    "migrations/0003_rls_policies.sql",
    "migrations/0004_realtime.sql",
    "seed.sql",
  ];

  for (const rel of migrations) {
    const fullPath = path.join(process.cwd(), "supabase", rel);
    let sql = fs.readFileSync(fullPath, "utf8");
    if (rel.endsWith("0001_initial_schema.sql")) {
      sql = sql.replace(
        "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
        "-- pgcrypto handled via gen_random_bytes stub in PGlite"
      );
    }
    await db.exec(sql);
  }

  await provisionConfiguredStaffAccounts(db);

  // Seed initial live operational queue/payment/consultation records using real PostgreSQL RPCs
  const hasAllLocalPasswords = Boolean(
    (process.env.SUPER_ADMIN_PASSWORD || process.env.LOCAL_SUPER_ADMIN_PASSWORD) &&
      (process.env.ADMIN_PASSWORD || process.env.LOCAL_ADMIN_PASSWORD) &&
      (process.env.DOCTOR_PASSWORD || process.env.LOCAL_DOCTOR_PASSWORD)
  );
  if (hasAllLocalPasswords) {
    await seedInitialOperationalRecords(db);
  }

  return db;
}

async function seedInitialOperationalRecords(db: PgExecutor) {
  const existing = await db.query<{ cnt: string }>(
    `SELECT count(*)::text AS cnt FROM public.queue_tickets WHERE clinic_id = $1`,
    [CLINIC_ID]
  );
  if (Number(existing.rows[0]?.cnt ?? 0) > 0) return;

  // 1. Ticket A-001 (Dr. Ali, Stomatologiya) -> Paid & Completed
  const t1Res = await db.query<{ ticket_id: string }>(
    `SELECT * FROM public.create_queue_ticket(
      $1::uuid, 'Jasur Mirzayev'::text, '+998 90 215 44 11'::text,
      $2::uuid, $3::uuid, 'walk_in'::text, true,
      'Tish plombasi va tozalash'::text, NULL::uuid, $4::uuid, 0, NULL::text
    )`,
    [CLINIC_ID, DOC_ALI_ID, SRV_STOM_ID, ADMIN_USER_ID]
  );
  const t1Id = t1Res.rows[0].ticket_id;
  await db.query(
    `SELECT * FROM public.record_ticket_payment($1::uuid, 153000, 'card'::public.payment_method, $2::uuid, true, NULL::text, NULL::text)`,
    [t1Id, ADMIN_USER_ID]
  );
  await db.query(
    `SELECT * FROM public.transition_queue_status($1::uuid, 'chaqirildi'::public.queue_status, $2::uuid, NULL::text, NULL::text)`,
    [t1Id, DOC_ALI_USER_ID]
  );
  await db.query(
    `SELECT * FROM public.transition_queue_status($1::uuid, 'qabulda'::public.queue_status, $2::uuid, NULL::text, 'Dastlabki ko''rik'::text)`,
    [t1Id, DOC_ALI_USER_ID]
  );
  await db.query(
    `SELECT * FROM public.transition_queue_status($1::uuid, 'yakunlandi'::public.queue_status, $2::uuid, NULL::text, 'Karies tozalandi va yorug''lik plombasi qo''yildi.'::text)`,
    [t1Id, DOC_ALI_USER_ID]
  );

  // 2. Ticket A-002 (Dr. Ali, Stomatologiya) -> Paid & Currently In Consultation ('qabulda')
  const t2Res = await db.query<{ ticket_id: string }>(
    `SELECT * FROM public.create_queue_ticket(
      $1::uuid, 'Ali Valiyev'::text, '+998 93 540 12 89'::text,
      $2::uuid, $3::uuid, 'online'::text, true,
      'Old tish og''rig''i bo''yicha murojaat'::text, NULL::uuid, NULL::uuid, 0, NULL::text
    )`,
    [CLINIC_ID, DOC_ALI_ID, SRV_STOM_ID]
  );
  const t2Id = t2Res.rows[0].ticket_id;
  await db.query(
    `SELECT * FROM public.record_ticket_payment($1::uuid, 153000, 'cash'::public.payment_method, $2::uuid, true, NULL::text, NULL::text)`,
    [t2Id, ADMIN_USER_ID]
  );
  await db.query(
    `SELECT * FROM public.transition_queue_status($1::uuid, 'chaqirildi'::public.queue_status, $2::uuid, NULL::text, NULL::text)`,
    [t2Id, DOC_ALI_USER_ID]
  );
  await db.query(
    `SELECT * FROM public.transition_queue_status($1::uuid, 'qabulda'::public.queue_status, $2::uuid, NULL::text, 'Rentgen tekshiruvi va davolash davom etmoqda'::text)`,
    [t2Id, DOC_ALI_USER_ID]
  );

  // 3. Ticket A-003 (Dr. Ali, Stomatologiya) -> Waiting & Paid
  const t3Res = await db.query<{ ticket_id: string }>(
    `SELECT * FROM public.create_queue_ticket(
      $1::uuid, 'Madina Karimova'::text, '+998 91 330 77 66'::text,
      $2::uuid, $3::uuid, 'online'::text, true,
      'Profilaktik ko''rik'::text, NULL::uuid, NULL::uuid, 0, NULL::text
    )`,
    [CLINIC_ID, DOC_ALI_ID, SRV_STOM_ID]
  );
  const t3Id = t3Res.rows[0].ticket_id;
  await db.query(
    `SELECT * FROM public.record_ticket_payment($1::uuid, 153000, 'transfer'::public.payment_method, $2::uuid, true, NULL::text, NULL::text)`,
    [t3Id, ADMIN_USER_ID]
  );

  // 4. Ticket A-004 (Dr. Ali, Stomatologiya) -> Waiting & Unpaid
  await db.query(
    `SELECT * FROM public.create_queue_ticket(
      $1::uuid, 'Sardor Rasulov'::text, '+998 97 701 88 22'::text,
      $2::uuid, $3::uuid, 'walk_in'::text, true,
      'Plomba almashtirish'::text, NULL::uuid, $4::uuid, 0, NULL::text
    )`,
    [CLINIC_ID, DOC_ALI_ID, SRV_STOM_ID, ADMIN_USER_ID]
  );

  // 5. Ticket A-005 (Dr. Madina, Terapiya) -> Paid & Completed
  const t5Res = await db.query<{ ticket_id: string }>(
    `SELECT * FROM public.create_queue_ticket(
      $1::uuid, 'Dilshoda Ergasheva'::text, '+998 99 812 55 44'::text,
      $2::uuid, $3::uuid, 'online'::text, true,
      'Umumiy terapevtik ko''rik'::text, NULL::uuid, NULL::uuid, 0, NULL::text
    )`,
    [CLINIC_ID, DOC_MADINA_ID, SRV_TERAPIYA_ID]
  );
  const t5Id = t5Res.rows[0].ticket_id;
  await db.query(
    `SELECT * FROM public.record_ticket_payment($1::uuid, 120000, 'card'::public.payment_method, $2::uuid, true, NULL::text, NULL::text)`,
    [t5Id, ADMIN_USER_ID]
  );
  await db.query(
    `SELECT * FROM public.transition_queue_status($1::uuid, 'chaqirildi'::public.queue_status, $2::uuid, NULL::text, NULL::text)`,
    [t5Id, DOC_MADINA_USER_ID]
  );
  await db.query(
    `SELECT * FROM public.transition_queue_status($1::uuid, 'qabulda'::public.queue_status, $2::uuid, NULL::text, NULL::text)`,
    [t5Id, DOC_MADINA_USER_ID]
  );
  await db.query(
    `SELECT * FROM public.transition_queue_status($1::uuid, 'yakunlandi'::public.queue_status, $2::uuid, NULL::text, 'Qon bosimi me''yorda, vitamin terapiya buyurildi.'::text)`,
    [t5Id, DOC_MADINA_USER_ID]
  );

  // 6. Ticket L-001 (Dr. Madina, Laboratoriya) -> Waiting & Paid
  const t6Res = await db.query<{ ticket_id: string }>(
    `SELECT * FROM public.create_queue_ticket(
      $1::uuid, 'Otabek Xolmatov'::text, '+998 94 611 90 10'::text,
      $2::uuid, $3::uuid, 'walk_in'::text, true,
      'Umumiy qon tahlili'::text, NULL::uuid, $4::uuid, 0, NULL::text
    )`,
    [CLINIC_ID, DOC_MADINA_ID, SRV_LAB_ID, ADMIN_USER_ID]
  );
  await db.query(
    `SELECT * FROM public.record_ticket_payment($1::uuid, 95000, 'cash'::public.payment_method, $2::uuid, true, NULL::text, NULL::text)`,
    [t6Res.rows[0].ticket_id, ADMIN_USER_ID]
  );

  // 7. Ticket U-001 (Dr. Sardor, UZI diagnostika) -> Waiting & Partial Payment
  const t7Res = await db.query<{ ticket_id: string }>(
    `SELECT * FROM public.create_queue_ticket(
      $1::uuid, 'Nodira Saidova'::text, '+998 90 998 33 21'::text,
      $2::uuid, $3::uuid, 'walk_in'::text, true,
      'Qorin bo''shlig''i UZI tekshiruvi'::text, NULL::uuid, $4::uuid, 1, 'Homilador bemor'::text
    )`,
    [CLINIC_ID, DOC_SARDOR_ID, SRV_UZI_ID, ADMIN_USER_ID]
  );
  await db.query(
    `SELECT * FROM public.record_ticket_payment($1::uuid, 80000, 'cash'::public.payment_method, $2::uuid, true, NULL::text, 'Oldindan qisman to''lov'::text)`,
    [t7Res.rows[0].ticket_id, ADMIN_USER_ID]
  );

  // 8. Sample operational expense
  await db.query(
    `INSERT INTO public.expenses (clinic_id, category, title, amount, expense_date, description, responsible_user_id, created_by)
     VALUES ($1, 'medical_supplies', 'Stomatologik sarf materiallari', 85000, public.tashkent_today(), 'Steril qo''lqoplar va stomatologik sarf materiallari', $2, $2)`,
    [CLINIC_ID, SUPER_ADMIN_USER_ID]
  );
}

export async function getLocalPg(): Promise<PgExecutor> {
  if (!globalThis.__medclinicLocalPgPromise) {
    globalThis.__medclinicLocalPgPromise = initializeLocalPg().catch((err) => {
      globalThis.__medclinicLocalPgPromise = undefined;
      throw err;
    });
  }
  return globalThis.__medclinicLocalPgPromise;
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) {
      out[k] = DATE_ONLY_COLUMNS.has(k)
        ? v.toISOString().slice(0, 10)
        : v.toISOString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

function splitTopLevelSelect(selectStr: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of selectStr) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

interface ParsedRelationSpec {
  alias: string;
  targetTable: string;
  innerSelect: string;
}

function parseRelationToken(token: string): ParsedRelationSpec | null {
  const openIdx = token.indexOf("(");
  const closeIdx = token.lastIndexOf(")");
  if (openIdx === -1 || closeIdx === -1 || closeIdx < openIdx) return null;

  const head = token.slice(0, openIdx).trim();
  const innerSelect = token.slice(openIdx + 1, closeIdx).trim();

  // Format: [alias:]table[!fk]
  const bangIdx = head.indexOf("!");
  const headWithoutFk = bangIdx === -1 ? head : head.slice(0, bangIdx);
  const colonIdx = headWithoutFk.indexOf(":");

  if (colonIdx === -1) {
    return {
      alias: headWithoutFk.trim(),
      targetTable: headWithoutFk.trim(),
      innerSelect,
    };
  }

  return {
    alias: headWithoutFk.slice(0, colonIdx).trim(),
    targetTable: headWithoutFk.slice(colonIdx + 1).trim(),
    innerSelect,
  };
}

async function hydrateRelationsForRows(
  db: PgExecutor,
  sourceTable: string,
  rows: Record<string, unknown>[],
  selectStr: string
): Promise<Record<string, unknown>[]> {
  if (rows.length === 0) return rows;

  const tokens = splitTopLevelSelect(selectStr);
  const relationSpecs = tokens
    .map(parseRelationToken)
    .filter((r): r is ParsedRelationSpec => r !== null);

  if (relationSpecs.length === 0) return rows;

  const tableMap = TABLE_RELATIONS[sourceTable] || {};

  for (const spec of relationSpecs) {
    const rel =
      tableMap[spec.alias] ||
      Object.values(tableMap).find((r) => r.targetTable === spec.targetTable);

    if (!rel) continue;

    if (rel.type === "many-to-one") {
      const fkValues = Array.from(
        new Set(
          rows
            .map((r) => r[rel.localKey])
            .filter((v): v is string => typeof v === "string" && v.length > 0)
        )
      );

      if (fkValues.length === 0) {
        for (const r of rows) {
          r[spec.alias] = null;
        }
        continue;
      }

      const placeholders = fkValues.map((_, i) => `$${i + 1}`).join(", ");
      const targetRes = await db.query<Record<string, unknown>>(
        `SELECT * FROM public.${rel.targetTable} WHERE ${rel.foreignKey} IN (${placeholders})`,
        fkValues
      );

      let targetRows = targetRes.rows.map(normalizeRow);
      targetRows = await hydrateRelationsForRows(
        db,
        rel.targetTable,
        targetRows,
        spec.innerSelect
      );

      const byId = new Map<string, Record<string, unknown>>();
      for (const tr of targetRows) {
        byId.set(String(tr[rel.foreignKey]), tr);
      }

      for (const r of rows) {
        const keyVal = r[rel.localKey];
        r[spec.alias] = keyVal ? (byId.get(String(keyVal)) ?? null) : null;
      }
    } else {
      // one-to-many
      const parentIds = Array.from(
        new Set(
          rows
            .map((r) => r[rel.localKey])
            .filter((v): v is string => typeof v === "string" && v.length > 0)
        )
      );

      if (parentIds.length === 0) {
        for (const r of rows) {
          r[spec.alias] = [];
        }
        continue;
      }

      const placeholders = parentIds.map((_, i) => `$${i + 1}`).join(", ");
      const targetRes = await db.query<Record<string, unknown>>(
        `SELECT * FROM public.${rel.targetTable} WHERE ${rel.foreignKey} IN (${placeholders})`,
        parentIds
      );

      let targetRows = targetRes.rows.map(normalizeRow);
      targetRows = await hydrateRelationsForRows(
        db,
        rel.targetTable,
        targetRows,
        spec.innerSelect
      );

      const grouped = new Map<string, Record<string, unknown>[]>();
      for (const tr of targetRows) {
        const fk = String(tr[rel.foreignKey]);
        const list = grouped.get(fk) ?? [];
        list.push(tr);
        grouped.set(fk, list);
      }

      for (const r of rows) {
        const pid = String(r[rel.localKey]);
        r[spec.alias] = grouped.get(pid) ?? [];
      }
    }
  }

  return rows;
}

type FilterClause = (paramOffset: number) => { sql: string; values: unknown[] };

class LocalPgQueryBuilder implements PromiseLike<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  error: { message: string } | null;
  count: number | null;
}> {
  private table: string;
  private operation: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private selectStr = "*";
  private selectOpts: { count?: "exact"; head?: boolean } = {};
  private payload: Record<string, unknown> | Array<Record<string, unknown>> | null = null;
  private upsertConflictCol: string | null = null;
  private filters: FilterClause[] = [];
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private limitVal: number | null = null;
  private offsetVal: number | null = null;
  private singleMode: "none" | "single" | "maybeSingle" = "none";

  constructor(table: string) {
    this.table = table;
  }

  select(columns = "*", opts?: { count?: "exact"; head?: boolean }) {
    this.selectStr = columns;
    if (opts) this.selectOpts = opts;
    return this;
  }

  insert(values: Record<string, unknown> | Array<Record<string, unknown>>) {
    this.operation = "insert";
    this.payload = values;
    return this;
  }

  update(values: Record<string, unknown>) {
    this.operation = "update";
    this.payload = values;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  upsert(
    values: Record<string, unknown> | Array<Record<string, unknown>>,
    opts?: { onConflict?: string }
  ) {
    this.operation = "upsert";
    this.payload = values;
    this.upsertConflictCol = opts?.onConflict ?? null;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((idx) => ({
      sql: `${column} = $${idx}`,
      values: [value],
    }));
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push((idx) => ({
      sql: `${column} <> $${idx}`,
      values: [value],
    }));
    return this;
  }

  gt(column: string, value: unknown) {
    this.filters.push((idx) => ({
      sql: `${column} > $${idx}`,
      values: [value],
    }));
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push((idx) => ({
      sql: `${column} >= $${idx}`,
      values: [value],
    }));
    return this;
  }

  lt(column: string, value: unknown) {
    this.filters.push((idx) => ({
      sql: `${column} < $${idx}`,
      values: [value],
    }));
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push((idx) => ({
      sql: `${column} <= $${idx}`,
      values: [value],
    }));
    return this;
  }

  ilike(column: string, pattern: string) {
    this.filters.push((idx) => ({
      sql: `${column} ILIKE $${idx}`,
      values: [pattern],
    }));
    return this;
  }

  in(column: string, values: unknown[]) {
    if (values.length === 0) {
      this.filters.push(() => ({ sql: "1 = 0", values: [] }));
      return this;
    }
    this.filters.push((idx) => {
      const ph = values.map((_, i) => `$${idx + i}`).join(", ");
      return {
        sql: `${column} IN (${ph})`,
        values,
      };
    });
    return this;
  }

  is(column: string, value: null | boolean) {
    if (value === null) {
      this.filters.push(() => ({ sql: `${column} IS NULL`, values: [] }));
    } else {
      this.filters.push(() => ({
        sql: `${column} IS ${value ? "TRUE" : "FALSE"}`,
        values: [],
      }));
    }
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    if (operator === "is" && value === null) {
      this.filters.push(() => ({ sql: `${column} IS NOT NULL`, values: [] }));
    } else if (operator === "eq") {
      this.filters.push((idx) => ({
        sql: `${column} <> $${idx}`,
        values: [value],
      }));
    }
    return this;
  }

  or(expr: string) {
    const parts = expr.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return this;

    this.filters.push((startIdx) => {
      const subClauses: string[] = [];
      const subValues: unknown[] = [];
      let curIdx = startIdx;

      for (const part of parts) {
        if (part.endsWith(".is.null")) {
          const col = part.slice(0, -".is.null".length);
          subClauses.push(`${col} IS NULL`);
        } else if (part.includes(".ilike.")) {
          const [col, val] = part.split(".ilike.");
          subClauses.push(`${col} ILIKE $${curIdx++}`);
          subValues.push(val);
        } else if (part.includes(".eq.")) {
          const [col, val] = part.split(".eq.");
          subClauses.push(`${col} = $${curIdx++}`);
          subValues.push(val);
        }
      }

      if (subClauses.length === 0) {
        return { sql: "1 = 1", values: [] };
      }
      return {
        sql: `(${subClauses.join(" OR ")})`,
        values: subValues,
      };
    });
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.orders.push({
      column,
      ascending: opts?.ascending ?? true,
    });
    return this;
  }

  limit(n: number) {
    this.limitVal = n;
    return this;
  }

  range(from: number, to: number) {
    this.offsetVal = from;
    this.limitVal = Math.max(0, to - from + 1);
    return this;
  }

  single() {
    this.singleMode = "single";
    this.limitVal = 1;
    return this;
  }

  maybeSingle() {
    this.singleMode = "maybeSingle";
    this.limitVal = 1;
    return this;
  }

  private buildWhere(startParamIdx = 1): { whereSql: string; values: unknown[] } {
    if (this.filters.length === 0) {
      return { whereSql: "", values: [] };
    }
    const sqlParts: string[] = [];
    const allValues: unknown[] = [];
    let idx = startParamIdx;

    for (const f of this.filters) {
      const built = f(idx);
      sqlParts.push(built.sql);
      allValues.push(...built.values);
      idx += built.values.length;
    }

    return {
      whereSql: ` WHERE ${sqlParts.join(" AND ")}`,
      values: allValues,
    };
  }

  private serializeValue(col: string, val: unknown): unknown {
    if (val === undefined) return null;
    if (val !== null && JSON_COLUMNS.has(col) && typeof val === "object") {
      return JSON.stringify(val);
    }
    return val;
  }

  private async execute(): Promise<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any;
    error: { message: string } | null;
    count: number | null;
  }> {
    try {
      const db = await getLocalPg();

      if (this.operation === "select") {
        const { whereSql, values } = this.buildWhere(1);
        let count: number | null = null;

        if (this.selectOpts.count === "exact") {
          const countRes = await db.query<{ cnt: string }>(
            `SELECT count(*)::text AS cnt FROM public.${this.table}${whereSql}`,
            values
          );
          count = Number(countRes.rows[0]?.cnt ?? 0);
          if (this.selectOpts.head) {
            return { data: null, error: null, count };
          }
        }

        let orderSql = "";
        if (this.orders.length > 0) {
          orderSql =
            " ORDER BY " +
            this.orders
              .map((o) => `${o.column} ${o.ascending ? "ASC" : "DESC"}`)
              .join(", ");
        }

        let limitSql = "";
        if (this.limitVal !== null) {
          limitSql += ` LIMIT ${Number(this.limitVal)}`;
        }
        if (this.offsetVal !== null) {
          limitSql += ` OFFSET ${Number(this.offsetVal)}`;
        }

        const res = await db.query<Record<string, unknown>>(
          `SELECT * FROM public.${this.table}${whereSql}${orderSql}${limitSql}`,
          values
        );

        let rows = res.rows.map(normalizeRow);
        rows = await hydrateRelationsForRows(db, this.table, rows, this.selectStr);

        if (this.singleMode === "single") {
          if (rows.length === 0) {
            return {
              data: null,
              error: { message: "Ma'lumot topilmadi" },
              count,
            };
          }
          return { data: rows[0], error: null, count };
        }

        if (this.singleMode === "maybeSingle") {
          return { data: rows[0] ?? null, error: null, count };
        }

        return { data: rows, error: null, count };
      }

      if (this.operation === "insert" || this.operation === "upsert") {
        const items = Array.isArray(this.payload)
          ? this.payload
          : this.payload
            ? [this.payload]
            : [];

        if (items.length === 0) {
          return { data: [], error: null, count: 0 };
        }

        const cols = Object.keys(items[0]).filter((k) => items[0][k] !== undefined);
        const valueGroups: string[] = [];
        const params: unknown[] = [];
        let pIdx = 1;

        for (const item of items) {
          const groupPh: string[] = [];
          for (const col of cols) {
            groupPh.push(`$${pIdx++}`);
            params.push(this.serializeValue(col, item[col]));
          }
          valueGroups.push(`(${groupPh.join(", ")})`);
        }

        let conflictClause = "";
        if (this.operation === "upsert" && this.upsertConflictCol) {
          const updateCols = cols
            .filter((c) => !this.upsertConflictCol!.split(",").map((s) => s.trim()).includes(c))
            .map((c) => `${c} = EXCLUDED.${c}`);
          conflictClause =
            updateCols.length > 0
              ? ` ON CONFLICT (${this.upsertConflictCol}) DO UPDATE SET ${updateCols.join(", ")}`
              : ` ON CONFLICT (${this.upsertConflictCol}) DO NOTHING`;
        }

        const sql = `INSERT INTO public.${this.table} (${cols.join(", ")}) VALUES ${valueGroups.join(", ")}${conflictClause} RETURNING *`;
        const res = await db.query<Record<string, unknown>>(sql, params);
        let rows = res.rows.map(normalizeRow);
        rows = await hydrateRelationsForRows(db, this.table, rows, this.selectStr);

        if (this.singleMode === "single" || this.singleMode === "maybeSingle") {
          return { data: rows[0] ?? null, error: null, count: rows.length };
        }
        return { data: rows, error: null, count: rows.length };
      }

      if (this.operation === "update") {
        const item = (this.payload as Record<string, unknown>) || {};
        const cols = Object.keys(item).filter((k) => item[k] !== undefined);
        if (cols.length === 0) {
          return { data: null, error: null, count: 0 };
        }

        const setClauses: string[] = [];
        const params: unknown[] = [];
        let pIdx = 1;

        for (const col of cols) {
          setClauses.push(`${col} = $${pIdx++}`);
          params.push(this.serializeValue(col, item[col]));
        }

        const { whereSql, values: whereValues } = this.buildWhere(pIdx);
        params.push(...whereValues);

        const sql = `UPDATE public.${this.table} SET ${setClauses.join(", ")}${whereSql} RETURNING *`;
        const res = await db.query<Record<string, unknown>>(sql, params);
        let rows = res.rows.map(normalizeRow);
        rows = await hydrateRelationsForRows(db, this.table, rows, this.selectStr);

        if (this.singleMode === "single" || this.singleMode === "maybeSingle") {
          return { data: rows[0] ?? null, error: null, count: rows.length };
        }
        return { data: rows, error: null, count: rows.length };
      }

      if (this.operation === "delete") {
        const { whereSql, values } = this.buildWhere(1);
        const sql = `DELETE FROM public.${this.table}${whereSql} RETURNING *`;
        const res = await db.query<Record<string, unknown>>(sql, values);
        const rows = res.rows.map(normalizeRow);
        return { data: rows, error: null, count: rows.length };
      }

      return { data: null, error: null, count: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { data: null, error: { message }, count: null };
    }
  }

  then<TResult1 = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any;
    error: { message: string } | null;
    count: number | null;
  }, TResult2 = never>(
    onfulfilled?:
      | ((value: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: any;
          error: { message: string } | null;
          count: number | null;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

async function executeLocalRpc(
  fnName: string,
  args: Record<string, unknown> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ data: any; error: { message: string } | null }> {
  try {
    const db = await getLocalPg();

    if (fnName === "create_queue_ticket") {
      const res = await db.query<Record<string, unknown>>(
        `SELECT * FROM public.create_queue_ticket(
          $1::uuid, $2::text, $3::text, $4::uuid, $5::uuid,
          $6::text, $7::boolean, $8::text, $9::uuid, $10::uuid,
          $11::int, $12::text
        )`,
        [
          args.p_clinic_id,
          args.p_patient_full_name,
          args.p_patient_phone,
          args.p_doctor_id,
          args.p_service_id,
          args.p_source ?? "online",
          args.p_consent_given ?? true,
          args.p_notes ?? null,
          args.p_patient_id ?? null,
          args.p_created_by ?? null,
          args.p_priority_level ?? 0,
          args.p_priority_reason ?? null,
        ]
      );
      return { data: res.rows.map(normalizeRow), error: null };
    }

    if (fnName === "get_public_ticket_tracking") {
      const res = await db.query<Record<string, unknown>>(
        `SELECT * FROM public.get_public_ticket_tracking($1::uuid)`,
        [args.p_token]
      );
      return { data: res.rows.map(normalizeRow), error: null };
    }

    if (fnName === "transition_queue_status") {
      const res = await db.query<Record<string, unknown>>(
        `SELECT * FROM public.transition_queue_status(
          $1::uuid, $2::public.queue_status, $3::uuid, $4::text, $5::text
        )`,
        [
          args.p_ticket_id,
          args.p_new_status,
          args.p_actor_id ?? null,
          args.p_reason ?? null,
          args.p_visit_notes ?? null,
        ]
      );
      const row = res.rows[0] ? normalizeRow(res.rows[0]) : null;
      return { data: row, error: null };
    }

    if (fnName === "call_next_queue_ticket") {
      const res = await db.query<Record<string, unknown>>(
        `SELECT * FROM public.call_next_queue_ticket($1::uuid, $2::uuid)`,
        [args.p_doctor_id, args.p_actor_id ?? null]
      );
      const row = res.rows[0] ? normalizeRow(res.rows[0]) : null;
      return { data: row?.id ? row : null, error: null };
    }

    if (fnName === "record_ticket_payment") {
      const res = await db.query<Record<string, unknown>>(
        `SELECT * FROM public.record_ticket_payment(
          $1::uuid, $2::numeric, $3::public.payment_method, $4::uuid, $5::boolean, $6::text, $7::text
        )`,
        [
          args.p_ticket_id,
          args.p_amount,
          args.p_payment_method,
          args.p_actor_id ?? null,
          args.p_is_confirmed ?? true,
          args.p_override_reason ?? null,
          args.p_notes ?? null,
        ]
      );
      const row = res.rows[0] ? normalizeRow(res.rows[0]) : null;
      return { data: row, error: null };
    }

    if (fnName === "record_payment_refund") {
      const res = await db.query<Record<string, unknown>>(
        `SELECT * FROM public.record_payment_refund(
          $1::uuid, $2::numeric, $3::public.payment_method, $4::text, $5::uuid, $6::uuid
        )`,
        [
          args.p_payment_id,
          args.p_amount,
          args.p_refund_method,
          args.p_reason,
          args.p_authorized_by ?? null,
          args.p_created_by ?? null,
        ]
      );
      const row = res.rows[0] ? normalizeRow(res.rows[0]) : null;
      return { data: row, error: null };
    }

    if (fnName === "sync_ticket_payment_totals") {
      await db.query(`SELECT public.sync_ticket_payment_totals($1::uuid)`, [
        args.p_ticket_id,
      ]);
      return { data: null, error: null };
    }

    if (fnName === "sync_doctor_earning_for_ticket") {
      await db.query(
        `SELECT public.sync_doctor_earning_for_ticket($1::uuid, $2::uuid)`,
        [args.p_ticket_id, args.p_actor_id ?? null]
      );
      return { data: null, error: null };
    }

    if (fnName === "write_audit_log") {
      const res = await db.query<{ id: string }>(
        `SELECT public.write_audit_log(
          $1::uuid, $2::uuid, $3::text, $4::text, $5::uuid, $6::text, $7::jsonb, $8::jsonb, $9::text
        ) AS id`,
        [
          args.p_clinic_id,
          args.p_actor_user_id ?? null,
          args.p_action,
          args.p_entity_type,
          args.p_entity_id ?? null,
          args.p_summary,
          args.p_previous_values ? JSON.stringify(args.p_previous_values) : null,
          args.p_new_values ? JSON.stringify(args.p_new_values) : null,
          args.p_reason ?? null,
        ]
      );
      return { data: res.rows[0]?.id ?? null, error: null };
    }

    return {
      data: null,
      error: { message: `Noma'lum RPC funksiya: ${fnName}` },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: { message } };
  }
}

export function createLocalServiceRoleClient() {
  return {
    from(table: string) {
      return new LocalPgQueryBuilder(table);
    },
    rpc(fnName: string, args?: Record<string, unknown>) {
      return executeLocalRpc(fnName, args);
    },
    storage: {
      from(bucket: string) {
        return {
          async upload(filePath: string, buffer: Buffer) {
            try {
              const targetDir = path.join(
                process.cwd(),
                "public",
                "uploads",
                bucket,
                path.dirname(filePath)
              );
              fs.mkdirSync(targetDir, { recursive: true });
              const fullFile = path.join(
                process.cwd(),
                "public",
                "uploads",
                bucket,
                filePath
              );
              fs.writeFileSync(fullFile, buffer);
              return { data: { path: filePath }, error: null };
            } catch (err) {
              return {
                data: null,
                error: { message: err instanceof Error ? err.message : String(err) },
              };
            }
          },
          getPublicUrl(filePath: string) {
            return {
              data: {
                publicUrl: `/uploads/${bucket}/${filePath}`,
              },
            };
          },
        };
      },
    },
    auth: {
      admin: {
        async createUser(params: {
          email: string;
          password: string;
          email_confirm?: boolean;
          user_metadata?: Record<string, unknown>;
        }) {
          try {
            const db = await getLocalPg();
            const email = params.email.trim().toLowerCase();
            const existing = await db.query<{ id: string }>(
              `SELECT id FROM auth.users WHERE lower(email) = $1 LIMIT 1`,
              [email]
            );
            if (existing.rows.length > 0) {
              return {
                data: { user: null },
                error: { message: "Ushbu email bilan foydalanuvchi allaqachon mavjud." },
              };
            }
            const id = crypto.randomUUID();
            await db.query(
              `INSERT INTO auth.users (id, email, password_hash) VALUES ($1, $2, $3)`,
              [id, email, hashPassword(params.password)]
            );
            return {
              data: { user: { id, email } },
              error: null,
            };
          } catch (err) {
            return {
              data: { user: null },
              error: { message: err instanceof Error ? err.message : String(err) },
            };
          }
        },
        async updateUserById(
          userId: string,
          attrs: { password?: string; email?: string }
        ) {
          try {
            const db = await getLocalPg();
            if (attrs.password) {
              await db.query(
                `UPDATE auth.users SET password_hash = $1 WHERE id = $2`,
                [hashPassword(attrs.password), userId]
              );
            }
            if (attrs.email) {
              await db.query(
                `UPDATE auth.users SET email = $1 WHERE id = $2`,
                [attrs.email.trim().toLowerCase(), userId]
              );
            }
            return {
              data: { user: { id: userId } },
              error: null,
            };
          } catch (err) {
            return {
              data: { user: null },
              error: { message: err instanceof Error ? err.message : String(err) },
            };
          }
        },
        async deleteUser(userId: string) {
          try {
            const db = await getLocalPg();
            await db.query(`DELETE FROM auth.users WHERE id = $1`, [userId]);
            return { data: {}, error: null };
          } catch (err) {
            return {
              data: null,
              error: { message: err instanceof Error ? err.message : String(err) },
            };
          }
        },
      },
    },
  };
}

export async function createLocalServerSupabaseClient() {
  const cookieStore = await cookies();
  const baseClient = createLocalServiceRoleClient();

  return {
    ...baseClient,
    auth: {
      ...baseClient.auth,
      async signInWithPassword(credentials: { email: string; password: string }) {
        try {
          const db = await getLocalPg();
          const email = credentials.email.trim().toLowerCase();
          const res = await db.query<{
            id: string;
            email: string;
            password_hash: string;
          }>(
            `SELECT id, email, password_hash FROM auth.users WHERE lower(email) = $1 LIMIT 1`,
            [email]
          );

          const userRow = res.rows[0];
          if (!userRow || !verifyPassword(credentials.password, userRow.password_hash)) {
            return {
              data: { user: null, session: null },
              error: { message: "Login yoki parol noto'g'ri." },
            };
          }

          const token = createSignedSessionToken(userRow.id);
          try {
            cookieStore.set(LOCAL_SESSION_COOKIE, token, {
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
              path: "/",
              maxAge: 7 * 24 * 60 * 60,
            });
          } catch {
            // Read-only context ignore
          }

          return {
            data: {
              user: { id: userRow.id, email: userRow.email },
              session: { access_token: token },
            },
            error: null,
          };
        } catch (err) {
          return {
            data: { user: null, session: null },
            error: { message: err instanceof Error ? err.message : String(err) },
          };
        }
      },
      async getUser() {
        try {
          const token = cookieStore.get(LOCAL_SESSION_COOKIE)?.value;
          const userId = verifySignedSessionToken(token);
          if (!userId) {
            return { data: { user: null }, error: { message: "Not authenticated" } };
          }
          const db = await getLocalPg();
          const res = await db.query<{ id: string; email: string }>(
            `SELECT id, email FROM auth.users WHERE id = $1 LIMIT 1`,
            [userId]
          );
          const user = res.rows[0] ?? null;
          if (!user) {
            return { data: { user: null }, error: { message: "User not found" } };
          }
          return { data: { user }, error: null };
        } catch (err) {
          return {
            data: { user: null },
            error: { message: err instanceof Error ? err.message : String(err) },
          };
        }
      },
      async signOut() {
        try {
          cookieStore.delete(LOCAL_SESSION_COOKIE);
        } catch {
          // Ignore in read-only context
        }
        return { error: null };
      },
    },
  };
}
