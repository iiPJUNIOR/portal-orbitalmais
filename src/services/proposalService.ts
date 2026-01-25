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

export const calculateProposalSummary = (items: Array<any>) => {
  const totalDevices = (items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  return { totalDevices };
};

export const extractPipedriveId = (url: string): string | null => {
  if (!url) return null;
  const match = url.match(/\/deal\/(\d+)/);
  return match ? match[1] : null;
};

export const generateProposalNumber = (pipedriveUrl?: string, version?: string | number): string => {
  const dealId = pipedriveUrl ? extractPipedriveId(pipedriveUrl) : null;
  if (dealId) return `${dealId} V${version || 1}`;
  
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${datePart}-${rand} V${version || 1}`;
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

export const generateProposalPPTX = async (data: ProposalData): Promise<Blob> => {
  try {
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
    };

    const computedTotal = (data.overrideTotal !== undefined && data.overrideTotal !== null)
      ? Number(data.overrideTotal)
      : (data.totalPrice || data.items.reduce((s, it) => s + (it.unitPrice ?? 0) * it.quantity, 0));
    
    replacements["totalPrice"] = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(computedTotal);

    replacements["items_list"] = "";
    replacements["items_list1"] = "";
    replacements["items_list2"] = "";

    data.items.slice(0, 3).forEach((it, idx) => {
      const line = `${it.product.description} – ${it.quantity} un`;
      if (idx === 0) replacements["items_list"] = line;
      if (idx === 1) replacements["items_list1"] = line;
      if (idx === 2) replacements["items_list2"] = line;
    });

    const keepSlides = [1, 2, 3, 4];
    for (let i = 5; i <= 18; i++) keepSlides.push(i);
    keepSlides.push(46, 54, 55, 57);

    if (data.includeApprovalPage) {
      keepSlides.push(56);
    }

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
    console.error("Erro na geração do PPTX:", err);
    throw err;
  }
};

export const generateProposalPDF = async (data: ProposalData): Promise<Blob> => {
  const doc = new jsPDF();
  const margin = 20;
  let y = margin;

  // Header / Logo area simulation
  doc.setFillColor(30, 30, 30);
  doc.rect(0, 0, 210, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text("Control iD", margin, 25);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Proposta Comercial", margin, 32);

  y = 55;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(18);
  doc.text(data.companyName || "Proposta Comercial", margin, y);
  y += 10;
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Número: ${data.proposalNumber || "N/A"}`, margin, y);
  doc.text(`Data: ${formatDateForProposal(data.proposalDate)}`, 140, y);
  y += 15;

  // Client info
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Dados do Cliente", margin, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Empresa: ${data.companyName}`, margin, y);
  y += 5;
  doc.text(`CNPJ: ${data.cnpj}`, margin, y);
  y += 5;
  doc.text(`A/C: ${data.contactName}`, margin, y);
  y += 5;
  doc.text(`Endereço: ${data.address}`, margin, y);
  y += 15;

  // Items table
  autoTable(doc, {
    startY: y,
    head: [['Descrição do Produto', 'Quantidade']],
    body: data.items.map(it => [it.product.description, `${it.quantity} un`]),
    theme: 'grid',
    headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 10, cellPadding: 5 },
    margin: { left: margin, right: margin }
  });

  y = (doc as any).lastAutoTable.finalY + 15;

  // Summary and Price
  const computedTotal = (data.overrideTotal !== undefined && data.overrideTotal !== null)
    ? Number(data.overrideTotal)
    : (data.totalPrice || data.items.reduce((s, it) => s + (it.unitPrice ?? 0) * it.quantity, 0));

  doc.setFillColor(245, 245, 245);
  doc.rect(margin, y, 170, 25, 'F');
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("INVESTIMENTO TOTAL", margin + 5, y + 16);
  doc.text(`R$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(computedTotal)}`, 140, y + 16);
  
  y += 40;

  // Seller info
  if (data.sellerName) {
    doc.setFontSize(11);
    doc.text("Atenciosamente,", margin, y);
    y += 10;
    doc.setFont("helvetica", "bold");
    doc.text(data.sellerName, margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(data.sellerRole || "", margin, y);
    y += 4;
    doc.text(data.sellerEmail || "", margin, y);
    y += 4;
    doc.text(data.sellerPhone || "", margin, y);
  }

  // Optional Approval Page simulation
  if (data.includeApprovalPage) {
    doc.addPage();
    doc.setFillColor(30, 30, 30);
    doc.rect(0, 0, 210, 297, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text("Clique aqui para aprovar sua proposta", 105, 140, { align: 'center' });
    doc.setFontSize(12);
    doc.text("Aguardamos seu retorno para darmos início ao projeto.", 105, 155, { align: 'center' });
  }

  return doc.output('blob');
};