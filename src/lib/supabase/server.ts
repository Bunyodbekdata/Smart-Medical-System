import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import {
  getPublicSupabaseEnv,
  getServiceSupabaseEnv,
  isCloudSupabaseConfigured,
  isLocalPgEnabled,
} from "./env";
import {
  createLocalServerSupabaseClient,
  createLocalServiceRoleClient,
} from "./local-pg-adapter";

export async function createServerSupabaseClient(): Promise<SupabaseClient> {
  if (!isCloudSupabaseConfigured() && isLocalPgEnabled()) {
    return (await createLocalServerSupabaseClient()) as unknown as SupabaseClient;
  }

  const cookieStore = await cookies();
  const { url, anonKey } = getPublicSupabaseEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Component read-only context: cookie writes happen in route handlers/proxy
        }
      },
    },
  });
}

export function createServiceRoleClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("createServiceRoleClient faqat server tomonida ishlatilishi mumkin");
  }
  if (!isCloudSupabaseConfigured() && isLocalPgEnabled()) {
    return createLocalServiceRoleClient() as unknown as SupabaseClient;
  }
  const { url, serviceKey } = getServiceSupabaseEnv();
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
