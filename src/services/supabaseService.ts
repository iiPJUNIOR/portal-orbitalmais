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
 * Save a quote. Performs an optimistic local save first (so the history is immediately available),
 * then tries to save to Supabase. If Supabase save succeeds, the local optimistic entry is removed.
 * If Supabase save fails (e.g. unauthenticated / RLS), the local entry remains and its id is returned.
 *
 * Returns the saved quote ID (Supabase id when saved remotely, otherwise local fallback id).
 */
export const saveQuote = async (
  quote: Omit<QuoteType, "id" | "createdAt" | "updatedAt"> & { settings?: any },
  items: any[]
): Promise<string> => {
  // Create optimistic local entry first so that UI/history can show it immediately
  const localId = uuidv4();
  const localEntry: LocalStored = {
    id: localId,
    quote: {
      ...quote,
      proposalNumber: quote.proposalNumber,
      proposalDate: quote.proposalDate,
      priceModel: quote.priceModel,
      totalPrice: quote.totalPrice,
      settings: quote.settings || {},
    },
    items,
    created_at: new Date().toISOString(),
  };

  try {
    // Persist optimistic local entry (keep a reasonable limit)
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      const arr = raw ? (JSON.parse(raw) as LocalStored[]) : [];
      // put newest on top
      arr.unshift(localEntry);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(arr.slice(0, 200)));
    } catch (storageErr) {
      console.warn("Failed to write optimistic local quote", storageErr);
    }

    // 1) Prepare payload for Supabase
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
      settings: quote.settings || {}, // save the whole wizard state
    };

    // Try to attach current authenticated user ID (optional)
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user?.id) {
      insertPayload.user_id = userData.user.id;
    }

    const { data: quoteInsertData, error: quoteInsertError } = await supabase
      .from("quotes")
      .insert(insertPayload)
      .select()
      .single();

    if (quoteInsertError) {
      throw quoteInsertError;
    }

    const quoteId = quoteInsertData.id as string;

    // 2) Insert quote items
    const itemsToInsert = items.map((it) => ({
      quote_id: quoteId,
      sku: it.sku || it.productDescription || (it.product && it.product.part_number) || "",
      product_description: it.productDescription || (it.product && it.product.description) || "",
      quantity: it.quantity,
      unit_price: it.unitPrice || 0,
      price_model: it.price_model || it.priceModel || quote.priceModel,
      subtotal: (it.unitPrice || 0) * it.quantity,
    }));

    const { error: itemsError } = await supabase.from("quote_items").insert(itemsToInsert);
    if (itemsError) {
      // Log warning but don't fail the whole flow — quote is already created.
      console.warn("Warning: quote saved but items insert returned error", itemsError);
    }

    // If we reach here, Supabase saved successfully — remove optimistic local entry
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const arr: LocalStored[] = JSON.parse(raw);
        const filtered = arr.filter((e) => e.id !== localId);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered.slice(0, 200)));
      }
    } catch (cleanupErr) {
      console.warn("Failed to remove optimistic local quote after remote save", cleanupErr);
    }

    return quoteId;
  } catch (err: any) {
    console.warn("saveQuote supabase failed, keeping optimistic local entry", err?.message || err);

    // If error happened, we already saved optimistic entry; return its id so UI can reference it.
    return localId;
  }
};

export const getQuotesByCnpj = async (query: string): Promise<QuoteType[]> => {
  try {
    const rawSearch = query.trim();
    // Sanitizar o termo de busca removendo caracteres de controle do PostgREST (como vírgula e parênteses)
    const searchTerm = rawSearch.replace(/[,()]/g, "");
    
    // Build the query to search in both CNPJ and Company Name
    let builder = supabase
      .from("quotes")
      .select("*");

    if (searchTerm) {
      // Clean query for CNPJ numeric check (optional, but keeping ilike for original text is safer)
      builder = builder.or(`cnpj.ilike.%${searchTerm}%,company_name.ilike.%${searchTerm}%`);
    }

    const { data, error } = await builder.order("created_at", { ascending: false });

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

    // Merge with localStorage fallback entries
    const localRaw = typeof window !== "undefined" ? localStorage.getItem(LOCAL_STORAGE_KEY) : null;
    const localArr: LocalStored[] = localRaw ? JSON.parse(localRaw) : [];
    
    const matchedLocal = (localArr || [])
      .filter((l) => {
        if (!searchTerm) return true;
        const qcnpj = String(l.quote.cnpj || "").toLowerCase();
        const qname = String(l.quote.companyName || l.quote.company_name || "").toLowerCase();
        const lowerSearch = searchTerm.toLowerCase();
        return qcnpj.includes(lowerSearch) || qname.includes(lowerSearch);
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
    console.error("Erro ao buscar orçamentos (supabase/local):", err);
    return [];
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
    console.error("Erro ao buscar itens do orçamento (supabase/local):", err);
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

export const getNextProposalSequence = async (dateStr: string): Promise<number> => {
  try {
    const { data, error } = await supabase
      .from("quotes")
      .select("proposal_number");

    if (error) throw error;

    let maxSeq = 0;
    if (data && data.length > 0) {
      data.forEach((q) => {
        const num = q.proposal_number || "";
        // Match "-YYYYMMDD-NNN"
        const regex = new RegExp(`-${dateStr}-(\\d{3})`);
        const match = num.match(regex);
        if (match) {
          const seq = parseInt(match[1]);
          if (seq > maxSeq) maxSeq = seq;
        }
      });
    }

    // Also check local quotes in localStorage
    try {
      const localRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (localRaw) {
        const localArr: LocalStored[] = JSON.parse(localRaw);
        localArr.forEach((l) => {
          const num = l.quote.proposalNumber || "";
          const regex = new RegExp(`-${dateStr}-(\\d{3})`);
          const match = num.match(regex);
          if (match) {
            const seq = parseInt(match[1]);
            if (seq > maxSeq) maxSeq = seq;
          }
        });
      }
    } catch {}

    return maxSeq + 1;
  } catch (err) {
    console.warn("Failed to get next proposal sequence, defaulting to 1", err);
    return 1;
  }
};

export const getProposalSequenceAndRevision = async (
  cnpj: string
): Promise<{ 
  sequence: number; 
  revision: number;
  previousContact?: {
    companyName?: string;
    contactName?: string;
    email?: string;
    phone?: string;
    address?: string;
  }
}> => {
  try {
    const cleanTargetCnpj = String(cnpj || "").replace(/\D/g, "");

    const parseProposalNumber = (num: string) => {
      const obmMatch = num.match(/OBM-(\d+)/i);
      const revMatch = num.match(/REV(\d+)/i);
      return {
        seq: obmMatch ? parseInt(obmMatch[1], 10) : 0,
        rev: revMatch ? parseInt(revMatch[1], 10) : 0
      };
    };

    // Helper to fetch max global sequence from recent quotes (much more efficient than fetching all)
    const fetchMaxGlobalSequence = async (): Promise<number> => {
      let maxGlobalSequence = 0;
      try {
        const { data, error } = await supabase
          .from("quotes")
          .select("proposal_number")
          .order("created_at", { ascending: false })
          .limit(100);

        if (!error && data) {
          data.forEach((q) => {
            const { seq } = parseProposalNumber(q.proposal_number || "");
            if (seq > maxGlobalSequence) maxGlobalSequence = seq;
          });
        }
      } catch (err) {
        console.warn("Failed to fetch recent global sequence", err);
      }

      // Fallback to local storage
      try {
        const localRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (localRaw) {
          const localArr: LocalStored[] = JSON.parse(localRaw);
          localArr.forEach((l) => {
            const { seq } = parseProposalNumber(l.quote.proposalNumber || "");
            if (seq > maxGlobalSequence) maxGlobalSequence = seq;
          });
        }
      } catch {}

      return maxGlobalSequence;
    };

    if (!cleanTargetCnpj || cleanTargetCnpj.length < 14) {
      const maxGlobalSequence = await fetchMaxGlobalSequence();
      return { sequence: maxGlobalSequence + 1, revision: 0 };
    }

    // Format CNPJ as XX.XXX.XXX/XXXX-XX
    const formattedCnpj = cleanTargetCnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

    // Fetch quotes specifically matching this CNPJ
    const { data: dbQuotes, error } = await supabase
      .from("quotes")
      .select("proposal_number, cnpj, company_name, contact_name, email, phone, address")
      .or(`cnpj.eq."${formattedCnpj}",cnpj.eq."${cleanTargetCnpj}"`);

    if (error) throw error;

    let allMatchingQuotes = dbQuotes || [];

    // Check localStorage for local matches
    try {
      const localRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (localRaw) {
        const localArr: LocalStored[] = JSON.parse(localRaw);
        const localMatches = localArr
          .filter(l => {
            const cleanL = String(l.quote.cnpj || "").replace(/\D/g, "");
            return cleanL === cleanTargetCnpj;
          })
          .map(l => ({
            proposal_number: l.quote.proposalNumber,
            cnpj: l.quote.cnpj,
            company_name: l.quote.companyName,
            contact_name: l.quote.contactName,
            email: l.quote.email,
            phone: l.quote.phone,
            address: l.quote.address
          }));
        allMatchingQuotes = [...allMatchingQuotes, ...localMatches];
      }
    } catch {}

    if (allMatchingQuotes.length > 0) {
      let cnpjSequence = 0;
      let maxCnpjRevision = -1;
      let latestQuote: any = null;

      allMatchingQuotes.forEach((q) => {
        const { seq, rev } = parseProposalNumber(q.proposal_number || "");
        if (seq > 0) {
          cnpjSequence = seq;
        }
        if (rev > maxCnpjRevision) {
          maxCnpjRevision = rev;
          latestQuote = q;
        }
      });

      if (cnpjSequence > 0) {
        const maxGlobalSequence = await fetchMaxGlobalSequence();
        return {
          sequence: cnpjSequence,
          revision: maxCnpjRevision + 1,
          nextGlobalSequence: maxGlobalSequence + 1,
          previousContact: latestQuote ? {
            companyName: latestQuote.company_name || latestQuote.companyName,
            contactName: latestQuote.contact_name || latestQuote.contactName,
            email: latestQuote.email,
            phone: latestQuote.phone,
            address: latestQuote.address
          } : undefined
        };
      }
    }

    // CNPJ new to database, fallback to global max sequence
    const maxGlobalSequence = await fetchMaxGlobalSequence();
    return { sequence: maxGlobalSequence + 1, revision: 0 };
  } catch (err) {
    console.warn("Failed to get proposal sequence and revision", err);
    return { sequence: 1, revision: 0 };
  }
};