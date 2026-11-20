"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseEnv, isCloudSupabaseConfigured } from "./env";

export function createBrowserSupabaseClient() {
  if (!isCloudSupabaseConfigured()) {
    return null;
  }
  const { url, anonKey } = getPublicSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
