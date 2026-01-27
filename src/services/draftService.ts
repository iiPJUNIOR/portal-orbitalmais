import { v4 as uuidv4 } from "uuid";
import { saveQuote } from "@/services/supabaseService";

const DRAFTS_STORAGE_KEY = "local_drafts_v1";

export type DraftRecord = {
  id: string;
  data: any; // full wizard form state
  step?: number;
  created_at: string;
  updated_at?: string;
};

function readAll(): DraftRecord[] {
  try {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as DraftRecord[];
  } catch {
    return [];
  }
}

function writeAll(arr: DraftRecord[]) {
  try {
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(arr.slice(0, 200)));
  } catch (err) {
    console.warn("draftService: writeAll failed", err);
  }
}

export async function saveDraft(payload: { data: any; step?: number }): Promise<string> {
  const id = uuidv4();
  const now = new Date().toISOString();
  const rec: DraftRecord = {
    id,
    data: payload.data,
    step: payload.step ?? 1,
    created_at: now,
    updated_at: now,
  };

  const arr = readAll();
  arr.unshift(rec);
  writeAll(arr);
  return id;
}

export function updateDraft(id: string, next: { data?: any; step?: number }) {
  const arr = readAll();
  const idx = arr.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  if (next.data !== undefined) arr[idx].data = next.data;
  if (next.step !== undefined) arr[idx].step = next.step;
  arr[idx].updated_at = new Date().toISOString();
  writeAll(arr);
  return true;
}

export function deleteDraft(id: string) {
  const arr = readAll().filter((r) => r.id !== id);
  writeAll(arr);
}

export function getDrafts(): DraftRecord[] {
  return readAll();
}

/**
 * Attempt to sync all local drafts to Supabase by calling saveQuote().
 * On success the local draft is removed.
 * Returns a report with synced and failed ids.
 */
export async function syncLocalDrafts(): Promise<{ synced: string[]; failed: Array<{ id: string; error: any }> }> {
  const arr = readAll();
  const synced: string[] = [];
  const failed: Array<{ id: string; error: any }> = [];

  for (const d of arr) {
    try {
      // Expecting d.data to contain the same structure used by saveQuote / proposal flows.
      // saveQuote expects: quote object and items array
      const quotePayload: any = {
        cnpj: d.data.cnpj,
        companyName: d.data.companyName,
        contactName: d.data.contactName,
        email: d.data.email,
        phone: d.data.phone,
        address: d.data.address,
        proposalDate: d.data.date || d.data.proposalDate || new Date().toISOString(),
        proposalNumber: d.data.proposalNumber || undefined,
        priceModel: d.data.priceModel || d.data.price_model || "12m",
        totalPrice: d.data.totalPrice ?? 0,
        status: "rascunho",
        observations: d.data.observations || "",
        settings: d.data,
      };

      const items = (d.data.selectedProducts || d.data.items || []).map((it: any) => ({
        sku: it.sku || it.part_number || it.product?.part_number || it.product?.sku || "",
        productDescription: it.name || it.product?.description || it.productDescription || "",
        quantity: it.quantity || it.qty || 1,
        unitPrice: it.unitPrice || it.price || 0,
        priceModel: it.priceModel || quotePayload.priceModel,
      }));

      const savedId = await saveQuote(quotePayload, items);
      // If saveQuote returns a different id (Supabase id), consider synced and remove local draft
      if (savedId) {
        deleteDraft(d.id);
        synced.push(savedId);
      } else {
        // keep it; mark failed
        failed.push({ id: d.id, error: "No id returned" });
      }
    } catch (err) {
      failed.push({ id: d.id, error: err });
    }
  }

  return { synced, failed };
}

/**
 * Sync a single draft (used by the UI)
 */
export async function syncSingleDraft(id: string): Promise<{ success: boolean; savedId?: string; error?: any }> {
  const arr = readAll();
  const d = arr.find((r) => r.id === id);
  if (!d) return { success: false, error: "not found" };
  try {
    const quotePayload: any = {
      cnpj: d.data.cnpj,
      companyName: d.data.companyName,
      contactName: d.data.contactName,
      email: d.data.email,
      phone: d.data.phone,
      address: d.data.address,
      proposalDate: d.data.date || d.data.proposalDate || new Date().toISOString(),
      proposalNumber: d.data.proposalNumber || undefined,
      priceModel: d.data.priceModel || d.data.price_model || "12m",
      totalPrice: d.data.totalPrice ?? 0,
      status: "rascunho",
      observations: d.data.observations || "",
      settings: d.data,
    };

    const items = (d.data.selectedProducts || d.data.items || []).map((it: any) => ({
      sku: it.sku || it.part_number || it.product?.part_number || it.product?.sku || "",
      productDescription: it.name || it.product?.description || it.productDescription || "",
      quantity: it.quantity || it.qty || 1,
      unitPrice: it.unitPrice || it.price || 0,
      priceModel: it.priceModel || quotePayload.priceModel,
    }));

    const savedId = await saveQuote(quotePayload, items);
    if (savedId) {
      deleteDraft(d.id);
      return { success: true, savedId };
    }
    return { success: false, error: "no id returned" };
  } catch (err) {
    return { success: false, error: err };
  }
}