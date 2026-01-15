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
 * Fetch all bases for the current authenticated user.
 */
export async function fetchBases(): Promise<StoredBase[]> {
  const { data, error } = await supabase
    .from("product_bases")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("productBaseService.fetchBases error", error);
    throw error;
  }

  return (data || []) as StoredBase[];
}

/**
 * Save a base. If base.id exists, perform update; otherwise insert.
 * Returns the saved row.
 */
export async function saveBase(base: StoredBase): Promise<StoredBase> {
  // try to get current user id (optional)
  let userId: string | undefined;
  try {
    // supabase.auth.getUser is async and returns { data: { user } }
    // @ts-ignore
    const userResp = await supabase.auth.getUser?.();
    userId = userResp?.data?.user?.id;
  } catch {
    // ignore
  }

  const payload = {
    ...base,
    user_id: base.user_id ?? userId ?? null,
  };

  if (base.id) {
    const { data, error } = await supabase
      .from("product_bases")
      .update(payload)
      .eq("id", base.id)
      .select()
      .single();

    if (error) {
      console.error("productBaseService.update error", error);
      throw error;
    }

    // notify listeners in the client
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
 * Delete a base by id.
 */
export async function deleteBase(id: string): Promise<void> {
  const { error } = await supabase.from("product_bases").delete().eq("id", id);

  if (error) {
    console.error("productBaseService.delete error", error);
    throw error;
  }

  try {
    window.dispatchEvent(new Event("product_bases_changed"));
  } catch {}
}