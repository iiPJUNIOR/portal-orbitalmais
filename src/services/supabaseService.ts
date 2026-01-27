import { supabase } from "@/integrations/supabase/client";
import { v4 as uuidv4 } from "uuid";
import type { Quote as QuoteType, QuoteItem as QuoteItemType } from "@/types/quote";

const LOCAL_STORAGE_KEY = "local_quotes_v1";

type LocalStored = {
  id: string;
  quote: any;
  items: any[];
  created_at: string;
};

/**
 * Save a quote. Try Supabase first, if it fails (e.g. unauthenticated / RLS),
 * fall back to saving into localStorage so the user still has a history locally.
 */
export const saveQuote = async (
  quote: Omit<QuoteType, "id" | "createdAt" | "updatedAt"> & { settings?: any },
  items: any[]
): Promise<string> => {
  try {
    // 1) Preparar payload do orçamento
    const insertPayload: any = {
      cnpj: quote.cnpj,
      company_name: quote.companyName,
      contact_name: quote.contactName,
      email: quote.email,
      phone: quote.phone,
      address: quote.address,
      proposal_date: quote.proposalDate,
      proposal_number: quote.proposalNumber,
      price_model: quote.priceModel,
      total_price: quote.totalPrice,
      status: quote.status ?? "rascunho",
      observations: quote.observations ?? "",
      settings: quote.settings || {}, // Salva o estado completo do wizard para regeneração
    };

    // Tenta obter o ID do usuário logado
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user?.id) {
      insertPayload.user_id = userData.user.id;
    }

    const { data: quoteInsertData, error: quoteInsertError } = await supabase
      .from("quotes")
      .insert(insertPayload)
      .select()
      .single();

    if (quoteInsertError) throw quoteInsertError;

    const quoteId = quoteInsertData.id as string;

    // 2) Inserir itens do orçamento
    const itemsToInsert = items.map((it) => ({
      quote_id: quoteId,
      sku: it.sku || it.productDescription,
      product_description: it.productDescription,
      quantity: it.quantity,
      unit_price: it.unitPrice || 0,
      price_model: it.price_model || it.priceModel || quote.priceModel,
      subtotal: (it.unitPrice || 0) * it.quantity,
    }));

    const { error: itemsError } = await supabase.from("quote_items").insert(itemsToInsert);
    if (itemsError) {
      console.warn("Aviso: Orçamento salvo, mas houve erro ao inserir itens", itemsError);
    }

    return quoteId;
  } catch (err: any) {
    console.warn("saveQuote supabase failed, falling back to localStorage", err?.message || err);

    // Fallback local: save into localStorage so user still has history
    const localId = uuidv4();
    const payload = {
      ...quote,
      // normalize some keys to be similar to DB fields
      proposalNumber: quote.proposalNumber,
      proposalDate: quote.proposalDate,
      priceModel: quote.priceModel,
      totalPrice: quote.totalPrice,
      settings: quote.settings || {},
    };

    const localEntry: LocalStored = {
      id: localId,
      quote: payload,
      items: items,
      created_at: new Date().toISOString(),
    };

    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) as LocalStored[] : [];
      arr.unshift(localEntry);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(arr.slice(0, 200))); // limit to 200 entries
      console.info("Quote saved locally under id", localId);
      return localId;
    } catch (storageErr) {
      console.error("Failed to save local quote fallback", storageErr);
      throw err; // rethrow original error if fallback also fails
    }
  }
};

export const getQuotesByCnpj = async (cnpj: string): Promise<QuoteType[]> => {
  try {
    const clean = cnpj.replace(/\D/g, "");
    const { data, error } = await supabase
      .from("quotes")
      .select("*")
      .ilike("cnpj", `%${clean}%`)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const supabaseQuotes = (data || []).map((q) => ({
      id: q.id,
      cnpj: q.cnpj,
      companyName: q.company_name,
      contactName: q.contact_name,
      email: q.email,
      phone: q.phone,
      address: q.address,
      proposalDate: q.proposal_date,
      proposalNumber: q.proposal_number,
      priceModel: q.price_model,
      totalPrice: q.total_price,
      status: q.status,
      observations: q.observations,
      createdAt: q.created_at,
      updatedAt: q.updated_at,
      pptxUrl: q.pptx_url,
      settings: q.settings,
    })) as QuoteType[];

    // Merge with localStorage fallback entries that match the CNPJ substring
    const localRaw = typeof window !== "undefined" ? localStorage.getItem(LOCAL_STORAGE_KEY) : null;
    const localArr: LocalStored[] = localRaw ? JSON.parse(localRaw) : [];
    const matchedLocal = (localArr || [])
      .filter((l) => {
        const qcnpj = String(l.quote.cnpj || "").replace(/\D/g, "");
        return qcnpj.includes(clean) || clean.includes(qcnpj) || (!clean && true);
      })
      .map((l) => ({
        id: l.id,
        cnpj: l.quote.cnpj || "",
        companyName: l.quote.companyName || l.quote.company_name || "",
        contactName: l.quote.contactName || l.quote.contact_name || "",
        email: l.quote.email || "",
        phone: l.quote.phone || "",
        address: l.quote.address || "",
        proposalDate: l.quote.proposalDate || l.created_at,
        proposalNumber: l.quote.proposalNumber || "",
        priceModel: l.quote.priceModel || "12m",
        totalPrice: l.quote.totalPrice || 0,
        status: l.quote.status || "rascunho",
        observations: l.quote.observations || "",
        createdAt: l.created_at,
        updatedAt: l.created_at,
        pptxUrl: undefined,
        settings: l.quote.settings || l.quote,
      })) as QuoteType[];

    // Combine: supabase first, then local entries (dedupe by id)
    const combinedMap = new Map<string, QuoteType>();
    for (const q of [...supabaseQuotes, ...matchedLocal]) {
      combinedMap.set(q.id, q);
    }
    return Array.from(combinedMap.values()).sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return tb - ta;
    });
  } catch (err) {
    console.error("Erro ao buscar orçamentos por CNPJ (supabase), falling back to localStorage:", err);
    // Fallback: return local entries
    const localRaw = typeof window !== "undefined" ? localStorage.getItem(LOCAL_STORAGE_KEY) : null;
    const localArr: LocalStored[] = localRaw ? JSON.parse(localRaw) : [];
    const clean = cnpj.replace(/\D/g, "");
    const matchedLocal = (localArr || [])
      .filter((l) => {
        const qcnpj = String(l.quote.cnpj || "").replace(/\D/g, "");
        return qcnpj.includes(clean) || clean.includes(qcnpj) || (!clean && true);
      })
      .map((l) => ({
        id: l.id,
        cnpj: l.quote.cnpj || "",
        companyName: l.quote.companyName || l.quote.company_name || "",
        contactName: l.quote.contactName || l.quote.contact_name || "",
        email: l.quote.email || "",
        phone: l.quote.phone || "",
        address: l.quote.address || "",
        proposalDate: l.quote.proposalDate || l.created_at,
        proposalNumber: l.quote.proposalNumber || "",
        priceModel: l.quote.priceModel || "12m",
        totalPrice: l.quote.totalPrice || 0,
        status: l.quote.status || "rascunho",
        observations: l.quote.observations || "",
        createdAt: l.created_at,
        updatedAt: l.created_at,
        pptxUrl: undefined,
        settings: l.quote.settings || l.quote,
      })) as QuoteType[];

    return matchedLocal;
  }
};

export const getQuoteItems = async (quoteId: string): Promise<QuoteItemType[]> => {
  try {
    const { data, error } = await supabase
      .from("quote_items")
      .select("*")
      .eq("quote_id", quoteId);

    if (error) throw error;

    if ((data || []).length > 0) {
      return (data || []).map((it) => ({
        id: it.id,
        quoteId: it.quote_id,
        sku: it.sku,
        productDescription: it.product_description,
        quantity: it.quantity,
        unitPrice: it.unit_price,
        priceModel: it.price_model,
        subtotal: it.subtotal,
      })) as QuoteItemType[];
    }

    // Fallback: try to find in localStorage
    const localRaw = typeof window !== "undefined" ? localStorage.getItem(LOCAL_STORAGE_KEY) : null;
    if (localRaw) {
      const localArr: LocalStored[] = JSON.parse(localRaw);
      const found = localArr.find((l) => l.id === quoteId);
      if (found) {
        return (found.items || []).map((it, idx) => ({
          id: `${quoteId}-local-${idx}`,
          quoteId,
          sku: it.sku || it.productDescription || "",
          productDescription: it.productDescription || (it.product && it.product.description) || "",
          quantity: it.quantity || 1,
          unitPrice: it.unitPrice || 0,
          priceModel: it.priceModel || "12m",
          subtotal: (it.unitPrice || 0) * (it.quantity || 1),
        }));
      }
    }

    return [];
  } catch (err) {
    console.error("Erro ao buscar itens do orçamento (supabase), falling back to localStorage:", err);
    // Fallback to local storage
    const localRaw = typeof window !== "undefined" ? localStorage.getItem(LOCAL_STORAGE_KEY) : null;
    if (localRaw) {
      const localArr: LocalStored[] = JSON.parse(localRaw);
      const found = localArr.find((l) => l.id === quoteId);
      if (found) {
        return (found.items || []).map((it, idx) => ({
          id: `${quoteId}-local-${idx}`,
          quoteId,
          sku: it.sku || it.productDescription || "",
          productDescription: it.productDescription || (it.product && it.product.description) || "",
          quantity: it.quantity || 1,
          unitPrice: it.unitPrice || 0,
          priceModel: it.priceModel || "12m",
          subtotal: (it.unitPrice || 0) * (it.quantity || 1),
        }));
      }
    }

    return [];
  }
};

export const updateQuoteStatus = async (quoteId: string, status: QuoteType["status"]): Promise<void> => {
  try {
    const { error } = await supabase.from("quotes").update({ status }).eq("id", quoteId);
    if (error) throw error;
  } catch (err) {
    console.error("Erro ao atualizar status do orçamento:", err);
    // If it's a local entry, update localStorage
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) throw err;
      const arr: LocalStored[] = JSON.parse(raw);
      const i = arr.findIndex((l) => l.id === quoteId);
      if (i > -1) {
        arr[i].quote.status = status;
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(arr));
        return;
      }
    } catch (e) {
      console.warn("updateQuoteStatus local fallback failed", e);
    }
    throw err;
  }
};