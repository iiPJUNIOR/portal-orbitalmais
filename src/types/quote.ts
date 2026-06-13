export interface Quote {
  id: string;
  cnpj: string;
  companyName: string;
  contactName: string;
  contactGender?: string;
  email: string;
  phone: string;
  address: string;
  proposalDate: string;
  proposalNumber: string;
  priceModel: string;
  totalPrice: number;
  status: 'rascunho' | 'enviada' | 'aceita' | 'recusada';
  observations: string;
  createdAt: string;
  updatedAt: string;
  pptxUrl?: string;
  settings?: any; // Armazena o estado completo do wizard (JSON)
}

export interface QuoteItem {
  id: string;
  quoteId: string;
  sku: string;
  productDescription: string;
  quantity: number;
  unitPrice: number;
  priceModel: string;
  subtotal: number;
}