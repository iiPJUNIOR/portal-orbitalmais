import { supabase } from "@/integrations/supabase/client";
import { v4 as uuidv4 } from "uuid";
import type { Quote as QuoteType, QuoteItem as QuoteItemType } from "@/types/quote";

/**
 * Salva o orçamento no banco de dados.
 * Omitimos o upload de arquivo conforme solicitado, salvando apenas os dados e configurações.
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
      price_model: it.priceModel || quote.priceModel,
      subtotal: (it.unitPrice || 0) * it.quantity,
    }));

    const { error: itemsError } = await supabase.from("quote_items").insert(itemsToInsert);
    if (itemsError) {
      console.warn("Aviso: Orçamento salvo, mas houve erro ao inserir itens", itemsError);
    }

    return quoteId;
  } catch (err) {
    console.error("Erro ao salvar orçamento no Supabase:", err);
    throw err;
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
    
    // Mapeia snake_case para camelCase para o frontend
    return (data || []).map(q => ({
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
      settings: q.settings
    })) as QuoteType[];
  } catch (err) {
    console.error("Erro ao buscar orçamentos por CNPJ:", err);
    throw err;
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