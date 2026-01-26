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
  approvalLink?: string;
}

const MODEL_TO_SLIDE: Record<string, number> = {
  "idface pro": 19, "idface max": 20, "idaccess nano": 21, "idflex ip65": 22,
  "idflex pro": 23, "idaccess": 24, "idfit 4x2": 25, "idaccess pro": 26,
  "secbox": 27, "iduhf": 28, "iduhf lite": 29, "idblock next facial": 30,
  "idblock next biometria digital": 31, "idblock facial inox": 32,
  "idblock facial inox ": 32, "idblock facial inox": 32,
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

    const formattedTotal = new Intl.NumberFormat("pt-BR", { 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true
    }).format(computedTotal);

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
      totalPrice: formattedTotal,
      approvalLink: data.approvalLink || "",
    };

    replacements["items_list"] = data.items[0] ? data.items[0].product.description : "";
    replacements["qtd"] = data.items[0] ? data.items[0].quantity : "";
    replacements["items_list1"] = data.items[1] ? data.items[1].product.description : "";
    replacements["qtd1"] = data.items[1] ? data.items[1].quantity : "";
    replacements["items_list2"] = data.items[2] ? data.items[2].product.description : "";
    replacements["qtd2"] = data.items[2] ? data.items[2].quantity : "";

    const keepSlides = [1, 3, 4];
    for (let i = 5; i <= 18; i++) keepSlides.push(i);
    keepSlides.push(46, 55, 57);

    const hasCatraca = data.items.some(it => {
      const model = (it.product.model || "").toLowerCase();
      const desc = (it.product.description || "").toLowerCase();
      const cat = (it.product.category || "").toLowerCase();
      return model.includes("idblock") || model.includes("torniquete") || 
             desc.includes("idblock") || desc.includes("torniquete") ||
             cat.includes("catraca") || cat.includes("torniquete");
    });

    if (hasCatraca) keepSlides.push(54);
    if (!keepSlides.includes(46)) keepSlides.push(46);
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

/**
 * High-fidelity PDF Generation Service
 */
export const generateProposalPDF = async (data: ProposalData): Promise<Blob> => {
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4', unit: 'mm' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  
  const colors = {
    primary: [26, 26, 26], 
    accent: [220, 20, 60], 
    light: [248, 249, 250],
    text: [33, 37, 41],
    white: [255, 255, 255]
  };

  const drawSlideBase = (title?: string) => {
    // Top Bar
    doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.rect(0, 0, width, 20, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Control iD", 15, 13);
    
    if (title) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(title.toUpperCase(), width - 15, 12.5, { align: 'right' });
    }
    
    doc.setFillColor(colors.accent[0], colors.accent[1], colors.accent[2]);
    doc.rect(0, height - 1.5, width, 1.5, 'F');
  };

  // 1. CAPA
  doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.rect(0, 0, width, height, 'F');
  
  doc.setFillColor(colors.accent[0], colors.accent[1], colors.accent[2]);
  doc.rect(0, height * 0.65, width * 0.45, 12, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(52);
  doc.text("PROPOSTA", 25, height * 0.38);
  doc.text("COMERCIAL", 25, height * 0.55);

  doc.setFontSize(18);
  doc.setFont("helvetica", "normal");
  doc.text(data.companyName.toUpperCase(), 25, height * 0.78);
  doc.setFontSize(14);
  doc.text(`A/C: ${data.contactName}`, 25, height * 0.78 + 10);
  
  doc.setFontSize(9);
  doc.text(`NÚMERO: ${data.proposalNumber}`, width - 25, height - 15, { align: 'right' });
  doc.text(`DATA: ${formatDateForProposal(data.proposalDate)}`, width - 25, height - 10, { align: 'right' });

  // 2. DADOS DO CLIENTE
  doc.addPage();
  drawSlideBase("Informações do Projeto");
  doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.setFontSize(26);
  doc.setFont("helvetica", "bold");
  doc.text("Identificação do Cliente", 15, 45);

  autoTable(doc, {
    startY: 55,
    margin: { left: 15 },
    body: [
      ["CLIENTE", data.companyName],
      ["CNPJ", data.cnpj],
      ["ENDEREÇO", data.address || "Não informado"],
      ["CONTATO", data.contactName],
      ["E-MAIL", data.email],
      ["TELEFONE", data.phone || "Não informado"],
    ],
    theme: 'plain',
    styles: { fontSize: 12, cellPadding: 6, textColor: colors.text },
    columnStyles: { 0: { fontStyle: 'bold', width: 50, textColor: colors.accent } }
  });

  // 3. INVESTIMENTO
  doc.addPage();
  drawSlideBase("Resumo do Investimento");
  doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.setFontSize(26);
  doc.setFont("helvetica", "bold");
  doc.text("Soluções Propostas", 15, 45);

  autoTable(doc, {
    startY: 55,
    margin: { left: 15, right: 15 },
    head: [['#', 'DESCRIÇÃO DOS PRODUTOS', 'QTD', 'VALOR UNIT.', 'TOTAL']],
    body: data.items.map((it, idx) => [
      String(idx + 1).padStart(2, '0'),
      it.product.description.toUpperCase(),
      it.quantity,
      new Intl.NumberFormat("pt-BR", { style: 'currency', currency: 'BRL' }).format(it.unitPrice || 0),
      new Intl.NumberFormat("pt-BR", { style: 'currency', currency: 'BRL' }).format((it.unitPrice || 0) * it.quantity)
    ]),
    theme: 'grid',
    headStyles: { fillColor: colors.primary, textColor: 255, fontSize: 10, halign: 'center' },
    styles: { fontSize: 9, cellPadding: 5 },
    columnStyles: { 
      0: { halign: 'center', width: 15 },
      2: { halign: 'center', width: 15 },
      3: { halign: 'right', width: 35 },
      4: { halign: 'right', width: 35, fontStyle: 'bold' }
    }
  });

  const finalY = (doc as any).lastAutoTable.finalY;
  const computedTotal = (data.overrideTotal !== undefined && data.overrideTotal !== null)
    ? Number(data.overrideTotal)
    : (data.totalPrice || 0);

  const formattedTotal = new Intl.NumberFormat("pt-BR", { 
    style: 'currency', currency: 'BRL'
  }).format(computedTotal);

  doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.rect(width - 110, finalY + 10, 95, 25, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text("TOTAL DO INVESTIMENTO", width - 100, finalY + 18);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text(formattedTotal, width - 100, finalY + 30);

  // 4. CONTATO
  doc.addPage();
  drawSlideBase("Encerramento");
  doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.setFontSize(32);
  doc.text("Dúvidas?", 15, 50);
  doc.text("Estamos à disposição.", 15, 65);
  
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(data.sellerName?.toUpperCase() || "CONTATO COMERCIAL", 15, 95);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(data.sellerRole || "", 15, 102);
  doc.text(data.sellerEmail || "", 15, 109);
  doc.text(data.sellerPhone || "", 15, 116);

  return doc.output('blob');
};