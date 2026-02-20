import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env";

export function createServerSupabase(): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
