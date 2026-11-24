# MedClinic — Klinika Boshqaruvi va Elektron Navbat Platformasi

O'zbekistondagi xususiy klinikalar va tibbiyot markazlari uchun mo'ljallangan, to'liq funksional, real vaqt rejimida ishlovchi klinika boshqaruvi va jonli elektron navbat platformasi.

- **Asosiy til**: O'zbek (Lotin)
- **Valyuta**: UZS (`so'm`)
- **Vaqt mintaqasi**: `Asia/Tashkent`
- **Sana formati**: `DD.MM.YYYY`
- **Arxitektura**: Multi-clinic tayyor (`clinic_id` barcha klinika jadvallari va RLS siyosatlarida ajratilgan)

---

## 1. Asosiy interfeyslar

| Interfeys | Marshrut | Rollar | Vazifasi |
|---|---|---|---|
| **Bemorlar sayti** | `/` | Ommaviy | Klinika haqida, xizmatlar, shifokorlar, aksiyalar, onlayn navbat olish |
| **Jonli talon kuzatuvi** | `/queue/[token]` | Maxfiy token | Bemorning navbat raqami, oldindagi bemorlar soni, joriy holat (boshqa bemorlar shaxsiy ma'lumotlarisiz) |
| **Xodimlar portali** | `/staff/login` | Barcha xodimlar | Username (login) yoki Email + parol orqali kirish va rolga ko'ra yo'naltirish |
| **Admin panel** | `/admin/*` | `admin`, `super_admin` | Bemorlarni ro'yxatga olish (walk-in), navbatni boshqarish, kelganini tasdiqlash, kassa va chek chop etish, qaytarishlar |
| **Shifokor paneli** | `/doctor/*` | `doctor` | Hozirgi bemorni boshqarish, keyingi bemorni chaqirish, qabulni boshlash/yakunlash, qaydlar, kunlik/haftalik/oylik daromad |
| **Super Admin panel** | `/super-admin/*` | `super_admin` | Kengaytirilgan analitika, shifokorlar va xodimlar, xizmatlar, xonalar, aksiyalar, moliya va komissiyalar, audit jurnali, sozlamalar |

> **Eslatma**: Telegram Bot va Jonli Navbat Monitori ushbu bosqichga kiritilmagan. Arxitektura esa 2-bosqichda ularni osongina ulash uchun tayyor qilingan (pastga qarang).

---

## 2. Texnologik stek

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Recharts
- **Backend va Ma'lumotlar bazasi**: Next.js Route Handlers + 3 xil ulanish rejimi:
  1. **Neon / PostgreSQL (`DATABASE_URL`)** — bepul va serverless production muhiti uchun tavsiya etiladi
  2. **Cloud Supabase (`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`)** — Supabase Auth, Realtime va Storage bilan
  3. **Ichki Local PostgreSQL 16 (`MEDCLINIC_LOCAL_PG=true`)** — lokal dasturlash va tezkor demo uchun (`@electric-sql/pglite`)
- **Validatsiya**: Zod v4
- **Testlash**: Vitest + `@electric-sql/pglite` (haqiqiy PostgreSQL migratsiyalari, atomar RPC funksiyalari va triggerlar ustida integratsion testlar)

---

## 3. Ishga tushirish va sozlash

### 3.1. Muhit o'zgaruvchilari (`.env.local`)

`.env.example` faylidan nusxa oling va o'zingizga qulay ma'lumotlar bazasi rejimini tanlang:

```bash
cp .env.example .env.local
```

1. **Variant A — Neon PostgreSQL (Production / Vercel uchun tavsiya etiladi)**:
   - `DATABASE_URL` — Neon ulanish satri
   - `AUTH_SECRET` — sessiya cookie'larini imzolash uchun kamida 32 belgili kalit
   - `SUPER_ADMIN_*`, `ADMIN_*`, `DOCTOR_*` — birinchi ishga tushganda yaratiladigan xodim login/parollari
   - Sxema va boshlang'ich ma'lumotlarni bir buyruqda yuklash: `npm run db:init`
2. **Variant B — Cloud Supabase**:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
3. **Variant C — Lokal PGlite (tashqi bazasiz tezkor ishga tushirish)**:
   - `MEDCLINIC_LOCAL_PG=true` hamda `LOCAL_SUPER_ADMIN_*`, `LOCAL_ADMIN_*`, `LOCAL_DOCTOR_*`
4. **Umumiy sozlamalar**:
   - `NEXT_PUBLIC_DEFAULT_CLINIC_SLUG` (standart: `xushvaqt-medclinic`)
   - `NEXT_PUBLIC_APP_URL`

### 3.2. Kutubxonalarni o'rnatish

```bash
npm install
```

### 3.3. PostgreSQL migratsiyalari va boshlang'ich katalog

Supabase SQL Editor yoki Supabase CLI orqali migratsiyalarni ketma-ket bajaring:

1. `supabase/migrations/0001_initial_schema.sql` — jadvallar, enumlar, indekslar va immutable `audit_logs` triggeri
2. `supabase/migrations/0002_rpc_and_triggers.sql` — atomar `create_queue_ticket`, `transition_queue_status`, `call_next_queue_ticket`, `record_ticket_payment`, `record_payment_refund`, `get_public_ticket_tracking` funksiyalari
3. `supabase/migrations/0003_rls_policies.sql` — barcha 21 jadval uchun Row Level Security (RLS) va qat'iy RPC ruxsatlari
4. `supabase/migrations/0004_realtime.sql` — Supabase Realtime nashri
5. `supabase/migrations/0005_storage.sql` — `clinic-media` Storage bucket va siyosatlar
6. `supabase/seed.sql` — namuna klinika, xonalar, xizmatlar, shifokorlar va aksiya katalogi (hech qanday xodim paroli saqlanmaydi)

### 3.4. Xavfsiz xodim hisoblarini yaratish (Provisioning)

Manba kodida standart admin parollari mavjud emas. Dastlabki Super Admin, Admin va Shifokor hisoblarini CLI skript orqali yarating:

```bash
npm run staff:provision -- \
  --role super_admin \
  --email rahbar@klinika.uz \
  --username rahbar \
  --name "Dilshod Karimov" \
  --phone "+998901234567" \
  --password "Kamida8BelgiKuchliParol!"
```

Seed qilingan shifokorni hisobga ulash uchun `--doctor-id` bering (masalan `41111111-1111-4111-8111-111111111101`):

```bash
npm run staff:provision -- \
  --role doctor \
  --email ali.valiyev@klinika.uz \
  --username dr_ali \
  --name "Dr. Ali Valiyev" \
  --doctor-id "41111111-1111-4111-8111-111111111101" \
  --password "Kamida8BelgiKuchliParol!"
```

### 3.5. Dasturni ishga tushirish

```bash
npm run dev
```

---

## 4. Xavfsizlik va yaxlitlik arxitekturasi

1. **Konkurent navbat raqami generatsiyasi**: `create_queue_ticket` RPC funksiyasi `queue_counters` jadvali ustida atomar `INSERT ... ON CONFLICT DO UPDATE` bajaradi. Bir vaqtning o'zida yuzlab so'rov kelganda ham takroriy navbat raqami (masalan ikkita `A-005`) yaratilmaydi.
2. **Shaxsiy ma'lumotlar maxfiyligi (`/queue/[token]`)**: Bemor kuzatuv sahifasi faqat kriptografik tasodifiy `tracking_token` orqali `get_public_ticket_tracking` RPC'ga murojaat qiladi va boshqa bemorlarning ismi, telefoni yoki tashxislari haqida ma'lumot bermaydi. Jonli yangilanishlar PII bo'lmagan Supabase Broadcast kanali orqali yuboriladi.
3. **Rolga asoslangan kirish nazorati (RBAC + RLS)**:
   - Har bir API marshruti server tomonda `requireApiRole(...)` bilan tekshiriladi.
   - Har bir klinika ma'lumoti `clinic_id` bilan ajratilgan.
   - `admin` foydalanuvchilar Super Admin marshrutlariga (`403`) yoki komissiya/moliya sozlamalariga kira olmaydi.
   - `doctor` foydalanuvchilar faqat o'z navbatlari, o'z bemorlari va o'z daromadlarini ko'ra oladi.
4. **Shifokor qabuli va navbat yaxlitligi**: Bir shifokorda bir vaqtning o'zida faqat bitta faol qabul (`qabulda`) bo'lishini ma'lumotlar bazasi partial unique index (`uq_one_active_consultation_per_doctor`) kafolatlaydi. Bemor qabulini yakunlash (`yakunlandi`) va keyingi bemorni chaqirish (`call_next`) alohida amallar hisoblanadi.
5. **Moliya va komissiya hisoboti**: Qabul yakunlanib to'lov qilinganda shifokor ulushi avtomatik `doctor_earnings` jurnaliga (`accrual`) yoziladi. Qaytarish (`refund`) bajarilganda tizim avtomatik tuzatish (`refund_adjustment`) yaratadi va audit jurnaliga sabab bilan yozadi.
6. **O'zgarmas Audit Jurnali**: `audit_logs` jadvaliga `UPDATE` va `DELETE` operatsiyalari PostgreSQL triggeri (`trg_audit_logs_immutable`) darajasida bloklangan.

---

## 5. Kelajakdagi modullar uchun tayyor integratsiya nuqtalari (2-bosqich)

### Telegram Bot integratsiyasi
- `patients.normalized_phone` va `queue_tickets.tracking_token` maydonlari orqali bot bemorni aniqlab jonli navbat xabarnomalarini yuborishi mumkin.
- Navbat holati o'zgarganda (`transition_queue_status`, `call_next_queue_ticket`) `queue_history` va Supabase Realtime webhooklari Telegram bildirishnomalari uchun tayyor nuqta beradi.

### Jonli Navbat Monitori (TV Display)
- `/api/queue/register` va barcha navbat o'zgarishlari Supabase Broadcast (`queue-public:{clinicId}:{doctorId}:{queueDate}`) orqali signal beradi.
- Kelajakda `/monitor` ekrani faqat navbat raqami (`A-025`) va xona raqamini (`204-xona`) PII siz olishi uchun alohida read-only view/RPC qo'shish kifoya.

---

## 6. Tekshiruv va testlar

```bash
# TypeScript tekshiruvi
npm run typecheck

# ESLint tekshiruvi
npm run lint

# Avtomatlashtirilgan testlar (Domen qoidalari + PGlite real Postgres workflow + RBAC)
npm run test

# Production build
npm run build
```

---

## 7. Production Deployment va Zaxira nusxa (Backup)

1. **Vercel + Supabase**:
   - Vercel loyihasiga `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL` environment variable'larini kiriting.
   - Supabase Authentication URL konfiguratsiyasida Vercel domeningizni qo'shing.
2. **Zaxira nusxa va tiklash**:
   - Supabase Pro rejasida kunlik avtomatik zaxira nusxalar (PITR — Point-in-Time Recovery) yoqilishi shart.
   - Har hafta `pg_dump` orqali `public` sxemasining shifrlangan zaxira nusxasini alohida saqlash tavsiya etiladi.
3. **Production ishga tushirish tekshiruv ro'yxati**:
   - [ ] `0001..0005` migratsiyalari bajarildi
   - [ ] `clinic_settings` ma'lumotlari Super Admin panelidan yangilandi
   - [ ] `scripts/provision-staff.mjs` orqali Super Admin, Admin va Shifokor hisoblari yaratildi
   - [ ] `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` muvaffaqiyatli o'tdi
