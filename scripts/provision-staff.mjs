#!/usr/bin/env node
/**
 * Secure staff onboarding CLI for MedClinic / Xushvaqt Clinic Platform.
 * Zero hardcoded credentials: reads Supabase credentials from environment or .env.local
 * and accepts staff details via CLI flags or environment variables.
 *
 * Example:
 *   npm run staff:provision -- \
 *     --role super_admin \
 *     --email rahbar@klinika.uz \
 *     --username rahbar \
 *     --name "Dilshod Karimov" \
 *     --phone "+998901234567" \
 *     --password "StrongPassword123!"
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnv() {
  const candidates = [".env.local", ".env"];
  for (const file of candidates) {
    const full = path.resolve(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    const raw = fs.readFileSync(full, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
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
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const eqIdx = token.indexOf("=");
    if (eqIdx > -1) {
      const key = token.slice(2, eqIdx);
      args[key] = token.slice(eqIdx + 1);
    } else {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = "true";
      }
    }
  }
  return args;
}

function printUsage() {
  console.log(`
Foydalanish:
  npm run staff:provision -- --role <super_admin|admin|doctor> --email <email> --username <login> --name "<F.I.O.>" --password "<parol>" [--phone "+998..."] [--clinic-id <uuid>] [--doctor-id <uuid>]
`);
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));

  if (args.help === "true") {
    printUsage();
    process.exit(0);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "Xatolik: NEXT_PUBLIC_SUPABASE_URL va SUPABASE_SERVICE_ROLE_KEY muhit o'zgaruvchilari kerak."
    );
    process.exit(1);
  }

  const role = args.role || process.env.STAFF_ROLE;
  const email = (args.email || process.env.STAFF_EMAIL || "").trim().toLowerCase();
  const username = (args.username || process.env.STAFF_USERNAME || "").trim().toLowerCase();
  const fullName = (args.name || process.env.STAFF_NAME || "").trim();
  const password = args.password || process.env.STAFF_PASSWORD || "";
  const phone = (args.phone || process.env.STAFF_PHONE || "").trim() || null;
  const doctorId = (args["doctor-id"] || process.env.STAFF_DOCTOR_ID || "").trim() || null;

  if (!["super_admin", "admin", "doctor"].includes(role)) {
    console.error("Xatolik: --role faqat super_admin, admin yoki doctor bo'lishi mumkin.");
    printUsage();
    process.exit(1);
  }

  if (!email || !email.includes("@")) {
    console.error("Xatolik: To'g'ri --email kiriting.");
    process.exit(1);
  }

  if (!username || username.length < 3) {
    console.error("Xatolik: --username kamida 3 ta belgidan iborat bo'lishi kerak.");
    process.exit(1);
  }

  if (!fullName || fullName.length < 3) {
    console.error("Xatolik: --name kamida 3 ta belgidan iborat bo'lishi kerak.");
    process.exit(1);
  }

  if (!password || password.length < 8) {
    console.error("Xatolik: --password kamida 8 ta belgidan iborat bo'lishi kerak.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Resolve target clinic ID
  let clinicId = (args["clinic-id"] || process.env.DEFAULT_CLINIC_ID || "").trim();
  if (!clinicId) {
    const { data: clinic, error: clinicErr } = await supabase
      .from("clinics")
      .select("id, name")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (clinicErr || !clinic) {
      console.error(
        "Xatolik: Faol klinika topilmadi. Avval migratsiya va seed.sql ni ishga tushiring yoki --clinic-id bering."
      );
      process.exit(1);
    }
    clinicId = clinic.id;
  }

  // Create Auth user
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: {
      clinic_id: clinicId,
      role,
    },
  });

  if (authErr || !authData.user) {
    console.error("Supabase Auth foydalanuvchisini yaratishda xatolik:", authErr?.message);
    process.exit(1);
  }

  const userId = authData.user.id;

  const { error: profileErr } = await supabase.from("user_profiles").insert({
    id: userId,
    clinic_id: clinicId,
    role,
    full_name: fullName,
    username,
    email,
    phone,
    is_active: true,
  });

  if (profileErr) {
    await supabase.auth.admin.deleteUser(userId);
    console.error("user_profiles yozuvini yaratishda xatolik:", profileErr.message);
    process.exit(1);
  }

  if (role === "doctor") {
    if (doctorId) {
      const { error: docErr } = await supabase
        .from("doctors")
        .update({ user_id: userId })
        .eq("id", doctorId)
        .eq("clinic_id", clinicId);
      if (docErr) {
        console.warn("Ogohlantirish: Shifokor profiliga ulashda xatolik:", docErr.message);
      }
    } else {
      await supabase.from("doctors").insert({
        clinic_id: clinicId,
        user_id: userId,
        full_name: fullName,
        specialization: "Shifokor",
        experience_years: 1,
        consultation_price: 100000,
        availability_status: "available",
        is_active: true,
      });
    }
  }

  await supabase.from("audit_logs").insert({
    clinic_id: clinicId,
    actor_user_id: null,
    actor_name: "CLI Provisioner",
    actor_role: "system",
    action: "staff.provisioned",
    entity_type: "user_profile",
    entity_id: userId,
    summary: `Xodim hisobi yaratildi: ${fullName} (${role}, login: ${username})`,
  });

  console.log(`Muvaffaqiyatli yaratildi:
  Klinika ID: ${clinicId}
  Foydalanuvchi ID: ${userId}
  F.I.O.: ${fullName}
  Rol: ${role}
  Login (Username): ${username}
  Email: ${email}`);
}

main().catch((err) => {
  console.error("Kutilmagan xatolik:", err);
  process.exit(1);
});
