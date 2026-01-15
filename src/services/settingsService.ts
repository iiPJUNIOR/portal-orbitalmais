import { supabase } from "@/integrations/supabase/client";

export type UserSettings = {
  id?: string;
  spreadsheet_link?: string | null;
  google_client_id_override?: string | null;
  complement_range?: string | null;
  complement_sheet?: string | null;
  complement_key_column?: string | null;
  complement_com_ids_column?: string | null;
  complement_sem_ids_column?: string | null;
  seller_name?: string | null;
  seller_role?: string | null;
  seller_email?: string | null;
  seller_phone?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

/**
 * Get current authenticated user's id (returns undefined if no user)
 */
async function getCurrentUserId(): Promise<string | undefined> {
  try {
    // supabase.auth.getUser may or may not exist depending on client version
    // @ts-ignore
    const resp = await supabase.auth.getUser?.();
    // older clients may have supabase.auth.user()
    if (resp?.data?.user?.id) return resp.data.user.id;
    // fallback:
    // @ts-ignore
    if (supabase.auth.user) {
      // @ts-ignore
      const u = supabase.auth.user();
      if (u?.id) return u.id;
    }
  } catch {
    // ignore
  }
  return undefined;
}

/**
 * Fetch user's settings from Supabase. Returns null if none or unauthenticated.
 */
export async function getUserSettings(): Promise<UserSettings | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    // If row doesn't exist, return null (no error for not found)
    if ((error as any)?.code === "PGRST116" || (error as any)?.message?.includes("No rows")) {
      return null;
    }
    console.error("getUserSettings error", error);
    throw error;
  }

  return (data as UserSettings) ?? null;
}

/**
 * Upsert (insert or update) user settings. If unauthenticated, does nothing and returns null.
 */
export async function upsertUserSettings(settings: Partial<UserSettings>): Promise<UserSettings | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const payload: any = {
    id: userId,
    ...settings,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("user_settings")
    .upsert(payload, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    console.error("upsertUserSettings error", error);
    throw error;
  }

  return (data as UserSettings) ?? null;
}