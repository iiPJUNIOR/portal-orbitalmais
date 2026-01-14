// Supabase-backed service for quotes.
// If Supabase isn't configured, functions fallback to previous mock behavior.

import { supabase } from "@/integrations/supabase/client";
import { v4 as uuidv4 } from "uuid";
import type { Quote as QuoteType, QuoteItem as QuoteItemType } from "@/types/quote";

// Helper to check if supabase is configured
const SUPABASE_CONFIGURED =
  typeof import.meta.env.VITE_SUPABASE_URL === "string" &&
  import.meta.env.VITE_SUPABASE_URL !== "" &&
  typeof import.meta.env.VITE_SUPABASE_ANON_KEY === "string" &&
  import.meta.env.VITE_SUPABASE_ANON_KEY !== "";

export const saveQuote = async (
  quote: Omit<QuoteType, "id" | "createdAt" | "updatedAt">,
  items: Omit<QuoteItemType, "id" | "quoteId">[],
  pptxBlob?: Blob,
  pptxFileName?: string
): Promise<string> => {
  if (!SUPABASE_CONFIGURED) {
    console.warn("Supabase not configured — falling back to mock saveQuote");
    // Return a mock ID
    return `mock-quote-${Date.now()}`;
  }

  // Try real Supabase flow
  try {
    // 1) Upload PPTX if provided
    let pptxUrl: string | undefined = undefined;
    if (pptxBlob && pptxFileName) {
      try {
        const uploadedUrl = await uploadPptxFile(pptxBlob, pptxFileName);
        pptxUrl = uploadedUrl;
      } catch (err) {
        console.warn("PPTX upload failed:", err);
      }
    }

    // 2) Insert quote record
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
      pptx_url: pptxUrl ?? null,
      // created_at and updated_at are handled server-side
    };

    // Attempt to set user_id if available (optional)
    try {
      // supabase.auth.getUser may be async depending on version; try to access current session
      // @ts-ignore
      const userResp = await supabase.auth.getUser?.();
      const userId = userResp?.data?.user?.id;
      if (userId) {
        insertPayload.user_id = userId;
      }
    } catch {
      // ignore
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

    // 3) Insert items
    const itemsToInsert = items.map((it) => ({
      quote_id: quoteId,
      sku: it.sku,
      product_description: it.productDescription,
      quantity: it.quantity,
      unit_price: it.unitPrice,
      price_model: it.priceModel,
      subtotal: it.subtotal,
    }));

    const { error: itemsError } = await supabase.from("quote_items").insert(itemsToInsert);
    if (itemsError) {
      console.warn("Warning: quote saved but items insertion failed", itemsError);
    }

    return quoteId;
  } catch (err) {
    console.error("Failed to save quote to Supabase:", err);
    throw err;
  }
};

export const getQuotesByCnpj = async (cnpj: string): Promise<QuoteType[]> => {
  if (!SUPABASE_CONFIGURED) {
    console.warn("Supabase not configured — falling back to mock getQuotesByCnpj");
    return [];
  }

  try {
    // Exact match or normalized match (strip non-digit chars)
    const clean = cnpj.replace(/\D/g, "");
    // Query quotes where cnpj ilike or equal
    const { data, error } = await supabase
      .from("quotes")
      .select("*")
      .ilike("cnpj", `%${clean}%`)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []) as QuoteType[];
  } catch (err) {
    console.error("Failed to fetch quotes by CNPJ:", err);
    throw err;
  }
};

export const updateQuoteStatus = async (quoteId: string, status: QuoteType["status"]): Promise<void> => {
  if (!SUPABASE_CONFIGURED) {
    console.warn("Supabase not configured — falling back to mock updateQuoteStatus");
    return;
  }

  try {
    const { error } = await supabase.from("quotes").update({ status }).eq("id", quoteId);
    if (error) throw error;
  } catch (err) {
    console.error("Failed to update quote status:", err);
    throw err;
  }
};

export const uploadPptxFile = async (file: Blob, fileName: string): Promise<string> => {
  if (!SUPABASE_CONFIGURED) {
    console.warn("Supabase not configured — falling back to mock uploadPptxFile");
    return `https://mock-storage.local/${fileName}`;
  }

  try {
    // Ensure bucket name 'proposals' is used. Use a uuid filename to avoid collisions.
    const destFileName = `proposals/${uuidv4()}-${fileName}`;

    // Convert Blob to File if necessary
    const fileObj = new File([file], fileName, { type: file.type || "application/octet-stream" });

    const { error: uploadError } = await supabase.storage
      .from("proposals")
      .upload(destFileName, fileObj, { upsert: true });

    if (uploadError) {
      throw uploadError;
    }

    // Get public URL (may require the bucket to be public or have appropriate policies)
    const { data: publicUrlData } = supabase.storage.from("proposals").getPublicUrl(destFileName);
    const publicUrl = publicUrlData.publicUrl;

    return publicUrl;
  } catch (err) {
    console.error("Failed to upload PPTX to Supabase Storage:", err);
    throw err;
  }
};