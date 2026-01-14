import { Product } from "@/types/product";

interface QuoteItem {
  id: string;
  product: Product;
  quantity: number;
  priceModel: '12m' | '24m';
}

interface ProposalData {
  cnpj: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  proposalDate: string;
  observations: string;
  priceModel: '12m' | '24m';
  items: QuoteItem[];
}

interface ProposalSummary {
  totalUsers: number;
  totalDevices: number;
  totalPrice: number;
}

export const calculateProposalSummary = (items: QuoteItem[]): ProposalSummary => {
  let totalUsers = 0;
  let totalDevices = 0;
  let totalPrice = 0;
  
  items.forEach(item => {
    // Calculate users based on product type
    if (item.product.category === 'Catraca Pedestal' || 
        item.product.category === 'Catraca Balcão' || 
        item.product.category === 'Torniquete') {
      totalUsers += 100 * item.quantity; // 100 users per access control device
    } else if (item.product.category === 'Controladores Porta') {
      totalUsers += 50 * item.quantity; // 50 users per door controller
    }
    
    // Calculate devices
    totalDevices += item.quantity;
    
    // Calculate price
    const unitPrice = item.priceModel === '12m' 
      ? item.product.value_12m 
      : item.product.value_24m;
    totalPrice += unitPrice * item.quantity;
  });
  
  return {
    totalUsers,
    totalDevices,
    totalPrice
  };
};

export const generateProposalNumber = (): string => {
  // Generate a random 6-digit number
  const number = Math.floor(100000 + Math.random() * 900000);
  const version = 1; // This would increment for new versions
  return `${number} V.${version}`;
};

export const formatDateForProposal = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('pt-BR', { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });
};

// In a real implementation, this would generate an actual PPTX file
export const generateProposalPPTX = async (data: ProposalData): Promise<Blob> => {
  // This is a placeholder - in a real app, we would use a library like PptxGenJS
  // to generate the actual PowerPoint presentation
  
  // For now, we'll return a simple text file with the proposal data
  const proposalSummary = calculateProposalSummary(data.items);
  const proposalNumber = generateProposalNumber();
  const formattedDate = formatDateForProposal(data.proposalDate);
  
  const content = `
Proposta Comercial - Control iD
================================

Data: ${formattedDate}
Aos cuidados de: ${data.contactName}
Empresa: ${data.companyName}
Número da proposta: ${proposalNumber}
E-mail: ${data.email}
Telefone: ${data.phone}

Equipamentos selecionados:
${data.items.map(item => 
  `- ${item.product.description} (Qtd: ${item.quantity})`
).join('\n')}

Resumo:
- Usuários iDSecure: ${proposalSummary.totalUsers}
- Dispositivos: ${proposalSummary.totalDevices}
- Total Mensal: R$ ${proposalSummary.totalPrice.toFixed(2)}

Observações: ${data.observations || 'Nenhuma'}
  `.trim();
  
  return new Blob([content], { type: 'text/plain' });
};