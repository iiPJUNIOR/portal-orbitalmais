export interface Quote {
  id: string;
  cnpj: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  proposalDate: string;
  proposalNumber: string;
  priceModel: '12m' | '24m';
  totalPrice: number;
  status: 'rascunho' | 'enviada' | 'aceita' | 'recusada';
  observations: string;
  createdAt: string;
  updatedAt: string;
  pptxUrl?: string;
}

export interface QuoteItem {
  id: string;
  quoteId: string;
  sku: string;
  productDescription: string;
  quantity: number;
  unitPrice: number;
  priceModel: '12m' | '24m';
  subtotal: number;
}