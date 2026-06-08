import { v4 as uuidv4 } from "uuid";
import { saveQuote } from "@/services/supabaseService";

const DRAFTS_STORAGE_KEY = "local_drafts_v1";

export type DraftRecord = {
  id: string;
  data: any; // full wizard form state
  step?: number;
  created_at: string;
  updated_at?: string;
  // New fields to track server sync state
  remote_id?: string;
  synced?: boolean;
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
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("local_drafts_changed"));
    }
  } catch (err) {
    console.warn("draftService: writeAll failed", err);
  }
}

function updateLocalDraftRecord(localId: string, patch: Partial<DraftRecord>) {
  try {
    const arr = readAll();
    const idx = arr.findIndex((r) => r.id === localId);
    if (idx === -1) return false;
    arr[idx] = { ...arr[idx], ...patch, updated_at: new Date().toISOString() };
    writeAll(arr);
    return true;
  } catch (err) {
    console.warn("draftService: updateLocalDraftRecord failed", err);
    return false;
  }
}

/**
 * Save a draft locally and immediately attempt to sync with server.
 * The local draft is ALWAYS kept for visibility. If server save succeeds
 * we mark the draft as synced and record the remote_id.
 */
export async function saveDraft(payload: { data: any; step?: number }): Promise<{ id: string; synced: boolean }> {
  const id = uuidv4();
  const now = new Date().toISOString();
  const rec: DraftRecord = {
    id,
    data: payload.data,
    step: payload.step ?? 1,
    created_at: now,
    updated_at: now,
    remote_id: undefined,
    synced: false,
  };

  const arr = readAll();
  arr.unshift(rec);
  writeAll(arr);

  let synced = false;
  try {
    const d = rec.data || {};
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
      settings: d,
    };

    const items = (d.selectedProducts || d.items || []).map((it: any) => ({
      sku: it.sku || it.part_number || it.product?.part_number || it.product?.sku || "",
      productDescription: it.name || it.product?.description || it.productDescription || "",
      quantity: it.quantity || it.qty || 1,
      unitPrice: it.unitPrice || it.price || 0,
      priceModel: it.priceModel || quotePayload.priceModel,
    }));

    const { id: savedId, isRemote } = await saveQuote(quotePayload, items);

    if (isRemote && savedId) {
      updateLocalDraftRecord(id, { remote_id: savedId, synced: true });
      synced = true;
    } else {
      updateLocalDraftRecord(id, { synced: false, remote_id: undefined });
    }
  } catch (err) {
    console.warn("draftService: sync failed", err);
    updateLocalDraftRecord(id, { synced: false, remote_id: undefined });
  }

  return { id, synced };
}

/**
 * Update a local draft and attempt to sync the update immediately.
 * The local draft remains visible; when the server acknowledges, we mark it synced and store remote_id.
 */
export async function updateDraft(
  id: string,
  next: { data?: any; step?: number }
): Promise<{ success: boolean; synced: boolean }> {
  const arr = readAll();
  const idx = arr.findIndex((r) => r.id === id);
  if (idx === -1) return { success: false, synced: false };
  if (next.data !== undefined) arr[idx].data = next.data;
  if (next.step !== undefined) arr[idx].step = next.step;
  arr[idx].updated_at = new Date().toISOString();
  arr[idx].synced = false;
  arr[idx].remote_id = arr[idx].remote_id ?? undefined;
  writeAll(arr);

  let synced = false;
  try {
    const d = arr[idx];
    if (d) {
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

      const { id: savedId, isRemote } = await saveQuote(quotePayload, items);

      if (isRemote && savedId) {
        updateLocalDraftRecord(id, { remote_id: savedId, synced: true });
        synced = true;
      } else {
        updateLocalDraftRecord(id, { synced: false });
      }
    }
  } catch (err) {
    console.warn("draftService: sync update failed", err);
    updateLocalDraftRecord(id, { synced: false });
  }

  return { success: true, synced };
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
 * On success mark the draft as synced (and store remote id).
 * Returns a report with synced and failed ids.
 */
export async function syncLocalDrafts(): Promise<{ synced: string[]; failed: Array<{ id: string; error: any }> }> {
  const arr = readAll();
  const synced: string[] = [];
  const failed: Array<{ id: string; error: any }> = [];

  for (const d of arr) {
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

      const { id: savedId, isRemote } = await saveQuote(quotePayload, items);
      if (isRemote && savedId) {
        updateLocalDraftRecord(d.id, { remote_id: savedId, synced: true });
        synced.push(savedId);
      } else {
        failed.push({ id: d.id, error: "No remote id returned" });
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

    const { id: savedId, isRemote } = await saveQuote(quotePayload, items);
    if (isRemote && savedId) {
      updateLocalDraftRecord(d.id, { remote_id: savedId, synced: true });
      return { success: true, savedId };
    }
    return { success: false, error: "no remote id returned" };
  } catch (err) {
    return { success: false, error: err };
  }
}