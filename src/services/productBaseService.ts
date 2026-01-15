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
  created_at?: string;
};

/**
 * Try to get current authenticated user id. Returns string or null.
 */
async function getCurrentUserId(): Promise<string | null> {
  try {
    // supabase.auth.getUser may exist depending on version
    // @ts-ignore
    const resp = await supabase.auth.getUser?.();
    const userId = resp?.data?.user?.id;
    return userId ?? null;
  } catch (err) {
    console.warn("getCurrentUserId failed", err);
    return null;
  }
}

/**
 * Fetch all bases for the current authenticated user.
 * Returns empty array if user not authenticated.
 */
export async function fetchBases(): Promise<StoredBase[]> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.warn("fetchBases: no authenticated user — returning empty list");
    return [];
  }

  const { data, error } = await supabase
    .from("product_bases")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("productBaseService.fetchBases error", error);
    throw error;
  }

  return (data || []) as StoredBase[];
}

/**
 * Save a base. If base.id exists, perform update; otherwise insert.
 * Requires authenticated user — throws an error with friendly message if not authenticated.
 * Returns the saved row.
 */
export async function saveBase(base: StoredBase): Promise<StoredBase> {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error(
      "Usuário não autenticado. Faça login para salvar bases no Supabase."
    );
  }

  const payload = {
    ...base,
    user_id: userId,
  };

  if (base.id) {
    // Update only if the base belongs to the authenticated user
    const { data, error } = await supabase
      .from("product_bases")
      .update(payload)
      .eq("id", base.id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.error("productBaseService.update error", error);
      throw error;
    }

    try {
      window.dispatchEvent(new Event("product_bases_changed"));
    } catch {}

    return data as StoredBase;
  } else {
    const { data, error } = await supabase
      .from("product_bases")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error("productBaseService.insert error", error);
      throw error;
    }

    try {
      window.dispatchEvent(new Event("product_bases_changed"));
    } catch {}

    return data as StoredBase;
  }
}

/**
 * Delete a base by id. Requires authenticated user and ownership.
 */
export async function deleteBase(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("Usuário não autenticado. Faça login para remover bases.");
  }

  const { error } = await supabase
    .from("product_bases")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("productBaseService.delete error", error);
    throw error;
  }

  try {
    window.dispatchEvent(new Event("product_bases_changed"));
  } catch {}
}