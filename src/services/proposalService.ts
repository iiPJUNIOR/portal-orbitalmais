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
    return `${day}/${month}/${year}`;
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
  // If the document already contains an items loop, do not wrap it again!
  if (xml.includes("{{#items}}") || xml.includes("{{#items")) {
    return xml;
  }

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

    const formattedTotal = formatCurrencyBRL(computedTotal);
    const formattedTotalRaw = new Intl.NumberFormat("pt-BR", { 
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

    const proposalDateVal = data.proposalDate || (data as any).date;
    const formattedProposalDate = formatDateForProposal(proposalDateVal);
    const cleanProposalNum = cleanProposalNumber(data.proposalNumber || (data as any).number || "");
    const contactWithPrefix = (() => {
      const prefix = data.contactGender === "M" ? "Sr. " : data.contactGender === "F" ? "Sra. " : "";
      return prefix + (data.contactName || "");
    })();

    const rawItems: any[] = (data.items && data.items.length > 0)
      ? data.items
      : ((data as any).selectedProducts && (data as any).selectedProducts.length > 0)
        ? (data as any).selectedProducts
        : [];

    const isEnsaioIncluded = data.ensaiosInclusos ?? rawItems.some((it: any) => it.ensaiosInclusos);
    const ensaiolabVal = isEnsaioIncluded ? ensaiosYes : ensaiosNo;

    const replacements: Record<string, any> = {
      // Data
      data: formattedProposalDate,
      date: formattedProposalDate,
      datada_proposta: formattedProposalDate,
      datadoorçamento: formattedProposalDate,
      datadoorcamento: formattedProposalDate,

      // Proposta
      numerodaproposta: cleanProposalNum,
      numeroproposta: cleanProposalNum,
      proposalNumber: cleanProposalNum,
      numerorev: String(data.version || "0").toUpperCase().startsWith("REV") ? String(data.version).toUpperCase() : `REV${data.version || "0"}`,
      versao: String(data.version || "0"),

      // Cliente / Contato
      nomedocliente: contactWithPrefix,
      nomecliente: contactWithPrefix,
      contato_nome: contactWithPrefix,
      contactName: contactWithPrefix,

      // Empresa
      razaosocial: data.companyName || (data as any).empresa || "",
      empresa: data.companyName || (data as any).empresa || "",
      companyName: data.companyName || (data as any).empresa || "",

      // Documentos e Endereço
      cnpj: data.cnpj || "",
      CNPJ: data.cnpj || "",
      endereco: data.address || (data as any).endereco || "",
      endereço: data.address || (data as any).endereco || "",
      rua: data.address || (data as any).endereco || "",

      // Contato direto
      email: data.email || "",
      emaildocliente: data.email || "",
      telefone: data.phone || (data as any).telefone || "",
      contato_telefone: data.phone || (data as any).telefone || "",

      // Vendedor
      vendedor: data.sellerName || "",
      sellerName: data.sellerName || "",
      cargovendedor: data.sellerRole || "",
      sellerRole: data.sellerRole || "",
      emailvendedor: data.sellerEmail || "",
      sellerEmail: data.sellerEmail || "",
      empresa_email: data.sellerEmail || "",
      telvendedor: data.sellerPhone || "",
      sellerPhone: data.sellerPhone || "",
      empresa_phone: data.sellerPhone || "",

      // Totais
      valtotal: formattedTotal,
      valor: formattedTotal,
      valortotal: formattedTotal,
      totalPrice: formattedTotal,
      precototal: formattedTotalRaw,

      // Ensaios
      ensaiolab: ensaiolabVal,
      ensaios_inclusos: ensaiolabVal,
      ensaiosInclusos: ensaiolabVal,

      // Observações
      observacoes: data.observations || "",
      observacao: data.observations || "",
      obs: data.observations || "",
      observations: data.observations || "",
      obsorca: data.observations || "",

      users: data.users || 0,
      devices: data.devices || 0,
      approvalLink: data.approvalLink || "",
      quantidade: rawItems.reduce((sum, it) => sum + (Number(it.quantity ?? it.qtd ?? 1) || 0), 0),
    };

    // Add item list variables for loops
    replacements["items"] = rawItems.map((it: any, idx: number) => {
      const skuVal = String(it.product?.part_number || it.product?.sku || it.sku || it.part_number || it.codigo || "").trim();
      const descVal = String(it.product?.description || it.productDescription || it.description || it.name || it.product?.model || it.model || "").trim();
      const modelVal = String(it.product?.model || it.model || descVal).trim();
      const qtyVal = Number(it.quantity ?? it.qtd ?? 1) || 1;
      const unitPriceVal = it.bonificado ? 0 : Number(it.unitPrice ?? it.price ?? it.product?.value_12m ?? it.product?.value_24m ?? 0) || 0;
      const totalItemPriceVal = unitPriceVal * qtyVal;
      const obsVal = String(it.product?.custom_fields?.observacao || it.custom_fields?.observacao || it.observacao || it.observacoes || it.obs || "").trim();
      const isItemEnsaio = !!(it.ensaiosInclusos || data.ensaiosInclusos);

      const itemObj: Record<string, any> = {
        index: idx + 1,

        // Código (exact default template token: codidodoitem)
        codidodoitem: skuVal,
        codigodoitem: skuVal,
        cod_item: skuVal,
        codigo: skuVal,
        cod: skuVal,
        sku: skuVal,
        part_number: skuVal,

        // Descrição (exact default template token: descricaodoitem)
        descricaodoitem: descVal,
        descricao: descVal,
        descrição: descVal,
        description: descVal,
        produto: descVal,
        model: modelVal,
        category: it.product?.category || it.category || "",

        // Quantidade (exact default template token: qtd)
        qtd: qtyVal,
        quantidade: qtyVal,
        quantity: qtyVal,

        // Valor (exact default template token: valor)
        valor: it.bonificado ? "R$ 0,00" : formatCurrencyBRL(unitPriceVal),
        valor_item: it.bonificado ? "R$ 0,00" : formatCurrencyBRL(unitPriceVal),
        unitPrice: it.bonificado ? "R$ 0,00" : formatCurrencyBRL(unitPriceVal),
        subtotal: it.bonificado ? "R$ 0,00" : formatCurrencyBRL(totalItemPriceVal),
        totalItemPrice: it.bonificado ? "R$ 0,00" : formatCurrencyBRL(totalItemPriceVal),

        // Observação (exact default template token: obs)
        obs: obsVal,
        observacao: obsVal,
        observacoes: obsVal,
        observação: obsVal,
        observações: obsVal,

        bonificado: it.bonificado ? "Sim" : "Não",
        ensaiosInclusos: isItemEnsaio ? ensaiosYes : ensaiosNo,
        ensaios_inclusos: isItemEnsaio ? ensaiosYes : ensaiosNo,
        ensaiolab: isItemEnsaio ? ensaiosYes : ensaiosNo,
      };

      // Inject resolved mapped fields into the item scope
      Object.entries(docxMappings).forEach(([token, field]) => {
        if (token && !token.startsWith("__") && field && field !== "none") {
          if (field === "sku") {
            itemObj[token] = skuVal;
          } else if (field === "produto") {
            itemObj[token] = descVal;
          } else if (field === "quantidade" || field === "qtd") {
            itemObj[token] = qtyVal;
          } else if (field === "valor_item" || field === "valor") {
            itemObj[token] = it.bonificado ? "R$ 0,00" : formatCurrencyBRL(unitPriceVal);
          } else if (field === "observacoes" || field === "obs") {
            itemObj[token] = obsVal;
          } else if (field === "ensaios_inclusos") {
            itemObj[token] = isItemEnsaio ? ensaiosYes : ensaiosNo;
          }
        }
      });

      return itemObj;
    });

    // Flatten items for legacy template compatibility
    const firstItem = rawItems[0];
    const secondItem = rawItems[1];
    const thirdItem = rawItems[2];
    replacements["items_list"] = firstItem ? (firstItem.product?.description || firstItem.productDescription || firstItem.name || "") : "";
    replacements["qtd"] = firstItem ? (firstItem.quantity ?? firstItem.qtd ?? 1) : "";
    replacements["items_list1"] = secondItem ? (secondItem.product?.description || secondItem.productDescription || secondItem.name || "") : "";
    replacements["qtd1"] = secondItem ? (secondItem.quantity ?? secondItem.qtd ?? 1) : "";
    replacements["items_list2"] = thirdItem ? (thirdItem.product?.description || thirdItem.productDescription || thirdItem.name || "") : "";
    replacements["qtd2"] = thirdItem ? (thirdItem.quantity ?? thirdItem.qtd ?? 1) : "";

    // Custom user settings mappings
    Object.entries(docxMappings).forEach(([token, field]) => {
      if (!token || !field || field === "none") return;
      const customVal = getFieldValue(field, data, settings);
      if (customVal !== undefined && customVal !== "") {
        replacements[token] = customVal;
      }
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
    datadoorçamento: formatDateForProposal(form.date || form.proposalDate),
    razaosocial: form.companyName || form.empresa || "",
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
    data: formatDateForProposal(form.date || form.proposalDate),
    obs: form.observations || "",
    
    // Mapeamento dos campos do baseFields para suportar novos modelos de serviços mapeáveis
    vendedor: form.sellerName || "",
    empresa_phone: form.sellerPhone || "",
    empresa_email: form.sellerEmail || "",
    contato_nome: (() => {
      const prefix = form.contactGender === "M" ? "Sr. " : form.contactGender === "F" ? "Sra. " : "";
      return prefix + (form.contactName || "");
    })(),
    contato_telefone: form.phone || "",
  };

  // Mapeamento dinâmico para os campos indexados de 1 a 10
  for (let i = 0; i < 10; i++) {
    const numStr = i === 0 ? "" : String(i);
    const it = (form.selectedProducts || [])[i];
    
    formFields[`sku${numStr}`] = it ? (it.sku || it.name || "") : "";
    formFields[`qtd${numStr}`] = it ? (it.quantity || 0) : "";
    formFields[`valor_item${numStr}`] = it 
      ? (it.bonificado ? "R$ 0,00" : formatCurrencyBRL(it.unitPrice || 0)) 
      : "";
  }

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