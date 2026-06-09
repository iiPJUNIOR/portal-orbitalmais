import { supabase } from "@/integrations/supabase/client";
import { v4 as uuidv4 } from "uuid";
import type { Quote as QuoteType, QuoteItem as QuoteItemType } from "@/types/quote";



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
): Promise<{ id: string; isRemote: boolean; error?: any }> => {
  try {
    // 1) Prepare payload for Supabase
    const insertPayload: any = {
      cnpj: quote.cnpj || "",
      company_name: quote.companyName || "",
      contact_name: quote.contactName || "",
      email: quote.email || "",
      phone: quote.phone || "",
      address: quote.address || "",
      proposal_date: quote.proposalDate || new Date().toISOString().split('T')[0],
      proposal_number: quote.proposalNumber || `OBM-${Date.now()}`,
      price_model: quote.priceModel || "padrao",
      total_price: quote.totalPrice || 0,
      status: quote.status ?? "rascunho",
      observations: quote.observations ?? "",
      settings: quote.settings || {}, // save the whole wizard state
    };

    // Try to attach current authenticated user ID (optional)
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user?.id) {
      insertPayload.user_id = userData.user.id;
    }

    let quoteInsertData: any;

    // First attempt: with user_id
    const firstAttempt = await supabase
      .from("quotes")
      .insert(insertPayload)
      .select()
      .single();

    if (firstAttempt.error) {
      console.warn("First insert attempt failed (likely RLS / foreign key). Retrying with user_id = null...", firstAttempt.error);
      
      const fallbackPayload = { ...insertPayload };
      fallbackPayload.user_id = null; // Save as public/shared

      const secondAttempt = await supabase
        .from("quotes")
        .insert(fallbackPayload)
        .select()
        .single();

      if (secondAttempt.error) {
        console.error("Second insert attempt failed as well:", secondAttempt.error);
        throw secondAttempt.error;
      }
      quoteInsertData = secondAttempt.data;
    } else {
      quoteInsertData = firstAttempt.data;
    }

    const quoteId = quoteInsertData.id as string;

    // 2) Insert quote items
    const itemsToInsert = items.map((it) => {
      const qty = it.quantity || 1;
      const price = it.unitPrice || 0;
      return {
        quote_id: quoteId,
        sku: it.sku || it.productDescription || (it.product && it.product.part_number) || "",
        product_description: it.productDescription || (it.product && it.product.description) || "",
        quantity: qty,
        unit_price: price,
        price_model: it.price_model || it.priceModel || quote.priceModel || "padrao",
        subtotal: price * qty,
      };
    });

    const { error: itemsError } = await supabase.from("quote_items").insert(itemsToInsert);
    if (itemsError) {
      console.warn("Warning: quote saved but items insert returned error", itemsError);
    }

    return { id: quoteId, isRemote: true };
  } catch (err: any) {
    console.error("saveQuote supabase failed completely", err);
    return { id: uuidv4(), isRemote: false, error: err };
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

    return supabaseQuotes;
  } catch (err) {
    console.error("Erro ao buscar orçamentos (supabase):", err);
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
  } catch (err) {
    console.error("Erro ao buscar itens do orçamento:", err);
    return [];
  }
};

export const updateQuoteStatus = async (quoteId: string, status: QuoteType["status"]): Promise<void> => {
  try {
    const { error } = await supabase.from("quotes").update({ status }).eq("id", quoteId);
    if (error) throw error;
  } catch (err) {
    console.error("Erro ao atualizar status do orçamento:", err);
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
      .select("proposal_number, cnpj, company_name, contact_name, email, phone, address, settings")
      .or(`cnpj.eq."${formattedCnpj}",cnpj.eq."${cleanTargetCnpj}"`);

    if (error) throw error;

    let allMatchingQuotes = dbQuotes || [];

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
        const prevSettings = latestQuote ? (latestQuote.settings || latestQuote.quote?.settings) : null;
        return {
          sequence: cnpjSequence,
          revision: maxCnpjRevision + 1,
          nextGlobalSequence: maxGlobalSequence + 1,
          previousContact: latestQuote ? {
            companyName: latestQuote.company_name || latestQuote.companyName,
            contactName: latestQuote.contact_name || latestQuote.contactName,
            email: latestQuote.email,
            phone: latestQuote.phone,
            address: latestQuote.address,
            selectedProducts: prevSettings?.selectedProducts || []
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