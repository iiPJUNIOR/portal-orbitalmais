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

const PAULO_EMAIL = "paulo.sergio@controlid.com.br";

/**
 * Get settings for current authenticated user.
 * - First tries to find by user_id.
 * - If none, tries to find by seller_email (case-insensitive) and attach it to the current user when possible.
 * - If the current user is the super-admin PAULO_EMAIL, ensure returned settings include full access flags and
 *   create/upsert a row bound to his user_id so UI checks work reliably.
 */
export async function getUserSettings(): Promise<UserSettings | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // 1) Try to get settings by user_id
    const { data: byId, error: byIdErr } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (byIdErr) {
      console.warn("getUserSettings: lookup by user_id failed", byIdErr);
    }

    if (byId) {
      // Ensure admin flags are present for Paulo
      if (String(user.email).toLowerCase() === PAULO_EMAIL) {
        const patched = { ...byId, can_view_history: true, can_access_settings: true };
        return patched as UserSettings;
      }
      return byId as UserSettings;
    }

    // 2) Not found by user_id -> try to find existing row by seller_email (case-insensitive)
    const userEmail = (user.email || "").trim();
    if (userEmail) {
      const { data: byEmail, error: byEmailErr } = await supabase
        .from("user_settings")
        .select("*")
        .ilike("seller_email", userEmail)
        .maybeSingle();

      if (byEmailErr) {
        console.warn("getUserSettings: lookup by seller_email failed", byEmailErr);
      }

      if (byEmail) {
        // If the row exists but is not attached to any user_id, attach it to current user
        if (!byEmail.user_id) {
          try {
            const { data: updated, error: updateErr } = await supabase
              .from("user_settings")
              .update({ user_id: user.id, updated_at: new Date().toISOString() })
              .eq("id", byEmail.id)
              .select()
              .maybeSingle();

            if (!updateErr && updated) {
              // Ensure admin flags for Paulo
              if (String(user.email).toLowerCase() === PAULO_EMAIL) {
                const patched = { ...updated, can_view_history: true, can_access_settings: true };
                return patched as UserSettings;
              }
              return updated as UserSettings;
            }
          } catch (err) {
            console.warn("getUserSettings: failed to attach settings row to user", err);
            // Fallthrough to return the found row (without user_id), better than null
            if (String(user.email).toLowerCase() === PAULO_EMAIL) {
              const patched = { ...byEmail, can_view_history: true, can_access_settings: true };
              return patched as UserSettings;
            }
            return byEmail as UserSettings;
          }
        } else {
          // row exists and belongs to somebody (not this user) — but return it if emails match
          if (String(user.email).toLowerCase() === PAULO_EMAIL) {
            const patched = { ...byEmail, can_view_history: true, can_access_settings: true };
            // Try to ensure the row is linked to this user_id (upsert may override other user_id intentionally only for admin)
            try {
              await supabase
                .from("user_settings")
                .upsert({ user_id: user.id, seller_email: user.email.toLowerCase() }, { onConflict: "user_id" });
            } catch (err) {
              // ignore errors here; we still return patched
            }
            return patched as UserSettings;
          }
          return byEmail as UserSettings;
        }
      }
    }

    // 3) No row found by user_id nor seller_email.
    // If current user is Paulo, upsert a settings row granting full access so UI toggles and history appear immediately.
    if (String(user.email).toLowerCase() === PAULO_EMAIL) {
      try {
        const payload = {
          user_id: user.id,
          seller_name: user.user_metadata?.full_name || user.email,
          seller_email: user.email,
          can_view_history: true,
          can_access_settings: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { data: upserted, error: upsertErr } = await supabase
          .from("user_settings")
          .upsert(payload, { onConflict: "user_id" })
          .select()
          .single();

        if (!upsertErr && upserted) {
          return upserted as UserSettings;
        } else {
          // fallback: return constructed settings object even if DB upsert failed
          return {
            user_id: user.id,
            seller_name: user.user_metadata?.full_name || user.email,
            seller_email: user.email,
            can_view_history: true,
            can_access_settings: true,
          } as UserSettings;
        }
      } catch (err) {
        console.warn("getUserSettings: failed to create default admin settings row", err);
        return {
          user_id: user.id,
          seller_name: user.user_metadata?.full_name || user.email,
          seller_email: user.email,
          can_view_history: true,
          can_access_settings: true,
        } as UserSettings;
      }
    }

    // No settings found for this user
    return null;
  } catch (err) {
    console.error("settingsService.getUserSettings error", err);
    throw err;
  }
}

/**
 * Ensure there is a settings row attached to the current authenticated user.
 * Behavior:
 * - If a row with seller_email matching the current user's email exists:
 *   - If it has no user_id, attach it to current user and return the updated row.
 *   - If it already has a user_id, return it (no destructive change).
 * - If none found, returns null.
 *
 * This helper is useful for recovering records that were created before users had an account bound.
 */
export async function ensureSettingsForCurrentUser(): Promise<UserSettings | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !user.email) return null;
    const userEmail = (user.email || "").trim().toLowerCase();

    // Try to find by seller_email case-insensitive
    const { data: found, error: findErr } = await supabase
      .from("user_settings")
      .select("*")
      .ilike("seller_email", userEmail)
      .maybeSingle();

    if (findErr) {
      console.warn("ensureSettingsForCurrentUser: lookup failed", findErr);
      return null;
    }

    if (!found) return null;

    if (!found.user_id) {
      // Attach to current user
      const { data: updated, error: updateErr } = await supabase
        .from("user_settings")
        .update({ user_id: user.id, updated_at: new Date().toISOString() })
        .eq("id", found.id)
        .select()
        .maybeSingle();

      if (updateErr) {
        console.warn("ensureSettingsForCurrentUser: failed to attach user_id", updateErr);
        // still return original found record as fallback
        return found as UserSettings;
      }
      return updated as UserSettings;
    }

    // If already attached, just return it
    return found as UserSettings;
  } catch (err) {
    console.error("ensureSettingsForCurrentUser error", err);
    return null;
  }
}

/**
 * Get all users settings for admin management.
 * This now calls an Edge Function which uses the service role key to read auth.users and user_settings,
 * returning a combined list so super-admins can see all registered emails.
 */
export async function getAllUsersSettings(): Promise<any[]> {
  const FN_URL = "https://brbqsbvuitdxrtzqyopj.supabase.co/functions/v1/list-users";

  try {
    // Get current session to pass token
    const { data: { session } } = await supabase.auth.getSession();
    
    const resp = await fetch(FN_URL, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token || ""}`,
      },
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Edge Function list-users failed (status ${resp.status}): ${text}`);
    }

    const json = await resp.json().catch(() => ({}));
    return (json.users || []) as any[];
  } catch (err) {
    console.error("getAllUsersSettings (edge) failed, falling back to local user_settings query", err);
    // Fallback: return the legacy user_settings rows if the Edge Function is not available.
    const { data, error } = await supabase
      .from("user_settings")
      .select("user_id, seller_name, seller_email, has_full_access, can_view_history, can_access_settings")
      .order("seller_name", { ascending: true });
    
    if (error) throw error;
    return data || [];
  }
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
 */
export async function grantPermissionByEmail(email: string, permission: 'history' | 'settings' | 'both'): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) throw new Error("E-mail inválido");

  const FN_URL = "https://brbqsbvuitdxrtzqyopj.supabase.co/functions/v1/grant-permission";

  try {
    const { data: { session } } = await supabase.auth.getSession();

    const resp = await fetch(FN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token || ""}`,
      },
      body: JSON.stringify({ email: cleanEmail, permission }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Edge Function 'grant-permission' failed (status ${resp.status}). ${text}`);
    }

    const json = await resp.json().catch(() => ({}));
    if (json && json.success) return;

    throw new Error(`Edge Function 'grant-permission' retornou uma resposta inesperada: ${JSON.stringify(json)}`);
  } catch (err) {
    console.error("grantPermissionByEmail: edge function call failed", err);
    throw err;
  }
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

    const userEmail = (payload.seller_email || user.email || "").trim().toLowerCase();

    if (userEmail) {
      const { data: byEmail, error: byEmailErr } = await supabase
        .from("user_settings")
        .select("*")
        .ilike("seller_email", userEmail)
        .maybeSingle();

      if (byEmailErr) {
        console.warn("saveUserSettings: lookup by email failed", byEmailErr);
      } else if (byEmail && !byEmail.user_id) {
        const merged = {
          ...byEmail,
          ...payload,
          user_id: user.id,
          updated_at: new Date().toISOString(),
        };
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