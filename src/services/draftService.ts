import { v4 as uuidv4 } from "uuid";
import { saveQuote } from "@/services/supabaseService";
import { toast } from "sonner";

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

  // Immediately attempt to sync this draft to the server.
  // If sync succeeds (we receive a remote id different from the local id),
  // remove the local draft and inform the user. Otherwise keep local fallback.
  (async () => {
    try {
      // Build payload for saveQuote (same mapping used elsewhere in the app)
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

      // Attempt remote save
      const savedId = await saveQuote(quotePayload, items);

      // If saveQuote returned a different id (remote), consider it synced
      if (savedId && savedId !== id) {
        // remove the local draft entry
        try {
          const current = readAll().filter((r) => r.id !== id);
          writeAll(current);
        } catch (cleanupErr) {
          console.warn("draftService: failed to remove local draft after sync", cleanupErr);
        }
        toast.success("Rascunho sincronizado automaticamente com o servidor.");
      } else {
        // Not synced (likely unauthenticated or server error); leave local copy
        toast.info("Rascunho salvo localmente; será sincronizado automaticamente ao conectar.");
      }
    } catch (err) {
      console.warn("draftService: auto-sync failed", err);
      toast.error("Não foi possível sincronizar o rascunho agora; ele foi salvo localmente.");
    }
  })();

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

  // After updating a draft locally, attempt to sync update immediately as well.
  // This keeps local+server in sync without extra user actions.
  (async () => {
    try {
      const d = arr[idx];
      if (!d) return;

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

      // If saved remotely, remove the local draft
      if (savedId && savedId !== id) {
        try {
          const current = readAll().filter((r) => r.id !== id);
          writeAll(current);
          toast.success("Atualização do rascunho sincronizada com o servidor.");
        } catch (cleanupErr) {
          console.warn("draftService: failed to remove local draft after update-sync", cleanupErr);
        }
      } else {
        // keep local fallback
      }
    } catch (err) {
      console.warn("draftService: auto-sync update failed", err);
    }
  })();

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
        synced.push(savedId);
      } else {
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