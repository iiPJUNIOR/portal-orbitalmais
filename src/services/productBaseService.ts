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
  created_at?: string;
};

async function getCurrentUserId(): Promise<string | null> {
  try {
    // @ts-ignore
    const resp = await supabase.auth.getUser?.();
    const userId = resp?.data?.user?.id;
    return userId ?? null;
  } catch (err) {
    console.warn("getCurrentUserId failed", err);
    return null;
  }
}

export async function fetchBases(): Promise<StoredBase[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("product_bases")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as StoredBase[];
}

export async function saveBase(base: StoredBase): Promise<StoredBase> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Usuário não autenticado.");

  const payload = { ...base, user_id: userId };

  if (base.id) {
    const { data, error } = await supabase
      .from("product_bases")
      .update(payload)
      .eq("id", base.id)
      .eq("user_id", userId)
      .select()
      .single();
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
  const { error } = await supabase.from("product_bases").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
  window.dispatchEvent(new Event("product_bases_changed"));
}