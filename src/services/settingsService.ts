"use client";

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
  docx_mappings?: Record<string, string>; // Mapeamento tag_no_docx -> campo_do_form
  created_at?: string | null;
  updated_at?: string | null;
};

const PAULO_EMAIL = "paulo.sergio@controlid.com.br";

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

    if (error) {
      console.error("getUserSettings error:", error);
      if (String(user.email).toLowerCase() === PAULO_EMAIL) {
        return {
          user_id: user.id,
          seller_email: user.email,
          can_view_history: true,
          can_access_settings: true,
        } as UserSettings;
      }
      return null;
    }

    if (data) {
      const settings = data as UserSettings;
      if (String(user.email).toLowerCase() === PAULO_EMAIL) {
        return { ...settings, can_view_history: true, can_access_settings: true };
      }
      return settings;
    }

    if (String(user.email).toLowerCase() === PAULO_EMAIL) {
      return {
        user_id: user.id,
        seller_email: user.email,
        can_view_history: true,
        can_access_settings: true,
      } as UserSettings;
    }

    return null;
  } catch (err) {
    console.error("settingsService.getUserSettings unexpected error", err);
    return null;
  }
}

/**
 * Get all users settings for admin management.
 */
export async function getAllUsersSettings(): Promise<any[]> {
  const FN_URL = "https://brbqsbvuitdxrtzqyopj.supabase.co/functions/v1/list-users";

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const resp = await fetch(FN_URL, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token || ""}`,
      },
    });

    if (!resp.ok) throw new Error("Edge Function failed");
    const json = await resp.json();
    return json.users || [];
  } catch (err) {
    console.warn("Falling back to direct DB select for users settings", err);
    const { data, error } = await supabase
      .from("user_settings")
      .select("user_id, seller_name, seller_email, can_view_history, can_access_settings")
      .order("seller_name", { ascending: true });
    
    if (error) throw error;
    return data || [];
  }
}

/**
 * Update a specific granular permission for a user.
 * Uses upsert with only the essential fields to grant permissions even to new users.
 */
export async function updateUserPermission(userId: string, email: string, permission: 'history' | 'settings', value: boolean): Promise<void> {
  const col = permission === 'history' ? 'can_view_history' : 'can_access_settings';
  
  const payload: Record<string, any> = { 
    user_id: userId,
    seller_email: email,
    [col]: value, 
    updated_at: new Date().toISOString() 
  };

  // Realiza o upsert (insere se não existir, atualiza se existir) baseado no user_id
  const { error } = await supabase
    .from("user_settings")
    .upsert(payload, { onConflict: 'user_id' });

  if (error) {
    console.error("updateUserPermission error:", error);
    throw error;
  }
}

/**
 * Grant permission(s) by email.
 */
export async function grantPermissionByEmail(email: string, permission: 'history' | 'settings' | 'both'): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const FN_URL = "https://brbqsbvuitdxrtzqyopj.supabase.co/functions/v1/grant-permission";
  const { data: { session } } = await supabase.auth.getSession();
  const resp = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session?.access_token || ""}`,
    },
    body: JSON.stringify({ email: cleanEmail, permission }),
  });
  if (!resp.ok) throw new Error("Edge Function failed");
}

/**
 * Upsert user settings.
 */
export async function saveUserSettings(payload: Partial<UserSettings>): Promise<UserSettings> {
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

  if (error) {
    console.error("saveUserSettings error:", error);
    throw error;
  }

  window.dispatchEvent(new Event("user_settings_changed"));
  return data as UserSettings;
}