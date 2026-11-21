#!/usr/bin/env node
/**
 * Initializes a Neon (or standard PostgreSQL 16) database for MedClinic:
 * 1. Creates pgcrypto extension and auth schema/users table
 * 2. Runs 0001_initial_schema.sql, 0002_rpc_and_triggers.sql, and seed.sql
 * 3. Provisions initial staff accounts if SUPER_ADMIN_PASSWORD / ADMIN_PASSWORD / DOCTOR_PASSWORD are set
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." SUPER_ADMIN_PASSWORD="..." npm run db:init
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;

// Load .env.local if present and DATABASE_URL is not already in process.env
function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

const CLINIC_ID = "11111111-1111-4111-8111-111111111111";
const DOC_ALI_ID = "41111111-1111-4111-8111-111111111101";
const DOC_MADINA_ID = "41111111-1111-4111-8111-111111111102";

const SUPER_ADMIN_USER_ID = "90000000-0000-4000-8000-000000000001";
const ADMIN_USER_ID = "90000000-0000-4000-8000-000000000002";
const DOC_ALI_USER_ID = "90000000-0000-4000-8000-000000000003";
const DOC_MADINA_USER_ID = "90000000-0000-4000-8000-000000000004";

async function main() {
  loadEnvLocal();

  const connectionString = (process.env.DATABASE_URL || process.env.POSTGRES_URL || "").trim();
  if (!connectionString) {
    console.error("Xatolik: DATABASE_URL (yoki POSTGRES_URL) muhit o'zgaruvchisi topilmadi.");
    console.error('Namuna: DATABASE_URL="postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require" npm run db:init');
    process.exit(1);
  }

  const isLocalHost =
    connectionString.includes("localhost") || connectionString.includes("127.0.0.1");

  const pool = new Pool({
    connectionString,
    ssl: isLocalHost ? false : { rejectUnauthorized: false },
  });

  try {
    console.log("1/4. Neon PostgreSQL bazasiga ulanilmoqda...");
    await pool.query("SELECT 1");

    const check = await pool.query(`SELECT to_regclass('public.clinics') AS tbl`);
    if (!check.rows[0]?.tbl) {
      console.log("2/4. Auth sxemasi va pgcrypto yaratilmoqda...");
      await pool.query(`
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

      console.log("3/4. Jadvallar, RPC funksiyalar va boshlang'ich katalog yuklanmoqda...");
      for (const rel of [
        "migrations/0001_initial_schema.sql",
        "migrations/0002_rpc_and_triggers.sql",
        "seed.sql",
      ]) {
        const fullPath = path.join(process.cwd(), "supabase", rel);
        const sql = fs.readFileSync(fullPath, "utf8");
        await pool.query(sql);
        console.log(`   ✓ ${rel}`);
      }
    } else {
      console.log("2-3/4. Jadvallar allaqachon mavjud (migratsiyalar o'tkazib yuborildi).");
    }

    console.log("4/4. Xodim hisoblarini tekshirish...");
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
      await pool.query(
        `INSERT INTO auth.users (id, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
        [SUPER_ADMIN_USER_ID, saEmail, hashPassword(superAdminPass)]
      );
      await pool.query(
        `INSERT INTO public.user_profiles (id, clinic_id, role, full_name, username, email, phone, is_active)
         VALUES ($1, $2, 'super_admin', 'Dilshod Karimov', $3, $4, '+998 90 100 00 01', true)
         ON CONFLICT (id) DO NOTHING`,
        [SUPER_ADMIN_USER_ID, CLINIC_ID, saUsername, saEmail]
      );
      console.log(`   ✓ Super Admin tayyor: ${saUsername} (${saEmail})`);
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
      await pool.query(
        `INSERT INTO auth.users (id, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
        [ADMIN_USER_ID, admEmail, hashPassword(adminPass)]
      );
      await pool.query(
        `INSERT INTO public.user_profiles (id, clinic_id, role, full_name, username, email, phone, is_active)
         VALUES ($1, $2, 'admin', 'Aziza Rustamova', $3, $4, '+998 90 100 00 02', true)
         ON CONFLICT (id) DO NOTHING`,
        [ADMIN_USER_ID, CLINIC_ID, admUsername, admEmail]
      );
      console.log(`   ✓ Admin tayyor: ${admUsername} (${admEmail})`);
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
      await pool.query(
        `INSERT INTO auth.users (id, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
        [DOC_ALI_USER_ID, docEmail, hashPassword(docPass)]
      );
      await pool.query(
        `INSERT INTO public.user_profiles (id, clinic_id, role, full_name, username, email, phone, is_active)
         VALUES ($1, $2, 'doctor', 'Dr. Ali Valiyev', $3, $4, '+998 90 100 00 03', true)
         ON CONFLICT (id) DO NOTHING`,
        [DOC_ALI_USER_ID, CLINIC_ID, docUsername, docEmail]
      );
      await pool.query(
        `UPDATE public.doctors SET user_id = $1 WHERE id = $2 AND user_id IS NULL`,
        [DOC_ALI_USER_ID, DOC_ALI_ID]
      );

      await pool.query(
        `INSERT INTO auth.users (id, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
        [DOC_MADINA_USER_ID, "madina@medclinic.uz", hashPassword(docPass)]
      );
      await pool.query(
        `INSERT INTO public.user_profiles (id, clinic_id, role, full_name, username, email, phone, is_active)
         VALUES ($1, $2, 'doctor', 'Dr. Madina Karimova', 'dr_madina', 'madina@medclinic.uz', '+998 90 100 00 04', true)
         ON CONFLICT (id) DO NOTHING`,
        [DOC_MADINA_USER_ID, CLINIC_ID]
      );
      await pool.query(
        `UPDATE public.doctors SET user_id = $1 WHERE id = $2 AND user_id IS NULL`,
        [DOC_MADINA_USER_ID, DOC_MADINA_ID]
      );
      console.log(`   ✓ Shifokorlar tayyor: ${docUsername}, dr_madina`);
    }

    console.log("\n✅ Neon PostgreSQL bazasi muvaffaqiyatli tayyorlandi!");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Baza sozlashda xatolik:", err);
  process.exit(1);
});
