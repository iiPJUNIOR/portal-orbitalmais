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
 * PDF Generation using pdf-lib to overlay data on a template.
 * For this to work exactly like the PPTX, you MUST have a proposal-template.pdf 
 * in the public folder that is an export of your PPTX template.
 */
export const generateProposalPDF = async (data: ProposalData): Promise<Blob> => {
  try {
    // 1. Fetch the PDF Template
    const templatePath = "/proposal-template.pdf";
    const existingPdfBytes = await fetch(templatePath).then(res => {
      if (!res.ok) throw new Error("Template PDF não encontrado. Por favor, exporte seu PPTX como PDF e salve como 'proposal-template.pdf' na pasta public.");
      return res.arrayBuffer();
    });

    // 2. Load the PDF
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // 3. Define the pages to keep (same logic as PPTX)
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
    
    // 4. Fill data on the first page (Cover)
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();
    
    firstPage.drawText(data.companyName.toUpperCase(), { x: 50, y: height - 150, size: 24, font: fontBold, color: rgb(1, 1, 1) });
    firstPage.drawText(`A/C: ${data.contactName}`, { x: 50, y: height - 180, size: 14, font, color: rgb(1, 1, 1) });
    firstPage.drawText(`NÚMERO: ${data.proposalNumber}`, { x: width - 150, y: 50, size: 10, font, color: rgb(1, 1, 1) });

    // 5. Fill items list (usually on a specific summary page, e.g., page 3 or 4)
    // For now, drawing on page 3 as a fallback (adjust coordinates based on your template)
    if (pages.length >= 3) {
      const summaryPage = pages[2]; 
      let yPos = height - 100;
      data.items.forEach((it, idx) => {
        summaryPage.drawText(`${it.product.description} x ${it.quantity}`, { x: 50, y: yPos, size: 11, font });
        yPos -= 20;
      });
      
      const computedTotal = (data.overrideTotal !== undefined && data.overrideTotal !== null)
        ? Number(data.overrideTotal)
        : (data.totalPrice || 0);
      const totalStr = new Intl.NumberFormat("pt-BR", { style: 'currency', currency: 'BRL' }).format(computedTotal);
      summaryPage.drawText(totalStr, { x: 50, y: yPos - 40, size: 20, font: fontBold, color: rgb(0.86, 0.08, 0.24) });
    }

    // 6. Prune the document to keep only selected pages
    // Note: PDF pages are 0-indexed, keepPages are 1-indexed
    const indicesToKeep = pagesToKeepSorted.map(n => n - 1).filter(idx => idx < pages.length);
    
    // Create a new document to copy pages into (this is cleaner for pruning)
    const finalPdf = await PDFDocument.create();
    const copiedPages = await finalPdf.copyPages(pdfDoc, indicesToKeep);
    copiedPages.forEach(page => finalPdf.addPage(page));

    // 7. Save and Return
    const pdfBytes = await finalPdf.save();
    return new Blob([pdfBytes], { type: "application/pdf" });

  } catch (err: any) {
    console.error("Erro PDF:", err);
    throw err;
  }
};