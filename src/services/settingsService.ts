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
  product_fields?: any[]; // Configuração dinâmica de campos de produtos
  pptx_template_url?: string | null; // URL do template PPTX customizado
  created_at?: string | null;
  updated_at?: string | null;
};

export interface ProductFieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "currency" | "dropdown";
  options?: string[];
  isCustom: boolean;
  isActive: boolean;
}

export const defaultFields: ProductFieldDef[] = [
  { key: "sku", label: "SKU/Código", type: "text", isCustom: false, isActive: true },
  { key: "model", label: "Modelo / Nome", type: "text", isCustom: false, isActive: true },
  { key: "status", label: "Status", type: "text", isCustom: false, isActive: true },
  { key: "category", label: "Categoria", type: "text", isCustom: false, isActive: true },
  { key: "description", label: "Descrição", type: "text", isCustom: false, isActive: true },
  { key: "value_12m", label: "Valor Mensal (12m)", type: "number", isCustom: false, isActive: true },
  { key: "value_24m", label: "Valor Mensal (24m)", type: "number", isCustom: false, isActive: true },
  { key: "colors", label: "Cores", type: "text", isCustom: false, isActive: true },
  { key: "biometrics", label: "Biometria", type: "boolean", isCustom: false, isActive: true },
  { key: "facial", label: "Reconhecimento Facial", type: "text", isCustom: false, isActive: true },
  { key: "proximity", label: "Proximidade / RFID", type: "text", isCustom: false, isActive: true },
  { key: "urn", label: "Urna Coletora", type: "boolean", isCustom: false, isActive: true },
  { key: "qr", label: "Leitor QR Code", type: "boolean", isCustom: false, isActive: true },
];

export function mergeFieldsWithDefaults(savedFields: any[]): ProductFieldDef[] {
  if (Array.isArray(savedFields)) {
    return savedFields;
  }
  return defaultFields;
}

const PAULO_EMAIL = "paulo.sergio@controlid.com.br";
const LOCAL_SETTINGS_KEY = "local_user_settings_v1";
const DOCX_MAP_KEY = "docx_token_map";

/**
 * Helper to get DOCX mappings from local storage (source of truth for this field)
 */
function getLocalDocxMappings(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DOCX_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Helper to save DOCX mappings to local storage
 */
function saveLocalDocxMappings(map: Record<string, string>) {
  try {
    localStorage.setItem(DOCX_MAP_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn("settingsService: failed to save docx mappings locally", err);
  }
}

/**
 * Try to read settings from localStorage fallback.
 */
function readLocalSettings(): UserSettings | null {
  try {
    const raw = localStorage.getItem(LOCAL_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserSettings;
    // Inject docx mappings
    parsed.docx_mappings = getLocalDocxMappings();
    // Merge product fields
    if (Array.isArray(parsed.product_fields)) {
      parsed.product_fields = mergeFieldsWithDefaults(parsed.product_fields);
    } else {
      parsed.product_fields = defaultFields;
    }
    return parsed;
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
    if (payload.docx_mappings) {
      saveLocalDocxMappings(payload.docx_mappings);
    }
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
    
    let baseSettings: UserSettings | null = null;

    if (user) {
      const { data, error } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!error && data) {
        baseSettings = data as UserSettings;
        if (String(user.email).toLowerCase() === PAULO_EMAIL) {
          baseSettings.can_view_history = true;
          baseSettings.can_access_settings = true;
        }
      } else if (String(user.email).toLowerCase() === PAULO_EMAIL) {
        baseSettings = {
          user_id: user.id,
          seller_email: user.email,
          can_view_history: true,
          can_access_settings: true,
        } as UserSettings;
      }
    }

    if (!baseSettings) {
      baseSettings = readLocalSettings();
    }

    if (baseSettings) {
      // Always ensure docx_mappings are included from local storage source
      baseSettings.docx_mappings = getLocalDocxMappings();
      // Auto-merge product fields config with defaults
      if (Array.isArray(baseSettings.product_fields)) {
        baseSettings.product_fields = mergeFieldsWithDefaults(baseSettings.product_fields);
      } else {
        baseSettings.product_fields = defaultFields;
      }
    }

    return baseSettings;
  } catch (err) {
    console.error("settingsService.getUserSettings unexpected error", err);
    const local = readLocalSettings();
    return local;
  }
}

export async function getAllUsersSettings(): Promise<any[]> {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL || "https://jfbjeavkedcojarfygzf.supabase.co";
  const FN_URL = `${baseUrl}/functions/v1/list-users`;

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

export async function grantPermissionByEmail(email: string, permission: 'history' | 'settings' | 'both'): Promise<void> {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL || "https://jfbjeavkedcojarfygzf.supabase.co";
  const cleanEmail = email.trim().toLowerCase();
  const FN_URL = `${baseUrl}/functions/v1/grant-permission`;
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
    // 1. Handle docx_mappings locally first as they don't have a DB column
    if (payload.docx_mappings) {
      saveLocalDocxMappings(payload.docx_mappings);
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // No authenticated user: persist locally as fallback
      const saved = writeLocalSettings(payload);
      return saved;
    }

    // 2. Build cleaned payload for DB (remove non-db fields)
    const dbPayload = { ...payload };
    delete dbPayload.docx_mappings; // DB doesn't have this column

    const { data, error } = await supabase
      .from("user_settings")
      .upsert({
        user_id: user.id,
        ...dbPayload,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" })
      .select()
      .single();

    if (error) {
      console.error("saveUserSettings error:", error);
      const local = writeLocalSettings(payload);
      return local;
    }

    // If we succeeded saving to server, also remove any separate local fallback to avoid divergence.
    try {
      const localRaw = localStorage.getItem(LOCAL_SETTINGS_KEY);
      if (localRaw) {
        localStorage.removeItem(LOCAL_SETTINGS_KEY);
      }
    } catch {}

    window.dispatchEvent(new Event("user_settings_changed"));
    const final = data as UserSettings;
    final.docx_mappings = getLocalDocxMappings();
    return final;
  } catch (err) {
    console.error("saveUserSettings unexpected error:", err);
    const local = writeLocalSettings(payload);
    return local;
  }
}