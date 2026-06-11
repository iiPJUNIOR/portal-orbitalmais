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
  service_docx_mappings?: Record<string, string>; // Mapeamento tag_no_docx_servico -> campo_do_form_servico
  product_fields?: any[]; // Configuração dinâmica de campos de produtos
  pptx_template_url?: string | null; // URL do template PPTX customizado
  service_docx_url?: string | null; // URL do template DOCX de servico customizado
  tipos_servico?: any[];
  tipos_junta?: any[];
  tipos_material?: any[];
  campos_tipo_servico?: any[];
  campos_tipo_junta?: any[];
  campos_tipo_material?: any[];
  responsabilidades_cliente?: ResponsabilidadeDef[];
  responsabilidades_orbital?: ResponsabilidadeDef[];
  created_at?: string | null;
  updated_at?: string | null;
};

export interface ResponsabilidadeDef {
  id: string;
  label: string;
}

export interface TypeFieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "boolean";
}

export interface TypeObject {
  id: string;
  name: string;
  properties: Record<string, any>;
}

export function normalizeTypesList(list: any[]): TypeObject[] {
  if (!Array.isArray(list)) return [];
  return list.map((item, idx) => {
    if (typeof item === 'string') {
      return {
        id: `legacy-${idx}-${item.replace(/\s+/g, '_')}`,
        name: item,
        properties: {}
      };
    }
    return {
      id: item.id || `type-${idx}-${Date.now()}`,
      name: item.name || "",
      properties: item.properties || {}
    };
  });
}

export interface ProductFieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "currency" | "dropdown";
  options?: string[];
  isCustom: boolean;
  isActive: boolean;
}

export const defaultFields: ProductFieldDef[] = [
  { key: "sku", label: "Código", type: "text", isCustom: false, isActive: true },
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
    let serviceDocxUrl = null;
    let serviceDocxM = {};
    let tiposServico: any[] = ["Instalação", "Manutenção Preventiva", "Manutenção Corretiva", "Suporte Técnico", "Consultoria"];
    let tiposJunta: any[] = ["Junta Seca", "Junta Sobreposta", "Junta Soldada", "Junta Flangeada", "Junta de Dilatação"];
    let tiposMaterial: any[] = ["Aço Carbono", "Aço Inox", "Liga Cobre", "Alumínio"];
    let camposTipoServico: any[] = [];
    let camposTipoJunta: any[] = [];
    let camposTipoMaterial: any[] = [];
    let responsabilidadesCliente: ResponsabilidadeDef[] = [];
    let responsabilidadesOrbital: ResponsabilidadeDef[] = [];

    if (parsed.product_fields) {
      if (!Array.isArray(parsed.product_fields) && typeof parsed.product_fields === 'object') {
        const obj = parsed.product_fields as any;
        finalFields = Array.isArray(obj.fields) ? obj.fields : defaultFields;
        docxM = obj.docx_mappings || {};
        slideM = obj.slide_mappings || {};
        serviceDocxUrl = obj.service_docx_url || null;
        serviceDocxM = obj.service_docx_mappings || {};
        tiposServico = obj.tipos_servico || ["Instalação", "Manutenção Preventiva", "Manutenção Corretiva", "Suporte Técnico", "Consultoria"];
        tiposJunta = obj.tipos_junta || ["Junta Seca", "Junta Sobreposta", "Junta Soldada", "Junta Flangeada", "Junta de Dilatação"];
        tiposMaterial = obj.tipos_material || ["Aço Carbono", "Aço Inox", "Liga Cobre", "Alumínio"];
        camposTipoServico = obj.campos_tipo_servico || [];
        camposTipoJunta = obj.campos_tipo_junta || [];
        camposTipoMaterial = obj.campos_tipo_material || [];
        responsabilidadesCliente = obj.responsabilidades_cliente || [];
        responsabilidadesOrbital = obj.responsabilidades_orbital || [];
      } else if (Array.isArray(parsed.product_fields)) {
        finalFields = parsed.product_fields;
      }
    }

    parsed.docx_mappings = docxM;
    parsed.slide_mappings = slideM;
    parsed.service_docx_url = serviceDocxUrl;
    parsed.service_docx_mappings = serviceDocxM;
    parsed.product_fields = mergeFieldsWithDefaults(finalFields);
    parsed.tipos_servico = normalizeTypesList(tiposServico);
    parsed.tipos_junta = normalizeTypesList(tiposJunta);
    parsed.tipos_material = normalizeTypesList(tiposMaterial);
    parsed.campos_tipo_servico = camposTipoServico;
    parsed.campos_tipo_junta = camposTipoJunta;
    parsed.campos_tipo_material = camposTipoMaterial;
    parsed.responsabilidades_cliente = responsabilidadesCliente;
    parsed.responsabilidades_orbital = responsabilidadesOrbital;
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
    const newServiceUrl = payload.service_docx_url !== undefined ? payload.service_docx_url : (existing.service_docx_url || null);
    const newServiceMappings = payload.service_docx_mappings !== undefined ? payload.service_docx_mappings : (existing.service_docx_mappings || {});
    const newTiposServico = payload.tipos_servico !== undefined ? payload.tipos_servico : (existing.tipos_servico || ["Instalação", "Manutenção Preventiva", "Manutenção Corretiva", "Suporte Técnico", "Consultoria"]);
    const newTiposJunta = payload.tipos_junta !== undefined ? payload.tipos_junta : (existing.tipos_junta || ["Junta Seca", "Junta Sobreposta", "Junta Soldada", "Junta Flangeada", "Junta de Dilatação"]);
    const newTiposMaterial = payload.tipos_material !== undefined ? payload.tipos_material : (existing.tipos_material || ["Aço Carbono", "Aço Inox", "Liga Cobre", "Alumínio"]);
    const newCamposTipoServico = payload.campos_tipo_servico !== undefined ? payload.campos_tipo_servico : (existing.campos_tipo_servico || []);
    const newCamposTipoJunta = payload.campos_tipo_junta !== undefined ? payload.campos_tipo_junta : (existing.campos_tipo_junta || []);
    const newCamposTipoMaterial = payload.campos_tipo_material !== undefined ? payload.campos_tipo_material : (existing.campos_tipo_material || []);
    const newResponsabilidadesCliente = payload.responsabilidades_cliente !== undefined ? payload.responsabilidades_cliente : (existing.responsabilidades_cliente || []);
    const newResponsabilidadesOrbital = payload.responsabilidades_orbital !== undefined ? payload.responsabilidades_orbital : (existing.responsabilidades_orbital || []);

    const localProductFieldsObj = {
      fields: newFields,
      docx_mappings: newDocx,
      slide_mappings: newSlide,
      service_docx_url: newServiceUrl,
      service_docx_mappings: newServiceMappings,
      tipos_servico: newTiposServico,
      tipos_junta: newTiposJunta,
      tipos_material: newTiposMaterial,
      campos_tipo_servico: newCamposTipoServico,
      campos_tipo_junta: newCamposTipoJunta,
      campos_tipo_material: newCamposTipoMaterial,
      responsabilidades_cliente: newResponsabilidadesCliente,
      responsabilidades_orbital: newResponsabilidadesOrbital
    };

    const mergedPayload = { ...payload };
    mergedPayload.product_fields = localProductFieldsObj;
    delete mergedPayload.docx_mappings;
    delete mergedPayload.slide_mappings;
    delete mergedPayload.service_docx_url;
    delete mergedPayload.service_docx_mappings;
    delete mergedPayload.tipos_servico;
    delete mergedPayload.tipos_junta;
    delete mergedPayload.tipos_material;
    delete mergedPayload.campos_tipo_servico;
    delete mergedPayload.campos_tipo_junta;
    delete mergedPayload.campos_tipo_material;
    delete mergedPayload.responsabilidades_cliente;
    delete mergedPayload.responsabilidades_orbital;

    const merged = { ...existing, ...mergedPayload, updated_at: new Date().toISOString() } as UserSettings;
    
    // unpack for returning
    merged.product_fields = newFields;
    merged.docx_mappings = newDocx;
    merged.slide_mappings = newSlide;
    merged.service_docx_url = newServiceUrl;
    merged.service_docx_mappings = newServiceMappings;
    merged.tipos_servico = normalizeTypesList(newTiposServico);
    merged.tipos_junta = normalizeTypesList(newTiposJunta);
    merged.tipos_material = normalizeTypesList(newTiposMaterial);
    merged.campos_tipo_servico = newCamposTipoServico;
    merged.campos_tipo_junta = newCamposTipoJunta;
    merged.campos_tipo_material = newCamposTipoMaterial;
    merged.responsabilidades_cliente = newResponsabilidadesCliente;
    merged.responsabilidades_orbital = newResponsabilidadesOrbital;

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
      let serviceDocxUrl = null;
      let serviceDocxM = {};
      let tiposServico: any[] = ["Instalação", "Manutenção Preventiva", "Manutenção Corretiva", "Suporte Técnico", "Consultoria"];
      let tiposJunta: any[] = ["Junta Seca", "Junta Sobreposta", "Junta Soldada", "Junta Flangeada", "Junta de Dilatação"];
      let tiposMaterial: any[] = ["Aço Carbono", "Aço Inox", "Liga Cobre", "Alumínio"];
      let camposTipoServico: any[] = [];
      let camposTipoJunta: any[] = [];
      let camposTipoMaterial: any[] = [];
      let responsabilidadesCliente: ResponsabilidadeDef[] = [];
      let responsabilidadesOrbital: ResponsabilidadeDef[] = [];

      if (baseSettings.product_fields) {
        if (!Array.isArray(baseSettings.product_fields) && typeof baseSettings.product_fields === 'object') {
          const obj = baseSettings.product_fields as any;
          finalFields = Array.isArray(obj.fields) ? obj.fields : defaultFields;
          docxM = obj.docx_mappings || {};
          slideM = obj.slide_mappings || {};
          serviceDocxUrl = obj.service_docx_url || null;
          serviceDocxM = obj.service_docx_mappings || {};
          tiposServico = obj.tipos_servico || ["Instalação", "Manutenção Preventiva", "Manutenção Corretiva", "Suporte Técnico", "Consultoria"];
          tiposJunta = obj.tipos_junta || ["Junta Seca", "Junta Sobreposta", "Junta Soldada", "Junta Flangeada", "Junta de Dilatação"];
          tiposMaterial = obj.tipos_material || ["Aço Carbono", "Aço Inox", "Liga Cobre", "Alumínio"];
          camposTipoServico = obj.campos_tipo_servico || [];
          camposTipoJunta = obj.campos_tipo_junta || [];
          camposTipoMaterial = obj.campos_tipo_material || [];
          responsabilidadesCliente = obj.responsabilidades_cliente || [];
          responsabilidadesOrbital = obj.responsabilidades_orbital || [];
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
      baseSettings.service_docx_url = serviceDocxUrl;
      baseSettings.service_docx_mappings = serviceDocxM;
      baseSettings.product_fields = mergeFieldsWithDefaults(finalFields);
      baseSettings.tipos_servico = normalizeTypesList(tiposServico);
      baseSettings.tipos_junta = normalizeTypesList(tiposJunta);
      baseSettings.tipos_material = normalizeTypesList(tiposMaterial);
      baseSettings.campos_tipo_servico = camposTipoServico;
      baseSettings.campos_tipo_junta = camposTipoJunta;
      baseSettings.campos_tipo_material = camposTipoMaterial;
      baseSettings.responsabilidades_cliente = responsabilidadesCliente;
      baseSettings.responsabilidades_orbital = responsabilidadesOrbital;

      // AUTOMATIC MIGRATION TO DATABASE
      // If user is authenticated and the DB needs migration (either legacy format or missing mappings that we have locally),
      // migrate it immediately to prevent cross-device setting gaps!
      const needsMigration = Array.isArray(rawProductFields) || (dbDocxEmpty && localDocxNotEmpty);

      if (user && needsMigration) {
        const productFieldsObj = {
          fields: finalFields,
          docx_mappings: docxM,
          slide_mappings: slideM,
          service_docx_url: serviceDocxUrl,
          service_docx_mappings: serviceDocxM,
          tipos_servico: tiposServico,
          tipos_junta: tiposJunta,
          tipos_material: tiposMaterial,
          campos_tipo_servico: camposTipoServico,
          campos_tipo_junta: camposTipoJunta,
          campos_tipo_material: camposTipoMaterial,
          responsabilidades_cliente: responsabilidadesCliente,
          responsabilidades_orbital: responsabilidadesOrbital
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
    let existingServiceUrl = null;
    let existingServiceMappings = {};
    let existingTiposServico = [];
    let existingTiposJunta = [];
    let existingTiposMaterial = [];
    let existingCamposTipoServico = [];
    let existingCamposTipoJunta = [];
    let existingCamposTipoMaterial = [];
    let existingResponsabilidadesCliente: ResponsabilidadeDef[] = [];
    let existingResponsabilidadesOrbital: ResponsabilidadeDef[] = [];

    if (currentDbData?.product_fields) {
      if (!Array.isArray(currentDbData.product_fields) && typeof currentDbData.product_fields === 'object') {
        const obj = currentDbData.product_fields as any;
        existingFields = obj.fields || [];
        existingDocx = obj.docx_mappings || {};
        existingSlide = obj.slide_mappings || {};
        existingServiceUrl = obj.service_docx_url || null;
        existingServiceMappings = obj.service_docx_mappings || {};
        existingTiposServico = obj.tipos_servico || [];
        existingTiposJunta = obj.tipos_junta || [];
        existingTiposMaterial = obj.tipos_material || [];
        existingCamposTipoServico = obj.campos_tipo_servico || [];
        existingCamposTipoJunta = obj.campos_tipo_junta || [];
        existingCamposTipoMaterial = obj.campos_tipo_material || [];
        existingResponsabilidadesCliente = obj.responsabilidades_cliente || [];
        existingResponsabilidadesOrbital = obj.responsabilidades_orbital || [];
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
    const mergedServiceUrl = payload.service_docx_url !== undefined ? payload.service_docx_url : existingServiceUrl;
    const mergedServiceMappings = payload.service_docx_mappings !== undefined ? payload.service_docx_mappings : existingServiceMappings;
    const mergedTiposServico = payload.tipos_servico !== undefined ? payload.tipos_servico : existingTiposServico;
    const mergedTiposJunta = payload.tipos_junta !== undefined ? payload.tipos_junta : existingTiposJunta;
    const mergedTiposMaterial = payload.tipos_material !== undefined ? payload.tipos_material : existingTiposMaterial;
    const mergedCamposTipoServico = payload.campos_tipo_servico !== undefined ? payload.campos_tipo_servico : existingCamposTipoServico;
    const mergedCamposTipoJunta = payload.campos_tipo_junta !== undefined ? payload.campos_tipo_junta : existingCamposTipoJunta;
    const mergedCamposTipoMaterial = payload.campos_tipo_material !== undefined ? payload.campos_tipo_material : existingCamposTipoMaterial;
    const mergedResponsabilidadesCliente = payload.responsabilidades_cliente !== undefined ? payload.responsabilidades_cliente : existingResponsabilidadesCliente;
    const mergedResponsabilidadesOrbital = payload.responsabilidades_orbital !== undefined ? payload.responsabilidades_orbital : existingResponsabilidadesOrbital;

    const productFieldsObj = {
      fields: mergedFields,
      docx_mappings: mergedDocx,
      slide_mappings: mergedSlide,
      service_docx_url: mergedServiceUrl,
      service_docx_mappings: mergedServiceMappings,
      tipos_servico: mergedTiposServico,
      tipos_junta: mergedTiposJunta,
      tipos_material: mergedTiposMaterial,
      campos_tipo_servico: mergedCamposTipoServico,
      campos_tipo_junta: mergedCamposTipoJunta,
      campos_tipo_material: mergedCamposTipoMaterial,
      responsabilidades_cliente: mergedResponsabilidadesCliente,
      responsabilidades_orbital: mergedResponsabilidadesOrbital
    };

    const dbPayload = { ...payload };
    dbPayload.product_fields = productFieldsObj;
    delete dbPayload.docx_mappings;
    delete dbPayload.slide_mappings;
    delete dbPayload.service_docx_url;
    delete dbPayload.service_docx_mappings;
    delete dbPayload.tipos_servico;
    delete dbPayload.tipos_junta;
    delete dbPayload.tipos_material;
    delete dbPayload.campos_tipo_servico;
    delete dbPayload.campos_tipo_junta;
    delete dbPayload.campos_tipo_material;
    delete dbPayload.responsabilidades_cliente;
    delete dbPayload.responsabilidades_orbital;

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
    let finalServiceUrl = null;
    let finalServiceMappings = {};
    let finalTiposServico = [];
    let finalTiposJunta = [];
    let finalTiposMaterial = [];
    let finalCamposTipoServico = [];
    let finalCamposTipoJunta = [];
    let finalCamposTipoMaterial = [];
    let finalResponsabilidadesCliente: ResponsabilidadeDef[] = [];
    let finalResponsabilidadesOrbital: ResponsabilidadeDef[] = [];
    
    if (final.product_fields && !Array.isArray(final.product_fields) && typeof final.product_fields === 'object') {
      const obj = final.product_fields as any;
      finalFields = Array.isArray(obj.fields) ? obj.fields : defaultFields;
      finalDocx = obj.docx_mappings || {};
      finalSlide = obj.slide_mappings || {};
      finalServiceUrl = obj.service_docx_url || null;
      finalServiceMappings = obj.service_docx_mappings || {};
      finalTiposServico = obj.tipos_servico || [];
      finalTiposJunta = obj.tipos_junta || [];
      finalTiposMaterial = obj.tipos_material || [];
      finalCamposTipoServico = obj.campos_tipo_servico || [];
      finalCamposTipoJunta = obj.campos_tipo_junta || [];
      finalCamposTipoMaterial = obj.campos_tipo_material || [];
      finalResponsabilidadesCliente = obj.responsabilidades_cliente || [];
      finalResponsabilidadesOrbital = obj.responsabilidades_orbital || [];
    }
    
    final.product_fields = mergeFieldsWithDefaults(finalFields);
    final.docx_mappings = finalDocx;
    final.slide_mappings = finalSlide;
    final.service_docx_url = finalServiceUrl;
    final.service_docx_mappings = finalServiceMappings;
    final.tipos_servico = normalizeTypesList(finalTiposServico);
    final.tipos_junta = normalizeTypesList(finalTiposJunta);
    final.tipos_material = normalizeTypesList(finalTiposMaterial);
    final.campos_tipo_servico = finalCamposTipoServico;
    final.campos_tipo_junta = finalCamposTipoJunta;
    final.campos_tipo_material = finalCamposTipoMaterial;
    final.responsabilidades_cliente = finalResponsabilidadesCliente;
    final.responsabilidades_orbital = finalResponsabilidadesOrbital;
    return final;
  } catch (err) {
    console.error("saveUserSettings unexpected error:", err);
    const local = writeLocalSettings(payload);
    return local;
  }
}