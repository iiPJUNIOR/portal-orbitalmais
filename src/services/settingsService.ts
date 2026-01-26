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
  has_full_access?: boolean;
  font_size?: 'small' | 'medium' | 'large' | 'extra-large';
  created_at?: string | null;
  updated_at?: string | null;
};

/**
 * Get settings for current authenticated user.
 */
export async function getUserSettings(): Promise<UserSettings | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;
    return (data as UserSettings) || null;
  } catch (err) {
    console.error("settingsService.getUserSettings error", err);
    throw err;
  }
}

/**
 * Get all users settings for admin management.
 */
export async function getAllUsersSettings(): Promise<any[]> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("user_id, seller_name, seller_email, has_full_access");
  
  if (error) throw error;
  return data;
}

/**
 * Update access permission for a specific user.
 */
export async function updateUserAccess(userId: string, hasAccess: boolean): Promise<void> {
  const { error } = await supabase
    .from("user_settings")
    .update({ has_full_access: hasAccess })
    .eq("user_id", userId);
  
  if (error) throw error;
}

/**
 * Upsert user settings.
 */
export async function saveUserSettings(payload: Partial<UserSettings>): Promise<UserSettings> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No authenticated user");

    const { data, error } = await supabase
      .from("user_settings")
      .upsert({
        user_id: user.id,
        ...payload,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" })
      .select()
      .single();

    if (error) throw error;

    try {
      window.dispatchEvent(new Event("user_settings_changed"));
    } catch {}

    return data as UserSettings;
  } catch (err) {
    console.error("settingsService.saveUserSettings error", err);
    throw err;
  }
}