export function isCloudSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function isLocalPgEnabled(): boolean {
  return (
    !isCloudSupabaseConfigured() &&
    process.env.MEDCLINIC_LOCAL_PG === "true"
  );
}

export function isSupabaseConfigured(): boolean {
  return isCloudSupabaseConfigured() || isLocalPgEnabled();
}

export function isSupabaseServiceConfigured(): boolean {
  if (isLocalPgEnabled()) {
    return true;
  }
  return Boolean(
    isCloudSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
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
