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
  can_view_history?: boolean;
  can_access_settings?: boolean;
  font_size?: 'small' | 'medium' | 'large' | 'extra-large';
  slide_mappings?: Record<string, number>; // Mapeamento palavra-chave -> número do slide
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
    .select("user_id, seller_name, seller_email, has_full_access, can_view_history, can_access_settings")
    .order("seller_name", { ascending: true });
  
  if (error) throw error;
  return data;
}

/**
 * Update access permission for a specific user ID (legacy: has_full_access).
 */
export async function updateUserAccess(userId: string, hasAccess: boolean): Promise<void> {
  const { error } = await supabase
    .from("user_settings")
    .update({ has_full_access: hasAccess })
    .eq("user_id", userId);
  
  if (error) throw error;
}

/**
 * Update a specific granular permission for a user.
 * permission: 'history' -> can_view_history
 * permission: 'settings' -> can_access_settings
 */
export async function updateUserPermission(userId: string, permission: 'history' | 'settings', value: boolean): Promise<void> {
  const col = permission === 'history' ? 'can_view_history' : 'can_access_settings';
  const payload: Record<string, any> = {};
  payload[col] = value;
  const { error } = await supabase
    .from("user_settings")
    .update(payload)
    .eq("user_id", userId);
  if (error) throw error;
}

/**
 * Grant permission(s) by email.
 * permission: 'history' | 'settings' | 'both'
 *
 * Note: This looks up user_settings by seller_email and updates the appropriate column(s).
 * If no record exists with that email, throws and asks the admin to ask the user to sign-in/save profile first.
 */
export async function grantPermissionByEmail(email: string, permission: 'history' | 'settings' | 'both'): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  
  // Primeiro, verificamos se o usuário já existe na tabela de configurações
  const { data, error } = await supabase
    .from("user_settings")
    .select("user_id, can_view_history, can_access_settings")
    .ilike("seller_email", cleanEmail)
    .maybeSingle();

  if (error) throw error;
  
  if (!data) {
    throw new Error("Este e-mail ainda não possui um perfil no sistema. Peça para o usuário realizar o primeiro login e salvar o perfil nas Configurações.");
  }

  const updates: Record<string, any> = {};
  if (permission === 'history') updates.can_view_history = true;
  else if (permission === 'settings') updates.can_access_settings = true;
  else {
    updates.can_view_history = true;
    updates.can_access_settings = true;
  }

  const { error: updateError } = await supabase
    .from("user_settings")
    .update(updates)
    .eq("user_id", data.user_id);

  if (updateError) throw updateError;
}

/**
 * Grant full access to a user by their email (legacy helper) - kept for compatibility.
 */
export async function grantAccessByEmail(email: string): Promise<void> {
  return grantPermissionByEmail(email, 'both');
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