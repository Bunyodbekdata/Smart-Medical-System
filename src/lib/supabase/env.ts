export function isCloudSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function getPostgresUrl(): string | null {
  const url = (process.env.DATABASE_URL || process.env.POSTGRES_URL || "").trim();
  return url || null;
}

export function isDirectPgConfigured(): boolean {
  return !isCloudSupabaseConfigured() && Boolean(getPostgresUrl());
}

export function isLocalPgEnabled(): boolean {
  return (
    !isCloudSupabaseConfigured() &&
    !isDirectPgConfigured() &&
    process.env.MEDCLINIC_LOCAL_PG === "true"
  );
}

export function isPgAdapterMode(): boolean {
  return isDirectPgConfigured() || isLocalPgEnabled();
}

export function isSupabaseConfigured(): boolean {
  return isCloudSupabaseConfigured() || isPgAdapterMode();
}

export function isSupabaseServiceConfigured(): boolean {
  if (isPgAdapterMode()) {
    return true;
  }
  return Boolean(
    isCloudSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function getDatabaseMode(): "supabase" | "neon_pg" | "local_pglite" | "unconfigured" {
  if (isCloudSupabaseConfigured()) return "supabase";
  if (isDirectPgConfigured()) return "neon_pg";
  if (isLocalPgEnabled()) return "local_pglite";
  return "unconfigured";
}

export function getPublicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase muhit o'zgaruvchilari sozlanmagan (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)"
    );
  }
  return { url, anonKey };
}

export function getServiceSupabaseEnv() {
  const { url } = getPublicSupabaseEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "Supabase server kaliti sozlanmagan (SUPABASE_SERVICE_ROLE_KEY)"
    );
  }
  return { url, serviceKey };
}

export function getDefaultClinicSlug(): string {
  return process.env.NEXT_PUBLIC_DEFAULT_CLINIC_SLUG || "xushvaqt-medclinic";
}
