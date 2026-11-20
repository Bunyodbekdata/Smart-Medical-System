import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffSession } from "@/lib/auth/guards";
import { GET as adminPatientsGet } from "@/app/api/admin/patients/route";
import { GET as adminPaymentsGet } from "@/app/api/admin/payments/route";
import { GET as doctorEarningsGet } from "@/app/api/doctor/earnings/route";
import { POST as doctorQueuePost } from "@/app/api/doctor/queue/route";
import { POST as publicQueueRegisterPost } from "@/app/api/queue/register/route";
import { GET as superAdminAuditGet } from "@/app/api/super-admin/audit-logs/route";
import { GET as superAdminEmployeesGet } from "@/app/api/super-admin/employees/route";
import { GET as superAdminFinanceGet } from "@/app/api/super-admin/finance/route";
import { PATCH as superAdminSettingsPatch } from "@/app/api/super-admin/settings/route";

let mockRoleSession: StaffSession | null = null;

vi.mock("@/lib/auth/guards", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/guards")>("@/lib/auth/guards");
  return {
    ...actual,
    getCurrentStaffSession: async () => mockRoleSession,
    requireApiRole: async (allowedRoles: Array<"super_admin" | "admin" | "doctor">) => {
      if (!mockRoleSession) {
        return {
          ok: false as const,
          response: NextResponse.json({ error: "Autentifikatsiya talab qilinadi." }, { status: 401 }),
        };
      }
      if (!allowedRoles.includes(mockRoleSession.profile.role)) {
        return {
          ok: false as const,
          response: NextResponse.json({ error: "Ruxsat yo'q." }, { status: 403 }),
        };
      }
      return { ok: true as const, session: mockRoleSession };
    },
  };
});

function buildSession(role: "super_admin" | "admin" | "doctor"): StaffSession {
  return {
    userId: "90000000-0000-4000-8000-000000000099",
    profile: {
      id: "90000000-0000-4000-8000-000000000099",
      clinic_id: "11111111-1111-4111-8111-111111111111",
      role,
      full_name: `Test ${role}`,
      username: role,
      email: `${role}@medclinic.uz`,
      phone: null,
      avatar_url: null,
      is_active: true,
      last_login_at: null,
      created_at: "2026-11-13T00:00:00Z",
      updated_at: "2026-11-13T00:00:00Z",
    },
    doctor:
      role === "doctor"
        ? {
            id: "41111111-1111-4111-8111-111111111101",
            clinic_id: "11111111-1111-4111-8111-111111111111",
            user_id: "90000000-0000-4000-8000-000000000099",
            full_name: "Dr. Ali",
            specialization: "Stomatolog",
            experience_years: 8,
            biography: null,
            photo_url: null,
            room_id: null,
            consultation_price: 180000,
            queue_prefix: null,
            separate_queue: false,
            availability_status: "available",
            rating: 4.9,
            reviews_count: 100,
            is_active: true,
            created_at: "2026-11-13T00:00:00Z",
            updated_at: "2026-11-13T00:00:00Z",
          }
        : null,
  };
}

describe("Server API Route RBAC and input protection", () => {
  beforeEach(() => {
    mockRoleSession = null;
  });

  it("blocks unauthenticated requests with 401 across protected endpoints", async () => {
    const responses = await Promise.all([
      adminPatientsGet(new Request("http://localhost/api/admin/patients")),
      adminPaymentsGet(new Request("http://localhost/api/admin/payments")),
      doctorEarningsGet(),
      doctorQueuePost(new Request("http://localhost/api/doctor/queue", { method: "POST", body: "{}" })),
      superAdminFinanceGet(new Request("http://localhost/api/super-admin/finance")),
      superAdminSettingsPatch(new Request("http://localhost/api/super-admin/settings", { method: "PATCH", body: "{}" })),
      superAdminEmployeesGet(),
      superAdminAuditGet(new Request("http://localhost/api/super-admin/audit-logs")),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(401);
    }
  });

  it("prevents Admin from accessing Super Admin and Doctor routes (403)", async () => {
    mockRoleSession = buildSession("admin");

    const responses = await Promise.all([
      superAdminFinanceGet(new Request("http://localhost/api/super-admin/finance")),
      superAdminSettingsPatch(new Request("http://localhost/api/super-admin/settings", { method: "PATCH", body: "{}" })),
      superAdminEmployeesGet(),
      superAdminAuditGet(new Request("http://localhost/api/super-admin/audit-logs")),
      doctorEarningsGet(),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(403);
    }
  });

  it("prevents Doctor from accessing Admin payments, Patients list, or Super Admin routes (403)", async () => {
    mockRoleSession = buildSession("doctor");

    const responses = await Promise.all([
      adminPatientsGet(new Request("http://localhost/api/admin/patients")),
      adminPaymentsGet(new Request("http://localhost/api/admin/payments")),
      superAdminFinanceGet(new Request("http://localhost/api/super-admin/finance")),
      superAdminEmployeesGet(),
      superAdminSettingsPatch(new Request("http://localhost/api/super-admin/settings", { method: "PATCH", body: "{}" })),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(403);
    }
  });

  it("rejects online queue registration when personal data consent is false", async () => {
    const req = new Request("http://localhost/api/queue/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "10.10.0.1" },
      body: JSON.stringify({
        serviceId: "31111111-1111-4111-8111-111111111101",
        doctorId: "41111111-1111-4111-8111-111111111101",
        fullName: "Ali Valiyev",
        phone: "+998901234567",
        consentGiven: false,
      }),
    });

    const res = await publicQueueRegisterPost(req);
    expect([400, 503]).toContain(res.status);
  });
});
