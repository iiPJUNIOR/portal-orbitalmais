import { supabase } from "@/integrations/supabase/client";
import { saveQuote } from "@/services/supabaseService";
import { v4 as uuidv4 } from "uuid";

export type DraftRecord = {
  id: string;
  data: any; // full wizard form state
  step?: number;
  created_at: string;
  updated_at?: string;
  remote_id?: string;
  synced?: boolean;
};

/**
  * Save a draft directly to the Supabase database with status "rascunho".
  */
export async function saveDraft(payload: { data: any; step?: number }): Promise<{ id: string; synced: boolean }> {
  try {
    const d = payload.data || {};
    const quotePayload: any = {
      cnpj: d.cnpj,
      companyName: d.companyName,
      contactName: d.contactName,
      email: d.email,
      phone: d.phone,
      address: d.address,
      proposalDate: d.date || d.proposalDate || new Date().toISOString(),
      proposalNumber: d.proposalNumber || undefined,
      priceModel: d.priceModel || d.price_model || "12m",
      totalPrice: d.totalPrice ?? 0,
      status: "rascunho",
      observations: d.observations || "",
      settings: { ...d, step: payload.step ?? 1 },
    };

    const items = (d.selectedProducts || d.items || []).map((it: any) => ({
      sku: it.sku || it.part_number || it.product?.part_number || it.product?.sku || "",
      productDescription: it.name || it.product?.description || it.productDescription || "",
      quantity: it.quantity || it.qty || 1,
      unitPrice: it.unitPrice || it.price || 0,
      priceModel: it.priceModel || quotePayload.priceModel,
    }));

    const { id: savedId, isRemote } = await saveQuote(quotePayload, items);

    return { id: savedId, synced: isRemote };
  } catch (err) {
    console.error("draftService: saveDraft failed", err);
    return { id: uuidv4(), synced: false };
  }
}

/**
  * Update a draft directly on the Supabase database.
  */
export async function updateDraft(
  id: string,
  next: { data?: any; step?: number }
): Promise<{ success: boolean; synced: boolean }> {
  try {
    // 1) Fetch current quote to get existing settings
    const { data: currentQuote, error: getError } = await supabase
      .from("quotes")
      .select("settings")
      .eq("id", id)
      .single();

    if (getError) throw getError;

    const currentSettings = currentQuote?.settings || {};
    const updatedSettings = {
      ...currentSettings,
      ...(next.data || {}),
      step: next.step !== undefined ? next.step : (currentSettings.step ?? 1),
    };

    const d = updatedSettings;

    // 2) Update quotes table
    const { error: updateError } = await supabase
      .from("quotes")
      .update({
        cnpj: d.cnpj,
        company_name: d.companyName,
        contact_name: d.contactName,
        email: d.email,
        phone: d.phone,
        address: d.address,
        proposal_date: d.date || d.proposalDate || new Date().toISOString(),
        proposal_number: d.proposalNumber || undefined,
        price_model: d.priceModel || d.price_model || "12m",
        total_price: d.totalPrice ?? 0,
        status: "rascunho",
        observations: d.observations || "",
        settings: d,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) throw updateError;

    // 3) Update quote items
    const items = (d.selectedProducts || d.items || []).map((it: any) => ({
      quote_id: id,
      sku: it.sku || it.part_number || it.product?.part_number || it.product?.sku || "",
      product_description: it.name || it.product?.description || it.productDescription || "",
      quantity: it.quantity || it.qty || 1,
      unit_price: it.unitPrice || it.price || 0,
      price_model: it.priceModel || d.priceModel || "12m",
      subtotal: (it.unitPrice || it.price || 0) * (it.quantity || it.qty || 1),
    }));

    // Delete old items
    await supabase.from("quote_items").delete().eq("quote_id", id);

    // Insert new items
    if (items.length > 0) {
      const { error: itemsError } = await supabase.from("quote_items").insert(items);
      if (itemsError) throw itemsError;
    }

    return { success: true, synced: true };
  } catch (err) {
    console.warn("draftService: updateDraft failed", err);
    return { success: false, synced: false };
  }
}

/**
  * Delete a draft directly from the Supabase database.
  */
export async function deleteDraft(id: string): Promise<void> {
  const { error } = await supabase.from("quotes").delete().eq("id", id);
  if (error) throw error;
}

/**
  * Load all drafts directly from the Supabase database (quotes with status = "rascunho").
  */
export async function getDrafts(): Promise<DraftRecord[]> {
  try {
    const { data, error } = await supabase
      .from("quotes")
      .select("*")
      .eq("status", "rascunho")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return (data || []).map((q) => ({
      id: q.id,
      data: q.settings || {},
      step: q.settings?.step ?? 1,
      created_at: q.created_at,
      updated_at: q.updated_at,
      remote_id: q.id,
      synced: true,
    }));
  } catch (err) {
    console.error("draftService: getDrafts failed", err);
    return [];
  }
}

/**
  * Legacy/No-op sync helper. Since drafts are always remote now, this returns immediately.
  */
export async function syncLocalDrafts(): Promise<{ synced: string[]; failed: Array<{ id: string; error: any }> }> {
  return { synced: [], failed: [] };
}

/**
  * Legacy/No-op sync helper. Since drafts are always remote now, this returns immediately.
  */
export async function syncSingleDraft(id: string): Promise<{ success: boolean; savedId?: string; error?: any }> {
  return { success: true, savedId: id };
}