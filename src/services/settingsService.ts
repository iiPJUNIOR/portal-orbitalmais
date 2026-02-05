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
const LOCAL_SETTINGS_KEY = "local_user_settings_v1";

/**
 * Try to read settings from localStorage fallback.
 */
function readLocalSettings(): UserSettings | null {
  try {
    const raw = localStorage.getItem(LOCAL_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed as UserSettings;
  } catch (err) {
    console.warn("settingsService: readLocalSettings failed", err);
    return null;
  }
}

/**
 * Persist settings to localStorage fallback.
 */
function writeLocalSettings(payload: Partial<UserSettings>): UserSettings {
  try {
    const existing = readLocalSettings() || {};
    const merged = { ...existing, ...payload, updated_at: new Date().toISOString() } as UserSettings;
    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(merged));
    // notify listeners
    try { window.dispatchEvent(new Event("user_settings_changed")); } catch {}
    return merged;
  } catch (err) {
    console.warn("settingsService: writeLocalSettings failed", err);
    return payload as UserSettings;
  }
}

/**
 * Get settings for current authenticated user.
 * If no authenticated user or Supabase fails, returns a localStorage fallback (if present).
 */
export async function getUserSettings(): Promise<UserSettings | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // No authenticated user; return local fallback if available
      const local = readLocalSettings();
      if (local) return local;
      return null;
    }

    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("getUserSettings error:", error);
      // On error, try local fallback
      const local = readLocalSettings();
      if (local) return local;
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

    // No DB row found; if super admin, return default admin flags
    if (String(user.email).toLowerCase() === PAULO_EMAIL) {
      return {
        user_id: user.id,
        seller_email: user.email,
        can_view_history: true,
        can_access_settings: true,
      } as UserSettings;
    }

    // As a last resort, check local fallback
    const local = readLocalSettings();
    if (local) return local;
    return null;
  } catch (err) {
    console.error("settingsService.getUserSettings unexpected error", err);
    // Try local fallback on unexpected error
    const local = readLocalSettings();
    if (local) return local;
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
 * If there is no authenticated user or Supabase fails, persist to localStorage as a fallback.
 */
export async function saveUserSettings(payload: Partial<UserSettings>): Promise<UserSettings> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // No authenticated user: persist locally as fallback
      const saved = writeLocalSettings(payload);
      return saved;
    }

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
      // On error try to persist locally to avoid losing user's changes
      const local = writeLocalSettings(payload);
      return local;
    }

    // If we succeeded saving to server, also remove/merge any local fallback to avoid divergence.
    try {
      const localRaw = localStorage.getItem(LOCAL_SETTINGS_KEY);
      if (localRaw) {
        localStorage.removeItem(LOCAL_SETTINGS_KEY);
      }
    } catch {}

    window.dispatchEvent(new Event("user_settings_changed"));
    return data as UserSettings;
  } catch (err) {
    console.error("saveUserSettings unexpected error:", err);
    // Fallback to local storage so user's changes are not lost
    const local = writeLocalSettings(payload);
    return local;
  }
}