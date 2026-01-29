import { supabase } from "@/integrations/supabase/client";

export type StoredBase = {
  id?: string;
  user_id?: string | null;
  name: string;
  type: "catalog" | "product";
  headers: string[];
  rows: any[][];
  key_column?: string | null;
  com_ids_column?: string | null;
  sem_ids_column?: string | null;
  name_column?: string | null;
  description_column?: string | null;
  info_column?: string | null;
  extra_columns?: string[]; // Lista de nomes de colunas adicionais
  created_at?: string;
};

const PAULO_EMAIL = "paulo.sergio@controlid.com.br";

async function isSuperAdmin(): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.email === PAULO_EMAIL;
  } catch {
    return false;
  }
}

async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch (err) {
    console.warn("getCurrentUserId failed", err);
    return null;
  }
}

export async function fetchBases(): Promise<StoredBase[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const isAdmin = await isSuperAdmin();

  let query = supabase
    .from("product_bases")
    .select("*")
    .order("created_at", { ascending: false });

  // If not admin, only show own bases
  if (!isAdmin) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data || []) as StoredBase[];
}

export async function saveBase(base: StoredBase): Promise<StoredBase> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Usuário não autenticado.");

  const isAdmin = await isSuperAdmin();
  
  // Prepare payload. Keep existing user_id if editing as admin, otherwise use current user.
  const payload = { 
    ...base, 
    user_id: (isAdmin && base.user_id) ? base.user_id : userId 
  };

  if (base.id) {
    let query = supabase
      .from("product_bases")
      .update(payload)
      .eq("id", base.id);
    
    // Non-admins can only update their own
    if (!isAdmin) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query.select().single();
    if (error) throw error;
    window.dispatchEvent(new Event("product_bases_changed"));
    return data as StoredBase;
  } else {
    const { data, error } = await supabase
      .from("product_bases")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    window.dispatchEvent(new Event("product_bases_changed"));
    return data as StoredBase;
  }
}

export async function deleteBase(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Usuário não autenticado.");
  
  const isAdmin = await isSuperAdmin();
  
  let query = supabase.from("product_bases").delete().eq("id", id);
  
  // Non-admins can only delete their own
  if (!isAdmin) {
    query = query.eq("user_id", userId);
  }

  const { error } = await query;
  if (error) throw error;
  window.dispatchEvent(new Event("product_bases_changed"));
}