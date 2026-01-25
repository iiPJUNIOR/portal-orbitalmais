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
      totalPrice: new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(computedTotal),
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
    keepSlides.push(46, 57);

    const hasCatraca = data.items.some(it => {
      const cat = (it.product.category || "").toLowerCase();
      const model = (it.product.model || "").toLowerCase();
      return cat.includes("catraca") || cat.includes("torniquete") || model.includes("idblock") || model.includes("torniquete");
    });

    if (hasCatraca) {
      keepSlides.push(54, 55);
    }

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
 * Mimics the presentation layout slide-by-slide
 */
export const generateProposalPDF = async (data: ProposalData): Promise<Blob> => {
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4', unit: 'mm' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  
  // Color Palette Control iD
  const colors = {
    primary: [20, 20, 20], // Neutral 900
    accent: [220, 20, 60],  // Crimson Red
    light: [245, 245, 245],
    text: [40, 40, 40],
    white: [255, 255, 255]
  };

  const drawSlideBase = (title?: string) => {
    // Top Bar
    doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.rect(0, 0, width, 18, 'F');
    
    // Logo Text Replacement (Control iD Style)
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Control iD", 15, 12);
    
    if (title) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(title.toUpperCase(), width - 15, 11.5, { align: 'right' });
    }
    
    // Footer decoration
    doc.setFillColor(colors.accent[0], colors.accent[1], colors.accent[2]);
    doc.rect(0, height - 2, width, 2, 'F');
  };

  // 1. CAPA (Slide 1)
  doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.rect(0, 0, width, height, 'F');
  
  // Gradient/Accent bar
  doc.setFillColor(colors.accent[0], colors.accent[1], colors.accent[2]);
  doc.rect(0, height * 0.7, width * 0.4, 15, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(48);
  doc.text("PROPOSTA", 20, height * 0.35);
  doc.text("COMERCIAL", 20, height * 0.52);

  doc.setFontSize(18);
  doc.setFont("helvetica", "normal");
  doc.text(data.companyName.toUpperCase(), 20, height * 0.75 + 10);
  doc.setFontSize(14);
  doc.text(`A/C: ${data.contactName}`, 20, height * 0.75 + 20);
  
  doc.setFontSize(10);
  doc.text(`NÚMERO: ${data.proposalNumber}`, width - 20, height - 15, { align: 'right' });
  doc.text(`DATA: ${formatDateForProposal(data.proposalDate)}`, width - 20, height - 10, { align: 'right' });

  // 2. INSTITUCIONAL (Slide 3/4)
  doc.addPage();
  drawSlideBase("Quem Somos");
  doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.setFontSize(32);
  doc.setFont("helvetica", "bold");
  doc.text("Inovação e Tecnologia", 15, 45);
  doc.text("100% Brasileira", 15, 58);
  
  doc.setFillColor(colors.accent[0], colors.accent[1], colors.accent[2]);
  doc.rect(15, 65, 40, 2, 'F');

  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  const introText = "A Control iD é uma empresa nacional, líder no desenvolvimento de hardware e software para controle de acesso e automação. Com design moderno e fabricação própria, entregamos soluções que combinam segurança extrema com usabilidade intuitiva.";
  doc.text(doc.splitTextToSize(introText, width - 60), 15, 80);

  // 3. IDENTIFICAÇÃO DO PROJETO
  doc.addPage();
  drawSlideBase("Dados do Cliente");
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text("Dados da Empresa", 15, 40);

  autoTable(doc, {
    startY: 50,
    margin: { left: 15 },
    body: [
      ["RAZÃO SOCIAL", data.companyName],
      ["CNPJ", data.cnpj],
      ["ENDEREÇO", data.address || "Não informado"],
      ["RESPONSÁVEL", data.contactName],
      ["E-MAIL", data.email],
      ["TELEFONE", data.phone || "Não informado"],
    ],
    theme: 'plain',
    styles: { fontSize: 13, cellPadding: 5, textColor: [50, 50, 50] },
    columnStyles: { 0: { fontStyle: 'bold', width: 60, textColor: colors.accent } }
  });

  // 4. ESPECIFICAÇÕES TÉCNICAS (Slide-per-product)
  data.items.forEach(item => {
    doc.addPage();
    drawSlideBase("Detalhamento Técnico");
    
    // Header do Produto
    doc.setFillColor(colors.light[0], colors.light[1], colors.light[2]);
    doc.rect(15, 25, width - 30, 25, 'F');
    
    doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text(item.product.description, 20, 42);
    
    // Content
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("SOLUÇÃO PROPOSTA:", 15, 65);
    
    const bulletPoints = [
      "• Processamento de alta performance para reconhecimento instantâneo.",
      "• Integração nativa com ecossistema iDSecure.",
      "• Interface visual moderna e amigável ao usuário.",
      "• Durabilidade industrial com acabamento premium.",
      `• Quantidade considerada no projeto: ${item.quantity} unidade(s).`
    ];
    
    bulletPoints.forEach((bp, i) => {
      doc.text(bp, 20, 75 + (i * 10));
    });

    // Sidebar/Accent
    doc.setFillColor(colors.accent[0], colors.accent[1], colors.accent[2]);
    doc.rect(width - 50, 60, 35, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.text(String(item.quantity), width - 32.5, 83, { align: 'center' });
    doc.setFontSize(8);
    doc.text("QTD", width - 32.5, 88, { align: 'center' });
  });

  // 5. RESUMO FINANCEIRO (Slide 46)
  doc.addPage();
  drawSlideBase("Investimento");
  doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.text("Proposta Comercial", 15, 40);

  autoTable(doc, {
    startY: 50,
    margin: { left: 15, right: 15 },
    head: [['ITEM', 'DESCRIÇÃO DOS EQUIPAMENTOS E SERVIÇOS', 'QTD', 'SITUAÇÃO']],
    body: data.items.map((it, idx) => [
      String(idx + 1).padStart(2, '0'),
      it.product.description.toUpperCase(),
      it.quantity,
      "INCLUSO NO PACOTE"
    ]),
    theme: 'grid',
    headStyles: { fillColor: colors.primary, textColor: 255, fontSize: 10, halign: 'center' },
    styles: { fontSize: 10, cellPadding: 6 },
    columnStyles: { 
      0: { halign: 'center', width: 20 },
      2: { halign: 'center', width: 20 },
      3: { halign: 'center', fontStyle: 'bold', textColor: colors.accent }
    }
  });

  const finalY = (doc as any).lastAutoTable.finalY;
  const computedTotal = (data.overrideTotal !== undefined && data.overrideTotal !== null)
    ? Number(data.overrideTotal)
    : (data.totalPrice || 0);

  // Total Box
  doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.rect(width - 120, finalY + 10, 105, 30, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text("VALOR TOTAL DO INVESTIMENTO", width - 110, finalY + 20);
  doc.setFontSize(26);
  doc.setFont("helvetica", "bold");
  doc.text(`R$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(computedTotal)}`, width - 110, finalY + 33);

  // 6. CONTATO (Slide 57)
  doc.addPage();
  drawSlideBase("Encerramento");
  
  doc.setFillColor(colors.light[0], colors.light[1], colors.light[2]);
  doc.rect(0, 0, width * 0.4, height, 'F');
  
  doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.setFontSize(32);
  doc.text("Vamos tirar seu", 15, 45);
  doc.text("projeto do papel?", 15, 58);
  
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(data.sellerName?.toUpperCase() || "CONTATO COMERCIAL", 15, 90);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(data.sellerRole || "", 15, 97);
  doc.text(data.sellerEmail || "", 15, 104);
  doc.text(data.sellerPhone || "", 15, 111);

  // 7. APROVAÇÃO (Slide 56)
  if (data.includeApprovalPage) {
    doc.addPage();
    doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.rect(0, 0, width, height, 'F');
    
    doc.setFillColor(colors.accent[0], colors.accent[1], colors.accent[2]);
    const btnW = 120;
    const btnH = 20;
    const btnX = (width - btnW) / 2;
    const btnY = (height - btnH) / 2;
    doc.rect(btnX, btnY, btnW, btnH, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("CLIQUE AQUI PARA APROVAR", width / 2, height / 2 + 2, { align: 'center' });
    
    if (data.approvalLink) {
      doc.link(btnX, btnY, btnW, btnH, { url: data.approvalLink });
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(150, 150, 150);
      doc.text(data.approvalLink, width / 2, height / 2 + 18, { align: 'center' });
    }
  }

  return doc.output('blob');
};