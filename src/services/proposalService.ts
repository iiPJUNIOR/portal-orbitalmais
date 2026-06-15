import { Product } from "@/types/product";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { parseISO } from "date-fns";
import { getUserSettings } from "./settingsService";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

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
  contactGender?: string;
  email: string;
  phone: string;
  address: string;
  proposalDate: string;
  observations: string;
  priceModel: '12m' | '24m';
  items: QuoteItem[];
  proposalNumber?: string;
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
  ensaiosInclusos?: boolean;
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
    const day = String(dt.getDate()).padStart(2, "0");
    const month = String(dt.getMonth() + 1).padStart(2, "0");
    const year = dt.getFullYear();
    return `${day}-${month}-${year}`;
  } catch { 
    return dateStr || ""; 
  }
};

export const generateProposalNumber = (companyName?: string, sequence?: number): string => {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const formattedSeq = String(sequence || 1).padStart(3, "0");
  return `${companyName || "Proposta"} - ${datePart}-${formattedSeq}`;
};

const formatCurrencyBRL = (val: number): string => {
  return new Intl.NumberFormat("pt-BR", { 
    style: "currency",
    currency: "BRL"
  }).format(val);
};

export const cleanProposalNumber = (num: string): string => {
  const match = num.match(/OBM-\d+\s*-\s*REV\d+/i);
  if (match) return match[0].toUpperCase();
  const obm = num.match(/OBM-\d+/i);
  const rev = num.match(/REV\d+/i);
  if (obm && rev) return `${obm[0].toUpperCase()} - ${rev[0].toUpperCase()}`;
  return num;
};

function healDocxTokens(xml: string): string {
  if (!xml) return xml;
  const pRe = /<w:p(?: [\s\S]*?)?>([\s\S]*?)<\/w:p>/gi;
  return xml.replace(pRe, (pFull, pContent) => {
    if (!pContent.includes("{") && !pContent.includes("}")) return pFull;
    const tRe = /(<w:t[^>]*>)([\s\S]*?)(<\/w:t>)/gi;
    const runs: { open: string; text: string; close: string }[] = [];
    let m;
    while ((m = tRe.exec(pContent)) !== null)
      runs.push({ open: m[1], text: m[2], close: m[3] });
    if (runs.length <= 1) return pFull;
    let idx = 0;
    const healed = pContent.replace(tRe, () => {
      const r = runs[idx++];
      if (idx === 1) return r.open + runs.map((x) => x.text).join("") + r.close;
      return r.open + r.close;
    });
    const pOpen = pFull.match(/^<w:p(?: [\s\S]*?)?>/i)?.[0] || "<w:p>";
    return pOpen + healed + "</w:p>";
  });
}

function getFieldValue(field: string, data: ProposalData, settings?: any): any {
  const itemsSafe = data.items || [];
  const docxMappings = settings?.docx_mappings || {};
  const ensaiosYes = docxMappings["__ensaios_yes"] || "já";
  const ensaiosNo = docxMappings["__ensaios_no"] || "não";

  // Dynamic index-based resolution for SKU and Item Price
  if (field.startsWith("sku")) {
    const num = field.substring(3);
    const idx = num === "" ? 0 : parseInt(num, 10);
    if (!isNaN(idx) && itemsSafe[idx]) {
      const it = itemsSafe[idx];
      return it.product?.part_number || it.product?.description || "";
    }
    return "";
  }

  if (field.startsWith("valor_item")) {
    const num = field.substring(10);
    const idx = num === "" ? 0 : parseInt(num, 10);
    if (!isNaN(idx) && itemsSafe[idx]) {
      const it = itemsSafe[idx];
      return it.bonificado ? "R$ 0,00" : formatCurrencyBRL(it.unitPrice || 0);
    }
    return "";
  }

  if (field.startsWith("qtd") && field !== "quantidade") {
    const num = field.substring(3);
    const idx = num === "" ? 0 : parseInt(num, 10);
    if (!isNaN(idx) && itemsSafe[idx]) {
      const it = itemsSafe[idx];
      return it.quantity || 0;
    }
    return "";
  }

  switch (field) {
    case "vendedor": return data.sellerName || "";
    case "empresa": return data.companyName || "";
    case "cnpj": return data.cnpj || "";
    case "empresa_phone": return data.sellerPhone || "";
    case "empresa_email": return data.sellerEmail || "";
    case "contato_nome": {
      const prefix = data.contactGender === "M" ? "Sr. " : data.contactGender === "F" ? "Sra. " : "";
      return prefix + (data.contactName || "");
    }
    case "contato_telefone": return data.phone || "";
    case "rua": return data.address || "";
    case "endereco": return data.address || "";
    case "observacoes": return data.observations || "";
    case "quantidade": return itemsSafe.reduce((sum, it) => sum + (it.quantity || 0), 0);
    case "produto": return itemsSafe.map(it => `${it.product?.description || ""} (Qtd: ${it.quantity || 0})`).join(", ");
    case "valor": {
      const computedTotal = (data.overrideTotal !== undefined && data.overrideTotal !== null)
        ? Number(data.overrideTotal)
        : (data.totalPrice || 0);
      return formatCurrencyBRL(computedTotal);
    }
    case "data": return formatDateForProposal(data.proposalDate);
    case "numeroproposta": {
      return cleanProposalNumber(data.proposalNumber || "");
    }
    case "numerodaproposta": {
      const match = String(data.proposalNumber || "").match(/OBM-\d+/i);
      if (match) return match[0].toUpperCase();
      const seqMatch = String(data.proposalNumber || "").match(/\d+/);
      return seqMatch ? `OBM-${seqMatch[0].padStart(3, "0")}` : "OBM-001";
    }
    case "numerorev": {
      const rev = String(data.version || "0");
      return rev.startsWith("REV") ? rev.toUpperCase() : `REV${rev}`;
    }
    case "versao": return data.version || "0";
    case "ensaios_inclusos": {
      const isIncluded = data.ensaiosInclusos ?? itemsSafe.some(it => it.ensaiosInclusos);
      return isIncluded ? ensaiosYes : ensaiosNo;
    }
    default: return "";
  }
}

function wrapRowsInLoop(xml: string, docxMappings: Record<string, string>): string {
  const itemLevelFields = ["sku", "produto", "quantidade", "qtd", "valor_item", "valor"];
  
  const itemTokens = Object.entries(docxMappings)
    .filter(([token, field]) => itemLevelFields.includes(field) && !token.startsWith("__"))
    .map(([token]) => token);
    
  let currentXml = xml;
  
  for (const token of itemTokens) {
    const tokenRegex = new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`, "gi");
    let match;
    
    while ((match = tokenRegex.exec(currentXml)) !== null) {
      const tokenIdx = match.index;
      const openTrIdx = currentXml.lastIndexOf("<w:tr", tokenIdx);
      const closeTrIdx = currentXml.indexOf("</w:tr>", tokenIdx);
      
      if (openTrIdx !== -1 && closeTrIdx !== -1 && openTrIdx < tokenIdx && tokenIdx < closeTrIdx) {
        const rowContent = currentXml.substring(openTrIdx, closeTrIdx + 7);
        const isAlreadyWrapped = openTrIdx >= 10 && currentXml.substring(openTrIdx - 10, openTrIdx) === "{{#items}}";
        if (!isAlreadyWrapped) {
          const before = currentXml.substring(0, openTrIdx);
          const after = currentXml.substring(closeTrIdx + 7);
          currentXml = before + `{{#items}}` + rowContent + `{{/items}}` + after;
          
          // Reset the regex index past the newly inserted tags to avoid duplicate processing
          tokenRegex.lastIndex = openTrIdx + 11 + rowContent.length;
        }
      }
    }
  }
  
  return currentXml;
}

export const generateProposalDOCX = async (data: ProposalData): Promise<Blob> => {
  try {
    // Busca configurações do usuário para mapeamentos dinâmicos
    const settings = await getUserSettings();

    const computedTotal = (data.overrideTotal !== undefined && data.overrideTotal !== null)
      ? Number(data.overrideTotal)
      : (data.totalPrice || 0);

    const formattedTotal = new Intl.NumberFormat("pt-BR", { 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true
    }).format(computedTotal);

    // 1. Fetch template from candidates
    const candidateUrls: string[] = [];
    if (settings?.pptx_template_url) {
      candidateUrls.push(settings.pptx_template_url);
    }
    candidateUrls.push(encodeURI("/proposal-template-default.docx"));

    let arrayBuffer: ArrayBuffer | null = null;
    let loadedUrl = "";

    for (const url of candidateUrls) {
      try {
        const safeUrl = url.startsWith("http") ? url : encodeURI(decodeURIComponent(url));
        const resp = await fetch(safeUrl);
        if (!resp.ok) continue;
        arrayBuffer = await resp.arrayBuffer();
        loadedUrl = url;
        break;
      } catch {
        continue;
      }
    }

    if (!arrayBuffer) {
      throw new Error("Não foi possível carregar o template da proposta.");
    }

    // Check if it is a DOCX file
    const zip = new PizZip(arrayBuffer);
    const isDocx = zip.file("word/document.xml") !== null;

    if (!isDocx) {
      throw new Error("O template da proposta deve ser um arquivo no formato Word (.docx).");
    }

    const docxMappings = settings?.docx_mappings || {};
    const ensaiosYes = docxMappings["__ensaios_yes"] || "já";
    const ensaiosNo = docxMappings["__ensaios_no"] || "não";

    // Process as DOCX
    const xmlFiles = Object.keys(zip.files).filter(fn => fn.endsWith(".xml") && fn.startsWith("word/"));
    xmlFiles.forEach(fn => {
      const f = zip.file(fn);
      if (f) {
        let content = healDocxTokens(f.asText());
        content = wrapRowsInLoop(content, docxMappings);
        zip.file(fn, content);
      }
    });

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => "",
      delimiters: { start: "{{", end: "}}" },
    });

    const replacements: Record<string, any> = {
      companyName: data.companyName || "",
      contactName: (() => {
        const prefix = data.contactGender === "M" ? "Sr. " : data.contactGender === "F" ? "Sra. " : "";
        return prefix + (data.contactName || "");
      })(),
      date: formatDateForProposal(data.proposalDate),
      proposalNumber: cleanProposalNumber(data.proposalNumber || ""),
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
      observations: data.observations || "",
    };

    const itemsSafe = data.items || [];

    // Add item list variables for loops
    replacements["items"] = itemsSafe.map((it, idx) => {
      const itemObj: Record<string, any> = {
        index: idx + 1,
        description: it.product?.description || "",
        observacao: it.product?.custom_fields?.observacao || "",
        observacoes: it.product?.custom_fields?.observacao || "",
        model: it.product?.model || "",
        category: it.product?.category || "",
        sku: it.product?.part_number || it.product?.description || "",
        quantity: it.quantity || 0,
        bonificado: it.bonificado ? "Sim" : "Não",
        ensaiosInclusos: it.ensaiosInclusos ? ensaiosYes : ensaiosNo,
        unitPrice: it.bonificado ? "R$ 0,00" : formatCurrencyBRL(it.unitPrice ?? it.product?.value_12m ?? it.product?.value_24m ?? 0),
        totalItemPrice: it.bonificado ? "R$ 0,00" : formatCurrencyBRL((it.unitPrice ?? it.product?.value_12m ?? it.product?.value_24m ?? 0) * (it.quantity || 0)),
      };

      // Inject resolved mapped fields into the item scope
      Object.entries(docxMappings).forEach(([token, field]) => {
        if (token && !token.startsWith("__") && field && field !== "none") {
          if (field === "sku") {
            itemObj[token] = it.product?.part_number || it.product?.description || "";
          } else if (field === "produto") {
            itemObj[token] = it.product?.description || it.product?.model || "";
          } else if (field === "quantidade" || field === "qtd") {
            itemObj[token] = it.quantity || 0;
          } else if (field === "valor_item") {
            const price = it.bonificado ? 0 : (it.unitPrice ?? it.product?.value_12m ?? it.product?.value_24m ?? 0);
            itemObj[token] = formatCurrencyBRL(price);
          } else if (field === "valor") {
            const price = it.bonificado ? 0 : (it.unitPrice ?? it.product?.value_12m ?? it.product?.value_24m ?? 0);
            itemObj[token] = formatCurrencyBRL(price * (it.quantity || 0));
          }
        }
      });

      return itemObj;
    });

    // Flatten items for legacy template compatibility
    replacements["items_list"] = itemsSafe[0] ? (itemsSafe[0].product?.description || "") : "";
    replacements["qtd"] = itemsSafe[0] ? (itemsSafe[0].quantity || 0) : "";
    replacements["items_list1"] = itemsSafe[1] ? (itemsSafe[1].product?.description || "") : "";
    replacements["qtd1"] = itemsSafe[1] ? (itemsSafe[1].quantity || 0) : "";
    replacements["items_list2"] = itemsSafe[2] ? (itemsSafe[2].product?.description || "") : "";
    replacements["qtd2"] = itemsSafe[2] ? (itemsSafe[2].quantity || 0) : "";

    // Custom user settings mappings
    Object.entries(docxMappings).forEach(([token, field]) => {
      if (!token || !field || field === "none") return;
      replacements[token] = getFieldValue(field, data, settings);
    });

    // Robust fallback casing
    const finalReplacements: Record<string, any> = {};
    Object.entries(replacements).forEach(([k, v]) => {
      finalReplacements[k] = v;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        finalReplacements[k.toLowerCase()] = v;
        finalReplacements[k.toUpperCase()] = v;
      }
    });

    doc.setData(finalReplacements);
    doc.render();

    return doc.getZip().generate({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  } catch (err) {
    console.error("Erro na geração da proposta:", err);
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
  
  const colors: { primary: [number, number, number]; accent: [number, number, number]; light: [number, number, number]; text: [number, number, number]; white: [number, number, number] } = {
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
    doc.text("Orbital Mais", 15, 12);
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
  doc.text(`NÚMERO: ${cleanProposalNumber(data.proposalNumber || "")}`, width - 20, height - 15, { align: 'right' });
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
  const introText = "A Orbital Mais é especialista em fornecer soluções de ponta em tecnologia, segurança e controle de acesso. Com foco na excelência e atendimento sob medida, entregamos soluções que combinam robustez com usabilidade intuitiva.";
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
    styles: { fontSize: 13, cellPadding: 5, textColor: colors.text },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60, textColor: colors.accent } }
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
    headStyles: { fillColor: colors.primary, textColor: colors.white, fontSize: 10, halign: 'center' },
    styles: { fontSize: 10, cellPadding: 6 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 20 },
      2: { halign: 'center', cellWidth: 20 },
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

export const generateServiceDOCX = async (form: any): Promise<Blob> => {
  const settings = await getUserSettings();
  const serviceMappings = settings?.service_docx_mappings || {};
  const serviceDocxUrl = settings?.service_docx_url || "/service-template-default.docx";

  const isServiceItem = (item: any) => {
    const cat = (item.category || "").toLowerCase();
    const desc = (item.description || "").toLowerCase();
    const model = (item.model || item.name || "").toLowerCase();
    return cat.includes("serviço") || cat.includes("suporte") || cat.includes("instalação") || desc.includes("software") || desc.includes("idsocial") || desc.includes("idsecure") || model.includes("idpower");
  };

  const buildItemsText = (): string =>
    (form.selectedProducts || []).map((p: any) => `• ${p.name || p.model} (Qtd: ${p.quantity})`).join("\n");

  const serviceProducts = (form.selectedProducts || []).filter((p: any) => isServiceItem(p));
  const combinedServiceDesc = serviceProducts
    .map((p: any, idx: number) => {
      const desc = (p.description || "").trim();
      return desc ? `2.${idx + 1} ${desc}` : "";
    })
    .filter(Boolean)
    .join("\n");

  const combinedServiceObs = serviceProducts
    .map((p: any, idx: number) => {
      const obs = (p.custom_fields?.observacao || "").trim();
      return obs ? `• 2.${idx + 1} ${obs}` : null;
    })
    .filter(Boolean)
    .join("  ");

  const formFields: Record<string, any> = {
    datadoorçamento: formatDateForProposal(form.date),
    razaosocial: form.companyName || "",
    emaildocliente: form.email || "", 
    tipodeservico: form.tipoServico || "",
    dependencias: form.dependencias || "",
    tipodematerial: form.tipoMaterial || "",
    tipodejunta: form.tipoJunta || "",
    descricaodoservico: combinedServiceDesc || form.observations || "",
    numerodesoldas: form.numeroSoldas || "",
    obsservicos: combinedServiceObs || form.observations || "",
    responsabilidadeorbital: (form.respOrbital || [])
      .map((id: string) => (settings?.responsabilidades_orbital || []).find((r) => r.id === id)?.label)
      .filter(Boolean)
      .map((label: string, idx: number) => `3.${idx + 1} ${label}`)
      .join('\n') || "",
    responsabilidadedocliente: (form.respCliente || [])
      .map((id: string) => (settings?.responsabilidades_cliente || []).find((r) => r.id === id)?.label)
      .filter(Boolean)
      .map((label: string, idx: number) => `4.${idx + 1} ${label}`)
      .join('\n') || "",
    prazoexec: form.prazo || "",
    corpodeprova: form.usaEpsOrbital === false
      ? "+1 para mobilização e soldagem do mock-up"
      : "",
    precototal: form.totalPrice || "",
    porcentagementrada: form.porcentagemEntrada ? `${form.porcentagemEntrada}%` : "",
    porcentagemfinal: form.porcentagemFinal ? `${form.porcentagemFinal}%` : "",
    diaspquitcao: form.diasQuitacao || "",
    obsresponsabildiadecliente: form.obsResponsabilidadeCliente || "",
    numerodaproposta: (() => {
      const match = String(form.proposalNumber || "").match(/OBM-\d+/i);
      return match ? match[0].toUpperCase() : `OBM-001`;
    })(),
    numerorev: `REV${form.version || "0"}`,

    // Backward compatibility default keys
    nomevendedor: form.sellerName || "",
    cargovendedor: form.sellerRole || "",
    emailvendedor: form.sellerEmail || "",
    telvendedor: form.sellerPhone || "",
    empresa: form.companyName || "",
    cnpj: form.cnpj || "",
    nomecliente: (() => {
      const prefix = form.contactGender === "M" ? "Sr. " : form.contactGender === "F" ? "Sra. " : "";
      return prefix + (form.contactName || "");
    })(),
    nomedocliente: (() => {
      const prefix = form.contactGender === "M" ? "Sr. " : form.contactGender === "F" ? "Sra. " : "";
      return prefix + (form.contactName || "");
    })(),
    endereco: form.address || "",
    produto: buildItemsText(),
    qtd: String((form.selectedProducts || []).length),
    valor: form.totalPrice || "",
    numeroproposta: (() => {
      const num = form.proposalNumber || "";
      const match = num.match(/OBM-\d+\s*-\s*REV\d+/i);
      if (match) return match[0].toUpperCase();
      const obm = num.match(/OBM-\d+/i);
      const rev = num.match(/REV\d+/i);
      if (obm && rev) return `${obm[0].toUpperCase()} - ${rev[0].toUpperCase()}`;
      return num;
    })(),
    versao: form.version || "",
    data: formatDateForProposal(form.date),
    obs: form.observations || "",
  };

  const docxData: Record<string, any> = {};
  
  // 1. Resolve tokens through configured settings mappings
  Object.entries(serviceMappings).forEach(([token, field]) => {
    if (!token || !field || field === "none") return;
    docxData[token] = formFields[field] || "";
  });

  // 2. Default fallback: directly map any key in formFields if not present in docxData
  Object.entries(formFields).forEach(([k, v]) => {
    if (docxData[k] === undefined) {
      docxData[k] = v;
    }
  });

  // Also inject lower/upper case variants to match Docxtemplater flexibility
  const finalDocxData: Record<string, string> = {};
  Object.entries(docxData).forEach(([k, v]) => {
    finalDocxData[k] = String(v);
    finalDocxData[k.toLowerCase()] = String(v);
    finalDocxData[k.toUpperCase()] = String(v);
  });

  // Fetch the template
  const safeUrl = serviceDocxUrl.startsWith("http") ? serviceDocxUrl : encodeURI(decodeURIComponent(serviceDocxUrl));
  const res = await fetch(safeUrl);
  if (!res.ok) throw new Error(`Template DOCX não encontrado: ${serviceDocxUrl}`);
  const buf = await res.arrayBuffer();
  const zip = new PizZip(buf);

  const healDocxTokens = (xml: string): string => {
    if (!xml) return xml;
    const paragraphRegex = /<w:p(?: [\s\S]*?)?>([\s\S]*?)<\/w:p>/gi;
    return xml.replace(paragraphRegex, (pFull, pContent) => {
      if (!pContent.includes("{") && !pContent.includes("}")) return pFull;
      const textNodeRegex = /(<w:t[^>]*>)([\s\S]*?)(<\/w:t>)/gi;
      const runs: { open: string; text: string; close: string }[] = [];
      let m;
      while ((m = textNodeRegex.exec(pContent)) !== null) {
        runs.push({ open: m[1], text: m[2], close: m[3] });
      }
      if (runs.length <= 1) return pFull;
      let runIndex = 0;
      const healedContent = pContent.replace(textNodeRegex, () => {
        const r = runs[runIndex++];
        if (runIndex === 1) {
          const fullText = runs.map((run) => run.text).join("");
          return r.open + fullText + r.close;
        }
        return r.open + r.close;
      });
      const pOpen = pFull.match(/^<w:p(?: [\s\S]*?)?>/i)?.[0] || "<w:p>";
      return pOpen + healedContent + "</w:p>";
    });
  };

  for (const fn of ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/header3.xml"]) {
    const f = zip.file(fn);
    if (f) zip.file(fn, healDocxTokens(f.asText()));
  }

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
    delimiters: { start: "{{", end: "}}" },
  });

  doc.setData(finalDocxData);
  doc.render();

  return doc.getZip().generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
};