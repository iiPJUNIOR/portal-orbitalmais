import { supabase } from "@/integrations/supabase/client";

export type UserSettings = {
  user_id?: string | null;
  seller_name?: string | null;
  seller_role?: string | null;
  seller_email?: string | null;
  seller_phone?: string | null;
  spreadsheet_link?: string | null;
  complement_range?: string | null;
  complement_sheet?: string | null;
  complement_key_column?: string | null;
  complement_com_ids_column?: string | null;
  complement_sem_ids_column?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

/**
 * Get settings for current authenticated user. Returns null if no settings row exists or user not signed in.
 */
export async function getUserSettings(): Promise<UserSettings | null> {
  // Try to get current user id
  try {
    // @ts-ignore - supabase.auth.getUser may exist depending on version
    const userResp = await supabase.auth.getUser?.();
    const userId = userResp?.data?.user?.id;
    if (!userId) return null;

    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error) {
      // If not found, return null (don't treat as fatal)
      // other errors bubble up
      if ((error as any).code === "PGRST116" || (error as any).status === 406) {
        return null;
      }
      throw error;
    }

    return (data as UserSettings) || null;
  } catch (err) {
    console.error("settingsService.getUserSettings error", err);
    throw err;
  }
}

/**
 * Upsert (insert/update) user settings for the current authenticated user.
 * Returns the saved row.
 */
export async function saveUserSettings(payload: Partial<UserSettings>): Promise<UserSettings> {
  try {
    // @ts-ignore
    const userResp = await supabase.auth.getUser?.();
    const userId = userResp?.data?.user?.id;
    if (!userId) {
      throw new Error("No authenticated user");
    }

    const row = {
      user_id: userId,
      seller_name: payload.seller_name ?? null,
      seller_role: payload.seller_role ?? null,
      seller_email: payload.seller_email ?? null,
      seller_phone: payload.seller_phone ?? null,
      spreadsheet_link: payload.spreadsheet_link ?? null,
      complement_range: payload.complement_range ?? null,
      complement_sheet: payload.complement_sheet ?? null,
      complement_key_column: payload.complement_key_column ?? null,
      complement_com_ids_column: payload.complement_com_ids_column ?? null,
      complement_sem_ids_column: payload.complement_sem_ids_column ?? null,
    };

    const { data, error } = await supabase
      .from("user_settings")
      .upsert(row, { onConflict: "user_id" })
      .select()
      .single();

    if (error) {
      console.error("settingsService.saveUserSettings error", error);
      throw error;
    }

    // notify clients so UI can react if needed
    try {
      window.dispatchEvent(new Event("user_settings_changed"));
    } catch {}

    return data as UserSettings;
  } catch (err) {
    console.error("settingsService.saveUserSettings error", err);
    throw err;
  }
}