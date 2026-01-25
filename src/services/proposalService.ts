import { Product } from "@/types/product";
import { generatePptxFromTemplate } from "@/utils/pptxTemplate";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { parseISO } from "date-fns";

interface QuoteItem {
  id: string;
  product: Product;
  quantity: number;
  priceModel: '12m' | '24m';
  unitPrice?: number;
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
  proposalNumber?: string;
  pipedriveUrl?: string;
  version?: string | number;
  sellerName?: string;
  sellerRole?: string;
  sellerEmail?: string;
  sellerPhone?: string;
  users?: number;
  devices?: number;
  qtd?: string;
  qtd1?: string;
  qtd2?: string;
  totalPrice?: number;
  overrideTotal?: number | null;
  includeApprovalPage?: boolean;
}

const MODEL_TO_SLIDE: Record<string, number> = {
  "idface pro": 19, "idface max": 20, "idaccess nano": 21, "idflex ip65": 22,
  "idflex pro": 23, "idaccess": 24, "idfit 4x2": 25, "idaccess pro": 26,
  "secbox": 27, "iduhf": 28, "iduhf lite": 29, "idblock next facial": 30,
  "idblock next biometria digital": 31, "idblock facial inox": 32,
  "idblock facial preta": 33, "idblock facial mini preta": 34,
  "idblock facial mini inox": 35, "idblock inox biométrica": 36,
  "idblock preta biométrica": 37, "idblock braço articulado inox": 38,
  "idblock braço articulado preta": 39, "idblock balcão": 40,
  "idblock pne": 41, "torniquete fet 100": 42, "idpower": 43,
  "idprox usb": 44, "idbio": 45,
};

export const formatDateForProposal = (dateStr?: string | null): string => {
  try {
    let dt: Date;
    if (!dateStr) {
      dt = new Date();
    } else if (dateStr.includes("/")) {
      const [d, m, y] = dateStr.split("/");
      dt = new Date(Number(y), Number(m) - 1, Number(d));
    } else {
      dt = dateStr.includes("T") ? parseISO(dateStr) : new Date(dateStr + "T12:00:00");
    }
    return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(dt);
  } catch { 
    return dateStr || ""; 
  }
};

export const generateProposalNumber = (pipedriveUrl?: string, version?: string | number): string => {
  const match = pipedriveUrl?.match(/\/deal\/(\d+)/);
  const dealId = match ? match[1] : null;
  if (dealId) return `${dealId} V${version || 1}`;
  
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${datePart}-${rand} V${version || 1}`;
};

export const generateProposalPPTX = async (data: ProposalData): Promise<Blob> => {
  try {
    const computedTotal = (data.overrideTotal !== undefined && data.overrideTotal !== null)
      ? Number(data.overrideTotal)
      : (data.totalPrice || 0);

    const replacements: Record<string, string | number> = {
      companyName: data.companyName || "",
      contactName: data.contactName || "",
      date: formatDateForProposal(data.proposalDate),
      proposalNumber: data.proposalNumber || "",
      sellerName: data.sellerName || "",
      sellerRole: data.sellerRole || "",
      sellerEmail: data.sellerEmail || "",
      sellerPhone: data.sellerPhone || "",
      CNPJ: data.cnpj || "",
      endereço: data.address || "",
      users: data.users || 0,
      devices: data.devices || 0,
      qtd: data.qtd || "0",
      qtd1: data.qtd1 || "0",
      qtd2: data.qtd2 || "0",
      totalPrice: new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(computedTotal),
    };

    // Linhas de itens (Página 4) - Apenas a descrição, sem quantidade
    replacements["items_list"] = data.items[0] ? data.items[0].product.description : "";
    replacements["items_list1"] = data.items[1] ? data.items[1].product.description : "";
    replacements["items_list2"] = data.items[2] ? data.items[2].product.description : "";

    // Slides mantidos: 1 (Capa), 3 (Dados Cliente), 4 (Resumo Itens)
    const keepSlides = [1, 3, 4];
    for (let i = 5; i <= 18; i++) keepSlides.push(i);
    keepSlides.push(46, 54, 55, 57);

    if (data.includeApprovalPage) keepSlides.push(56);

    data.items.forEach(it => {
      const modelLower = (it.product.model || "").toLowerCase().trim();
      let foundSlide = MODEL_TO_SLIDE[modelLower];
      if (!foundSlide) {
        const key = Object.keys(MODEL_TO_SLIDE).find(k => modelLower.includes(k));
        if (key) foundSlide = MODEL_TO_SLIDE[key];
      }
      if (foundSlide) keepSlides.push(foundSlide);
    });

    return await generatePptxFromTemplate({
      replacements,
      keepSlidesOverride: Array.from(new Set(keepSlides)).sort((a, b) => a - b),
    });
  } catch (err) {
    console.error("Erro PPTX:", err);
    throw err;
  }
};

export const generateProposalPDF = async (data: ProposalData): Promise<Blob> => {
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();

  const drawHeader = () => {
    doc.setFillColor(30, 30, 30);
    doc.rect(0, 0, width, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Control iD", 15, 17);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("PROPOSTA COMERCIAL", width - 15, 17, { align: 'right' });
  };

  // Página 1: Capa
  drawHeader();
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(32);
  doc.setFont("helvetica", "bold");
  doc.text(data.companyName || "PROPOSTA", 15, 70);
  doc.setFontSize(14);
  doc.text(`Proposta: ${data.proposalNumber}`, 15, 85);
  doc.text(`Data: ${formatDateForProposal(data.proposalDate)}`, 15, 95);

  // Página 3: Dados do Cliente
  doc.addPage();
  drawHeader();
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(22);
  doc.text("Identificação do Projeto", 15, 50);
  doc.setFontSize(14);
  doc.text(`Número da Proposta: ${data.proposalNumber}`, 15, 70);
  doc.text(`Responsável: ${data.contactName}`, 15, 80);
  doc.text(`Empresa: ${data.companyName}`, 15, 90);
  doc.text(`CNPJ: ${data.cnpj}`, 15, 100);
  doc.text(`Endereço: ${data.address}`, 15, 110);
  
  // Página 4: Resumo de Itens
  doc.addPage();
  drawHeader();
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(22);
  doc.text("Resumo do Projeto e Investimento", 15, 50);
  
  autoTable(doc, {
    startY: 60,
    head: [['Descrição', 'Quantidade']],
    body: data.items.map(it => [it.product.description, `${it.quantity} un`]),
    theme: 'grid',
    headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontSize: 12 },
    styles: { fontSize: 11, cellPadding: 6 },
    margin: { left: 15, right: 15 }
  });

  const finalY = (doc as any).lastAutoTable.finalY;
  const computedTotal = (data.overrideTotal !== undefined && data.overrideTotal !== null)
    ? Number(data.overrideTotal)
    : (data.totalPrice || 0);

  doc.setFillColor(245, 245, 245);
  doc.rect(15, finalY + 10, width - 30, 20, 'F');
  doc.setFont("helvetica", "bold");
  doc.text("VALOR TOTAL DA PROPOSTA", 20, finalY + 23);
  doc.text(`R$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(computedTotal)}`, width - 20, finalY + 23, { align: 'right' });

  // Contato Vendedor
  doc.addPage();
  drawHeader();
  doc.setFontSize(22);
  doc.text("Contato Comercial", 15, 50);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(data.sellerName || "", 15, 70);
  doc.setFont("helvetica", "normal");
  doc.text(data.sellerRole || "", 15, 78);
  doc.text(data.sellerEmail || "", 15, 86);
  doc.text(data.sellerPhone || "", 15, 94);

  // Aprovação
  if (data.includeApprovalPage) {
    doc.addPage();
    doc.setFillColor(30, 30, 30);
    doc.rect(0, 0, width, height, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(28);
    doc.text("Clique aqui para aprovar sua proposta", width / 2, height / 2, { align: 'center' });
  }

  return doc.output('blob');
};