import { Product } from "@/types/product";
import { generatePptxFromTemplate } from "@/utils/pptxTemplate";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { parseISO } from "date-fns";
import { getUserSettings } from "./settingsService";

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

const DEFAULT_MODEL_TO_SLIDE: Record<string, number> = {
  "idface pro": 19, 
  "idface max": 20, 
  "idaccess nano": 21, 
  "idflex ip65": 22,
  "idflex pro": 23, 
  "idaccess": 24, 
  "idfit 4x2": 25, 
  "idaccess pro": 26,
  "secbox": 27, 
  "iduhf": 28, 
  "iduhf lite": 29, 
  "idblock next facial": 30,
  "idblock next": 30,
  "id block next": 30,
  "idblock next biometria digital": 31, 
  "idblock facial inox": 32,
  "idblock facial preta": 33, 
  "idblock facial mini preta": 34,
  "idblock facial mini inox": 35, 
  "idblock inox biométrica": 36,
  "idblock preta biométrica": 37, 
  "idblock braço articulado inox": 38,
  "idblock braço articulado preta": 39, 
  "idblock balcão": 40,
  "idblock pne": 41, 
  "torniquete fet 100": 42, 
  "idpower": 43,
  "idprox usb": 44, 
  "idbio": 45,
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
    const settings = await getUserSettings();
    const userMappings = settings?.slide_mappings || {};
    
    // Mesclar mapeamentos (usuário tem prioridade)
    const activeMappings = { ...DEFAULT_MODEL_TO_SLIDE, ...userMappings };

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

    replacements["items_list"] = data.items[0] ? (data.items[0].product.description || data.items[0].product.model) : "";
    replacements["qtd"] = data.items[0] ? data.items[0].quantity : "";
    replacements["items_list1"] = data.items[1] ? (data.items[1].product.description || data.items[1].product.model) : "";
    replacements["qtd1"] = data.items[1] ? data.items[1].quantity : "";
    replacements["items_list2"] = data.items[2] ? (data.items[2].product.description || data.items[2].product.model) : "";
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

    if (hasCatraca) {
      keepSlides.push(54);
    }

    if (data.includeApprovalPage) keepSlides.push(56);

    data.items.forEach(it => {
      const modelLower = (it.product.model || "").toLowerCase().trim();
      const modelNoSpace = modelLower.replace(/\s+/g, "");
      
      let foundSlide: number | undefined;
      
      // Busca direta no dicionário mesclado
      if (activeMappings[modelLower]) {
        foundSlide = activeMappings[modelLower];
      } else {
        // Busca flexível removendo espaços
        for (const [key, slide] of Object.entries(activeMappings)) {
          const keyNoSpace = key.replace(/\s+/g, "");
          if (modelNoSpace.includes(keyNoSpace) || keyNoSpace.includes(modelNoSpace)) {
            foundSlide = slide;
            break;
          }
        }
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
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4', unit: 'mm' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  
  const colors = {
    primary: [20, 20, 20], 
    accent: [220, 20, 60],  
    light: [245, 245, 245],
    text: [40, 40, 40],
    white: [255, 255, 255]
  };

  const drawSlideBase = (title?: string) => {
    doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.rect(0, 0, width, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Control iD", 15, 12);
    if (title) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(title.toUpperCase(), width - 15, 11.5, { align: 'right' });
    }
    doc.setFillColor(colors.accent[0], colors.accent[1], colors.accent[2]);
    doc.rect(0, height - 2, width, 2, 'F');
  };

  doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.rect(0, 0, width, height, 'F');
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

  data.items.forEach(item => {
    doc.addPage();
    drawSlideBase("Detalhamento Técnico");
    doc.setFillColor(colors.light[0], colors.light[1], colors.light[2]);
    doc.rect(15, 25, width - 30, 25, 'F');
    doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text(item.product.description, 20, 42);
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
    doc.setFillColor(colors.accent[0], colors.accent[1], colors.accent[2]);
    doc.rect(width - 50, 60, 35, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.text(String(item.quantity), width - 32.5, 83, { align: 'center' });
    doc.setFontSize(8);
    doc.text("QTD", width - 32.5, 88, { align: 'center' });
  });

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
  const formattedTotal = new Intl.NumberFormat("pt-BR", { 
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true
  }).format(computedTotal);
  doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.rect(width - 120, finalY + 10, 105, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text("VALOR TOTAL DO INVESTIMENTO", width - 110, finalY + 20);
  doc.setFontSize(26);
  doc.setFont("helvetica", "bold");
  doc.text(`R$ ${formattedTotal}`, width - 110, finalY + 33);

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