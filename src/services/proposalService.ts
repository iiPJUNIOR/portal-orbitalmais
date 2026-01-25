import { Product } from "@/types/product";
import { generatePptxFromTemplate } from "@/utils/pptxTemplate";
// pptxgenjs is used as a robust fallback generator when template-based editing fails
import PptxGenJS from "pptxgenjs";
import { parseISO } from "date-fns";

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
  proposalNumber?: string;
  pipedriveUrl?: string;
  // Seller info
  sellerName?: string;
  sellerRole?: string;
  sellerEmail?: string;
  sellerPhone?: string;
  // Global flags from ProposalForm (option B)
  flags?: {
    botoeira?: boolean;
    idfaceEntry?: boolean;
    idfaceExit?: boolean;
    idAccessNanoEntry?: boolean;
    idFlexProEntry?: boolean;
    idFlexProGlass?: boolean;
    hasCatraca?: boolean;
    systemIncluded?: boolean;
  };
  // Optional override total
  overrideTotal?: number | null;
}

/**
 * Compute a small proposal summary used in the UI.
 */
export const calculateProposalSummary = (items: Array<any>) => {
  const totalDevices = (items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  const totalUsers = (items || []).reduce((s, it) => {
    const qty = Number(it.quantity) || 0;
    const perDevice =
      (it.product && (Number((it.product as any).users) || undefined)) ||
      (Number((it as any).users) || undefined) ||
      1;
    return s + qty * perDevice;
  }, 0);
  return {
    totalDevices,
    totalUsers,
  };
};

/**
 * Generate a readable proposal number. Format: YYYYMMDD-XXXXXX (random 6 digits)
 */
export const generateProposalNumber = (): string => {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `${datePart}-${rand}`;
};

/**
 * Format a date string for display in proposals (long format in Portuguese, São Paulo Timezone).
 */
export const formatDateForProposal = (dateStr?: string | null): string => {
  try {
    let dt: Date;
    if (dateStr) {
      // Se vier apenas YYYY-MM-DD, adicionamos meio-dia para evitar mudança de dia por fuso
      dt = dateStr.includes("T") ? parseISO(dateStr) : new Date(dateStr + "T12:00:00");
    } else {
      dt = new Date();
    }

    // Usando Intl para garantir fuso horário de São Paulo (GMT-3) e formato extenso
    return dt.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Sao_Paulo'
    });
  } catch (err) {
    console.error("Erro ao formatar data:", err);
    return dateStr || "";
  }
};

/**
 * Generate a PPTX proposal as a Blob using the template and the provided data.
 */
export const generateProposalPPTX = async (data: ProposalData): Promise<Blob> => {
  try {
    // Prepare replacements
    const replacements: Record<string, string | number> = {};

    replacements["companyName"] = data.companyName || "";
    replacements["contactName"] = data.contactName || "";
    replacements["email"] = data.email || "";
    replacements["phone"] = data.phone || "";
    
    // Set formatted date (GMT-3 São Paulo por extenso)
    replacements["date"] = formatDateForProposal(data.proposalDate);

    replacements["proposalNumber"] = data.proposalNumber || (data.pipedriveUrl ? extractIdFromPipedriveUrl(data.pipedriveUrl) + " V.1" : "");

    const itemsDescriptions = (data.items || []).map((it) => it.product.description);
    replacements["items_list"] = itemsDescriptions.join("\n");
    replacements["items_list1"] = itemsDescriptions[0] ?? "";
    replacements["items_list2"] = itemsDescriptions[1] ?? "";

    const firstThree = (data.items || []).slice(0, 3);
    replacements["qtd"] = firstThree[0]?.quantity ?? 0;
    replacements["qtd1"] = firstThree[1]?.quantity ?? 0;
    replacements["qtd2"] = firstThree[2]?.quantity ?? 0;

    const computedTotal = (data.overrideTotal !== undefined && data.overrideTotal !== null)
      ? Number(data.overrideTotal)
      : (data.items || []).reduce((s, it) => {
        const unit = it.unitPrice ?? (it.priceModel === "12m" ? it.product.value_12m : it.product.value_24m);
        return s + unit * it.quantity;
      }, 0);

    replacements["totalPrice"] = `R$ ${computedTotal.toFixed(2)}`;

    // Use passed seller info or fallback to localStorage
    replacements["sellerName"] = data.sellerName || localStorage.getItem("seller_name") || "";
    replacements["sellerRole"] = data.sellerRole || localStorage.getItem("seller_role") || "";
    replacements["sellerEmail"] = data.sellerEmail || localStorage.getItem("seller_email") || "";
    replacements["sellerPhone"] = data.sellerPhone || localStorage.getItem("seller_phone") || "";

    const summary = calculateProposalSummary(data.items || []);
    replacements["users"] = summary.totalUsers;
    replacements["devices"] = summary.totalDevices;

    replacements["CNPJ"] = data.cnpj || "";
    replacements["endereço"] = data.address || "";

    const blob = await generatePptxFromTemplate({
      replacements,
      modelNames: (data.items || []).map((it) => it.product.model || it.product.description || ""),
      flags: data.flags,
      keepSlidesOverride: null,
    });

    return blob;
  } catch (err) {
    console.error("Template-based PPTX generation failed, falling back to generated PPTX:", err);

    try {
      const pptx = new PptxGenJS();
      const slide1 = pptx.addSlide();
      slide1.addText(data.companyName || "", { x: 0.5, y: 0.8, fontSize: 28, bold: true });
      
      const slideSeller = pptx.addSlide();
      slideSeller.addText("Vendedor", { x: 0.5, y: 0.8, fontSize: 14, bold: true });
      slideSeller.addText("Nome: " + (data.sellerName || localStorage.getItem("seller_name") || ""), { x: 0.5, y: 1.3, fontSize: 12 });
      slideSeller.addText("Cargo: " + (data.sellerRole || localStorage.getItem("seller_role") || ""), { x: 0.5, y: 1.7, fontSize: 11 });
      slideSeller.addText("Contato: " + `${data.sellerEmail || localStorage.getItem("seller_email") || ""} · ${data.sellerPhone || localStorage.getItem("seller_phone") || ""}`, { x: 0.5, y: 2.1, fontSize: 11 });

      const blob: Blob = await pptx.write("blob");
      return blob;
    } catch (pptxErr) {
      console.error("Fallback PPTX generation also failed:", pptxErr);
      return new Blob(["Erro ao gerar arquivo"], { type: "text/plain" });
    }
  }
};

function extractIdFromPipedriveUrl(url?: string) {
  if (!url) return "";
  try {
    const m = url.match(/\/deal\/(\d+)/);
    if (m && m[1]) return m[1];
    const parts = url.split("/");
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i].trim();
      if (/^\d+$/.test(p)) return p;
    }
  } catch {
    // ignore
  }
  return "";
}