import { getTashkentDateString } from "@/lib/formatters";
import { getDefaultClinicSlug, isSupabaseConfigured, isSupabaseServiceConfigured } from "@/lib/supabase/env";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import type {
  ClinicSettings,
  Doctor,
  Promotion,
  Service,
} from "@/types/database";

export interface ClinicBranding {
  clinicName: string;
  logoUrl: string | null;
}

/**
 * Lightweight branding query for portal layouts and login screen.
 * Respects multi-clinic tenant isolation when clinicId is supplied.
 */
export async function getClinicBranding(clinicId?: string | null): Promise<ClinicBranding> {
  if (!isSupabaseConfigured()) {
    return { clinicName: "MedClinic", logoUrl: null };
  }

  try {
    const supabase = isSupabaseServiceConfigured()
      ? createServiceRoleClient()
      : await createServerSupabaseClient();

    let targetClinicId = clinicId ?? null;

    if (!targetClinicId) {
      const slug = getDefaultClinicSlug();
      const { data: clinic } = await supabase
        .from("clinics")
        .select("id")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();

      if (clinic?.id) {
        targetClinicId = clinic.id;
      } else {
        const { data: fallback } = await supabase
          .from("clinics")
          .select("id")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        targetClinicId = fallback?.id ?? null;
      }
    }

    if (!targetClinicId) {
      return { clinicName: "MedClinic", logoUrl: null };
    }

    const { data: settings } = await supabase
      .from("clinic_settings")
      .select("clinic_name, logo_url")
      .eq("clinic_id", targetClinicId)
      .maybeSingle<{ clinic_name: string; logo_url: string | null }>();

    return {
      clinicName: settings?.clinic_name || "MedClinic",
      logoUrl: settings?.logo_url ?? null,
    };
  } catch {
    return { clinicName: "MedClinic", logoUrl: null };
  }
}

export interface PublicClinicBundle {
  configured: boolean;
  clinicId: string | null;
  settings: ClinicSettings | null;
  services: Service[];
  doctors: Doctor[];
  promotions: Promotion[];
  stats: {
    doctorsCount: number;
    servicesCount: number;
    patientsCount: number;
    experienceYears: number;
    positiveRate: number;
  };
}

export async function getPublicClinicBundle(): Promise<PublicClinicBundle> {
  if (!isSupabaseConfigured()) {
    return {
      configured: false,
      clinicId: null,
      settings: null,
      services: [],
      doctors: [],
      promotions: [],
      stats: {
        doctorsCount: 0,
        servicesCount: 0,
        patientsCount: 0,
        experienceYears: 0,
        positiveRate: 0,
      },
    };
  }

  try {
    const supabase = isSupabaseServiceConfigured()
      ? createServiceRoleClient()
      : await createServerSupabaseClient();

    const slug = getDefaultClinicSlug();
    const { data: clinic } = await supabase
      .from("clinics")
      .select("id, name, slug")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    const targetClinic =
      clinic ??
      (
        await supabase
          .from("clinics")
          .select("id, name, slug")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle()
      ).data;

    if (!targetClinic) {
      return {
        configured: true,
        clinicId: null,
        settings: null,
        services: [],
        doctors: [],
        promotions: [],
        stats: {
          doctorsCount: 0,
          servicesCount: 0,
          patientsCount: 0,
          experienceYears: 0,
          positiveRate: 0,
        },
      };
    }

    const today = getTashkentDateString();

    const [settingsRes, servicesRes, doctorsRes, promosRes, patientsCountRes] =
      await Promise.all([
        supabase
          .from("clinic_settings")
          .select("*")
          .eq("clinic_id", targetClinic.id)
          .maybeSingle<ClinicSettings>(),
        supabase
          .from("services")
          .select("*")
          .eq("clinic_id", targetClinic.id)
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("doctors")
          .select(
            "*, room:rooms(*), doctor_services(*, service:services(*)), doctor_schedules(*)"
          )
          .eq("clinic_id", targetClinic.id)
          .eq("is_active", true)
          .order("full_name", { ascending: true }),
        supabase
          .from("promotions")
          .select("*, service:services(id, name, price)")
          .eq("clinic_id", targetClinic.id)
          .eq("is_active", true)
          .lte("starts_at", today)
          .gte("ends_at", today)
          .order("ends_at", { ascending: true }),
        isSupabaseServiceConfigured()
          ? supabase
              .from("patients")
              .select("id", { count: "exact", head: true })
              .eq("clinic_id", targetClinic.id)
          : Promise.resolve({ count: null }),
      ]);

    const settings = settingsRes.data ?? null;
    const services = (servicesRes.data ?? []) as Service[];
    const doctors = (doctorsRes.data ?? []) as Doctor[];
    const promotions = (promosRes.data ?? []) as Promotion[];

    const liveDoctorsCount = doctors.length;
    const liveServicesCount = services.length;
    const livePatientsCount = patientsCountRes.count ?? 0;

    return {
      configured: true,
      clinicId: targetClinic.id,
      settings,
      services,
      doctors,
      promotions,
      stats: {
        doctorsCount:
          settings?.stats_doctors_override ?? liveDoctorsCount,
        servicesCount:
          settings?.stats_services_override ?? liveServicesCount,
        patientsCount:
          settings?.stats_patients_override ?? livePatientsCount,
        experienceYears: settings?.stats_experience_years ?? 1,
        positiveRate: Number(settings?.stats_positive_rate ?? 98),
      },
    };
  } catch (err) {
    console.error("[public-clinic] Failed to load public clinic bundle:", err);
    return {
      configured: true,
      clinicId: null,
      settings: null,
      services: [],
      doctors: [],
      promotions: [],
      stats: {
        doctorsCount: 0,
        servicesCount: 0,
        patientsCount: 0,
        experienceYears: 0,
        positiveRate: 0,
      },
    };
  }
}
