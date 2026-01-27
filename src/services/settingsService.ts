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
 * This implementation calls an Edge Function that performs the upsert using
 * the service role key (bypassing RLS) so admins can pre-grant permissions
 * for users who haven't yet saved their profile.
 */
export async function grantPermissionByEmail(email: string, permission: 'history' | 'settings' | 'both'): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) throw new Error("E-mail inválido");

  try {
    // Call Edge Function (deployed to Supabase Functions) to perform privileged upsert.
    const FN_URL = "https://brbqsbvuitdxrtzqyopj.supabase.co/functions/v1/grant-permission";
    const resp = await fetch(FN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: cleanEmail, permission }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Grant function failed: ${resp.status} ${text}`);
    }

    const json = await resp.json().catch(() => ({}));
    // If function reports success, return
    if (json && json.success) return;

    // If function didn't explicitly return success, fallback to previous behavior:
    // attempt a safe upsert via Supabase client (this may fail due to RLS).
  } catch (fnErr) {
    console.warn("grantPermissionByEmail: edge function call failed, falling back to direct DB call:", fnErr);
  }

  // Fallback behavior (may be restricted by RLS): try to update existing row or insert with seller_email.
  // Build updates
  const updates: Record<string, any> = {};
  if (permission === 'history') updates.can_view_history = true;
  else if (permission === 'settings') updates.can_access_settings = true;
  else {
    updates.can_view_history = true;
    updates.can_access_settings = true;
  }

  // Look for an existing settings row by seller_email (case-insensitive)
  const { data: existing, error: selectErr } = await supabase
    .from("user_settings")
    .select("*")
    .ilike("seller_email", cleanEmail)
    .maybeSingle();

  if (selectErr) throw selectErr;

  if (existing) {
    // Update the existing row (keep user_id if present)
    const payload = { ...updates, updated_at: new Date().toISOString() };
    const { error: updateErr } = await supabase
      .from("user_settings")
      .update(payload)
      .eq("id", existing.id);
    if (updateErr) throw updateErr;
    return;
  }

  // No existing row — create a placeholder settings record keyed by email.
  const insertPayload: any = {
    seller_email: cleanEmail,
    ...updates,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error: insertErr } = await supabase
    .from("user_settings")
    .insert(insertPayload);

  if (insertErr) throw insertErr;
}

/**
 * Grant full access to a user by their email (legacy helper) - kept for compatibility.
 */
export async function grantAccessByEmail(email: string): Promise<void> {
  return grantPermissionByEmail(email, 'both');
}

/**
 * Upsert user settings.
 *
 * IMPORTANT: This function now also attempts to detect a pre-existing user_settings row
 * created by an admin keyed by seller_email and link it to the authenticated user by setting user_id.
 * This preserves permissions granted by email before the user saved their profile.
 */
export async function saveUserSettings(payload: Partial<UserSettings>): Promise<UserSettings> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No authenticated user");

    const userEmail = (payload.seller_email || user.email || "").trim().toLowerCase();

    // 1) If there's an existing row keyed by seller_email without a user_id, attach it to this user
    if (userEmail) {
      const { data: byEmail, error: byEmailErr } = await supabase
        .from("user_settings")
        .select("*")
        .ilike("seller_email", userEmail)
        .maybeSingle();

      if (byEmailErr) {
        console.warn("saveUserSettings: lookup by email failed", byEmailErr);
      } else if (byEmail && !byEmail.user_id) {
        // Merge existing server row with incoming payload, and set user_id to current user
        const merged = {
          ...byEmail,
          ...payload,
          user_id: user.id,
          updated_at: new Date().toISOString(),
        };
        // Use update by id to avoid creating duplicate rows
        const { data: updated, error: updateErr } = await supabase
          .from("user_settings")
          .update(merged)
          .eq("id", byEmail.id)
          .select()
          .single();

        if (updateErr) {
          console.warn("saveUserSettings: failed to attach byEmail record to user", updateErr);
        } else {
          try {
            window.dispatchEvent(new Event("user_settings_changed"));
          } catch {}
          return updated as UserSettings;
        }
      }
    }

    // 2) Standard upsert by user_id (will create or update the user's settings)
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