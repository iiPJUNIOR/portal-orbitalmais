import { supabase } from "@/integrations/supabase/client";

/**
 * Sync local optimistic quotes stored in localStorage to Supabase.
 * - Reads LOCAL_STORAGE_KEY entries (same format used by saveQuote).
 * - For each local entry, attempts to insert into Supabase (quotes + quote_items).
 * - On success, removes the local entry so it's no longer shown as a duplicate.
 *
 * This function is idempotent w.r.t local entries (it removes only entries that are successfully uploaded).
 */

const LOCAL_STORAGE_KEY = "local_quotes_v1";

type LocalStored = {
  id: string;
  quote: any;
  items: any[];
  created_at: string;
};

export async function syncLocalQuotes(): Promise<{ synced: number; errors: number }> {
  const result = { synced: 0, errors: 0 };

  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(LOCAL_STORAGE_KEY) : null;
    if (!raw) return result;

    let entries: LocalStored[] = [];
    try {
      entries = JSON.parse(raw) as LocalStored[];
      if (!Array.isArray(entries) || entries.length === 0) return result;
    } catch (err) {
      console.warn("localSync: failed to parse local quotes", err);
      return result;
    }

    // Ensure user is authenticated and get user id
    const { data: userResp } = await supabase.auth.getUser();
    const userId = userResp?.user?.id;
    if (!userId) {
      // nothing to do if not authenticated
      return result;
    }

    // Iterate entries from oldest to newest so earliest drafts are uploaded first
    for (const entry of [...entries].reverse()) {
      try {
        // Build payload similar to saveQuote
        const q = entry.quote || {};
        const payload: any = {
          cnpj: q.cnpj || "",
          company_name: q.companyName || q.company_name || "",
          contact_name: q.contactName || q.contact_name || "",
          email: q.email || "",
          phone: q.phone || "",
          address: q.address || "",
          proposal_date: q.proposalDate || q.proposal_date || entry.created_at,
          proposal_number: q.proposalNumber || q.proposal_number || "",
          price_model: q.priceModel || q.price_model || "12m",
          total_price: q.totalPrice || q.total_price || 0,
          status: q.status || "rascunho",
          observations: q.observations || "",
          settings: q.settings || q,
          user_id: userId,
        };

        // Insert quote
        const { data: quoteInsertData, error: quoteInsertError } = await supabase
          .from("quotes")
          .insert(payload)
          .select()
          .single();

        if (quoteInsertError) {
          console.warn("localSync: failed to insert quote", quoteInsertError);
          result.errors++;
          continue;
        }

        const quoteId = quoteInsertData.id as string;

        // Insert items (if any)
        const itemsToInsert = (entry.items || []).map((it: any) => ({
          quote_id: quoteId,
          sku: it.sku || it.productDescription || (it.product && it.product.part_number) || "",
          product_description: it.productDescription || (it.product && it.product.description) || "",
          quantity: it.quantity || 1,
          unit_price: it.unitPrice || 0,
          price_model: it.price_model || it.priceModel || payload.price_model,
          subtotal: (it.unitPrice || 0) * (it.quantity || 0),
        }));

        if (itemsToInsert.length > 0) {
          const { error: itemsError } = await supabase.from("quote_items").insert(itemsToInsert);
          if (itemsError) {
            console.warn("localSync: items insert failed (quote created):", itemsError);
            // do not treat this as failure to sync quote itself
          }
        }

        // Remove synced local entry
        try {
          const currentRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
          const arr: LocalStored[] = currentRaw ? JSON.parse(currentRaw) : [];
          const filtered = arr.filter((e) => e.id !== entry.id);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered.slice(0, 200)));
        } catch (cleanupErr) {
          console.warn("localSync: failed to remove local entry after sync", cleanupErr);
        }

        result.synced++;
      } catch (err) {
        console.error("localSync: unexpected error syncing entry", err);
        result.errors++;
        continue;
      }
    }
  } catch (err) {
    console.error("localSync: overall failure", err);
  }

  return result;
}