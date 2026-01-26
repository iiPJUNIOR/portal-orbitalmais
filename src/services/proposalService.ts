import { Product } from "@/types/product";
import { generatePptxFromTemplate } from "@/utils/pptxTemplate";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
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

// Mapeamento de Produto -> Página do PDF (igual ao PPTX)
const MODEL_TO_SLIDE: Record<string, number> = {
  "idface pro": 19, "idface max": 20, "idaccess nano": 21, "idflex ip65": 22,
  "idflex pro": 23, "idaccess": 24, "idfit 4x2": 25, "idaccess pro": 26,
  "secbox": 27, "iduhf": 28, "iduhf lite": 29, "idblock next facial": 30,
  "idblock next biometria digital": 31, "idblock facial inox": 32,
  "idblock facial inox ": 32, "idblock facial preta": 33, "idblock facial mini preta": 34,
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
  // Mantendo a lógica do PPTX original...
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
 * PDF Generation with Coordinate Mapping
 */
export const generateProposalPDF = async (data: ProposalData): Promise<Blob> => {
  try {
    const templatePath = "/proposal-template.pdf";
    const existingPdfBytes = await fetch(templatePath).then(res => {
      if (!res.ok) throw new Error("Template PDF não encontrado em /public/proposal-template.pdf");
      return res.arrayBuffer();
    });

    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // --- CONFIGURAÇÃO DE COORDENADAS (AJUSTE AQUI) ---
    const config = {
      cover: {
        pageIndex: 0,
        companyName: { x: 50, y: 350, size: 28 },
        contactName: { x: 50, y: 320, size: 14 },
        proposalNumber: { x: 700, y: 30, size: 10 },
        date: { x: 700, y: 20, size: 10 },
      },
      summary: {
        pageIndex: 2, // Geralmente o terceiro slide (Apresentação do Projeto)
        itemsX: 60,
        itemsStartY: 450,
        totalX: 60,
        totalY: 100,
        totalSize: 22
      }
    };

    // 1. Preencher Capa
    const coverPage = pages[config.cover.pageIndex];
    if (coverPage) {
      coverPage.drawText(data.companyName.toUpperCase(), { 
        x: config.cover.companyName.x, 
        y: config.cover.companyName.y, 
        size: config.cover.companyName.size, 
        font: fontBold, 
        color: rgb(1, 1, 1) 
      });
      coverPage.drawText(`A/C: ${data.contactName}`, { 
        x: config.cover.contactName.x, 
        y: config.cover.contactName.y, 
        size: config.cover.contactName.size, 
        font: font, 
        color: rgb(0.9, 0.9, 0.9) 
      });
      coverPage.drawText(`NÚMERO: ${data.proposalNumber}`, { 
        x: config.cover.proposalNumber.x, 
        y: config.cover.proposalNumber.y, 
        size: config.cover.proposalNumber.size, 
        font, 
        color: rgb(0.8, 0.8, 0.8) 
      });
    }

    // 2. Preencher Lista de Produtos (Sumário)
    const summaryPage = pages[config.summary.pageIndex];
    if (summaryPage) {
      let currentY = config.summary.itemsStartY;
      data.items.forEach((it) => {
        summaryPage.drawText(`• ${it.product.description} x ${it.quantity}`, { 
          x: config.summary.itemsX, 
          y: currentY, 
          size: 11, 
          font 
        });
        currentY -= 18; // Espaçamento entre linhas
      });

      const computedTotal = (data.overrideTotal !== undefined && data.overrideTotal !== null)
        ? Number(data.overrideTotal)
        : (data.totalPrice || 0);
      const totalStr = new Intl.NumberFormat("pt-BR", { style: 'currency', currency: 'BRL' }).format(computedTotal);
      
      summaryPage.drawText(totalStr, { 
        x: config.summary.totalX, 
        y: config.summary.totalY, 
        size: config.summary.totalSize, 
        font: fontBold, 
        color: rgb(0.86, 0.08, 0.24) // Cor Vermelho Control iD
      });
    }

    // 3. Lógica de Pruning (Remover páginas não utilizadas)
    const keepPages = [1, 3, 4];
    for (let i = 5; i <= 18; i++) keepPages.push(i);
    keepPages.push(46, 55, 57);

    const hasCatraca = data.items.some(it => {
      const model = (it.product.model || "").toLowerCase();
      return model.includes("idblock") || model.includes("torniquete");
    });
    if (hasCatraca) keepPages.push(54);
    if (data.includeApprovalPage) keepPages.push(56);

    data.items.forEach(it => {
      const modelLower = (it.product.model || "").toLowerCase().trim();
      let foundSlide = MODEL_TO_SLIDE[modelLower];
      if (foundSlide) keepPages.push(foundSlide);
    });

    const pagesToKeepSorted = Array.from(new Set(keepPages)).sort((a, b) => a - b);
    const indicesToKeep = pagesToKeepSorted.map(n => n - 1).filter(idx => idx < pages.length);
    
    const finalPdf = await PDFDocument.create();
    const copiedPages = await finalPdf.copyPages(pdfDoc, indicesToKeep);
    copiedPages.forEach(page => finalPdf.addPage(page));

    const pdfBytes = await finalPdf.save();
    return new Blob([pdfBytes], { type: "application/pdf" });

  } catch (err: any) {
    console.error("Erro PDF:", err);
    throw err;
  }
};