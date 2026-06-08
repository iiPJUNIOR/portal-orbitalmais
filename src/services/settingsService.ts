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
    
    let docxM = getLocalDocxMappings();
    let slideM = parsed.slide_mappings || {};
    let finalFields = defaultFields;

    if (parsed.product_fields) {
      if (!Array.isArray(parsed.product_fields) && typeof parsed.product_fields === 'object') {
        const obj = parsed.product_fields as any;
        finalFields = Array.isArray(obj.fields) ? obj.fields : defaultFields;
        docxM = obj.docx_mappings || {};
        slideM = obj.slide_mappings || {};
      } else if (Array.isArray(parsed.product_fields)) {
        finalFields = parsed.product_fields;
      }
    }

    parsed.docx_mappings = docxM;
    parsed.slide_mappings = slideM;
    parsed.product_fields = mergeFieldsWithDefaults(finalFields);
    return parsed;
  } catch (err) {
    console.warn("settingsService: readLocalSettings failed", err);
    return null;
  }
}

function writeLocalSettings(payload: Partial<UserSettings>): UserSettings {
  try {
    if (payload.docx_mappings) {
      saveLocalDocxMappings(payload.docx_mappings);
    }
    const existing = readLocalSettings() || {};
    
    const existingFields = Array.isArray(existing.product_fields) ? existing.product_fields : [];
    const newFields = payload.product_fields !== undefined ? payload.product_fields : existingFields;
    const newDocx = payload.docx_mappings !== undefined ? payload.docx_mappings : (existing.docx_mappings || {});
    const newSlide = payload.slide_mappings !== undefined ? payload.slide_mappings : (existing.slide_mappings || {});

    const localProductFieldsObj = {
      fields: newFields,
      docx_mappings: newDocx,
      slide_mappings: newSlide
    };

    const mergedPayload = { ...payload };
    mergedPayload.product_fields = localProductFieldsObj;
    delete mergedPayload.docx_mappings;
    delete mergedPayload.slide_mappings;

    const merged = { ...existing, ...mergedPayload, updated_at: new Date().toISOString() } as UserSettings;
    
    // unpack for returning
    merged.product_fields = newFields;
    merged.docx_mappings = newDocx;
    merged.slide_mappings = newSlide;

    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(mergedPayload));
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
    let rawProductFields: any = null;

    if (user) {
      const { data, error } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!error && data) {
        baseSettings = data as UserSettings;
        rawProductFields = data.product_fields;
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
      let docxM = {};
      let slideM = {};
      let finalFields = defaultFields;

      if (baseSettings.product_fields) {
        if (!Array.isArray(baseSettings.product_fields) && typeof baseSettings.product_fields === 'object') {
          const obj = baseSettings.product_fields as any;
          finalFields = Array.isArray(obj.fields) ? obj.fields : defaultFields;
          docxM = obj.docx_mappings || {};
          slideM = obj.slide_mappings || {};
        } else if (Array.isArray(baseSettings.product_fields)) {
          finalFields = baseSettings.product_fields;
          docxM = getLocalDocxMappings();
          slideM = (baseSettings as any).slide_mappings || {};
        }
      } else {
        docxM = getLocalDocxMappings();
        slideM = (baseSettings as any).slide_mappings || {};
      }

      let dbDocxEmpty = Object.keys(docxM).length === 0;
      let localDocx = getLocalDocxMappings();
      let localDocxNotEmpty = Object.keys(localDocx).length > 0;

      if (dbDocxEmpty && localDocxNotEmpty) {
        docxM = localDocx;
      }

      baseSettings.docx_mappings = docxM;
      baseSettings.slide_mappings = slideM;
      baseSettings.product_fields = mergeFieldsWithDefaults(finalFields);

      // AUTOMATIC MIGRATION TO DATABASE
      // If user is authenticated and the DB needs migration (either legacy format or missing mappings that we have locally),
      // migrate it immediately to prevent cross-device setting gaps!
      const needsMigration = Array.isArray(rawProductFields) || (dbDocxEmpty && localDocxNotEmpty);

      if (user && needsMigration) {
        const productFieldsObj = {
          fields: finalFields,
          docx_mappings: docxM,
          slide_mappings: slideM
        };
        // silent upsert in DB
        supabase
          .from("user_settings")
          .upsert({
            user_id: user.id,
            product_fields: productFieldsObj,
            updated_at: new Date().toISOString()
          }, { onConflict: "user_id" })
          .then(({ error }) => {
            if (error) console.warn("Failed to auto-migrate legacy mappings to DB", error);
            else console.log("Auto-migrated settings to DB successfully");
          });
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

export async function saveUserSettings(payload: Partial<UserSettings>): Promise<UserSettings> {
  try {
    if (payload.docx_mappings) {
      saveLocalDocxMappings(payload.docx_mappings);
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const saved = writeLocalSettings(payload);
      return saved;
    }

    // Load current settings from database to preserve existing properties in product_fields
    const { data: currentDbData } = await supabase
      .from("user_settings")
      .select("product_fields")
      .eq("user_id", user.id)
      .maybeSingle();

    let existingFields = [];
    let existingDocx = {};
    let existingSlide = {};

    if (currentDbData?.product_fields) {
      if (!Array.isArray(currentDbData.product_fields) && typeof currentDbData.product_fields === 'object') {
        const obj = currentDbData.product_fields as any;
        existingFields = obj.fields || [];
        existingDocx = obj.docx_mappings || {};
        existingSlide = obj.slide_mappings || {};
      } else if (Array.isArray(currentDbData.product_fields)) {
        existingFields = currentDbData.product_fields;
      }
    }

    if (Object.keys(existingDocx).length === 0) {
      existingDocx = getLocalDocxMappings();
    }

    const mergedFields = payload.product_fields !== undefined ? payload.product_fields : existingFields;
    const mergedDocx = payload.docx_mappings !== undefined ? payload.docx_mappings : existingDocx;
    const mergedSlide = payload.slide_mappings !== undefined ? payload.slide_mappings : existingSlide;

    const productFieldsObj = {
      fields: mergedFields,
      docx_mappings: mergedDocx,
      slide_mappings: mergedSlide
    };

    const dbPayload = { ...payload };
    dbPayload.product_fields = productFieldsObj;
    delete dbPayload.docx_mappings;
    delete dbPayload.slide_mappings;

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

    try {
      const localRaw = localStorage.getItem(LOCAL_SETTINGS_KEY);
      if (localRaw) {
        localStorage.removeItem(LOCAL_SETTINGS_KEY);
      }
    } catch {}

    window.dispatchEvent(new Event("user_settings_changed"));
    
    const final = data as UserSettings;
    let finalFields = defaultFields;
    let finalDocx = {};
    let finalSlide = {};
    
    if (final.product_fields && !Array.isArray(final.product_fields) && typeof final.product_fields === 'object') {
      const obj = final.product_fields as any;
      finalFields = Array.isArray(obj.fields) ? obj.fields : defaultFields;
      finalDocx = obj.docx_mappings || {};
      finalSlide = obj.slide_mappings || {};
    }
    
    final.product_fields = mergeFieldsWithDefaults(finalFields);
    final.docx_mappings = finalDocx;
    final.slide_mappings = finalSlide;
    return final;
  } catch (err) {
    console.error("saveUserSettings unexpected error:", err);
    const local = writeLocalSettings(payload);
    return local;
  }
}