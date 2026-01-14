import { Product } from "@/types/product";
import { generatePptxFromTemplate } from "@/utils/pptxTemplate";
// pptxgenjs is used as a robust fallback generator when template-based editing fails
import PptxGenJS from "pptxgenjs";
import { format, parseISO } from "date-fns";

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
 * - totalDevices: sum of quantities
 * - totalUsers: attempts to use product.users/per-device hint if present, otherwise assumes 1 user per device
 */
export const calculateProposalSummary = (items: Array<any>) => {
  const totalDevices = (items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  const totalUsers = (items || []).reduce((s, it) => {
    const qty = Number(it.quantity) || 0;
    // prefer explicit per-device users if provided on the product or item
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
 * Format a date string for display in proposals (dd/MM/yyyy).
 * Accepts ISO strings or plain date strings; returns empty string on invalid input.
 */
export const formatDateForProposal = (dateStr?: string | null): string => {
  if (!dateStr) return "";
  try {
    // try parseISO first; fallback to Date constructor
    const dt = dateStr.includes("T") ? parseISO(dateStr) : new Date(dateStr);
    return format(dt, "dd/MM/yyyy");
  } catch {
    return String(dateStr).slice(0, 10);
  }
};

/**
 * Generate a PPTX proposal as a Blob using the template and the provided data.
 * Primary strategy: edit existing template with JSZip (token/plain-text replacements).
 * Fallback: if template processing fails (missing/invalid template), create a simple PPTX via pptxgenjs so the file opens.
 */
export const generateProposalPPTX = async (data: ProposalData): Promise<Blob> => {
  try {
    // Prepare replacements
    const replacements: Record<string, string | number> = {};

    replacements["companyName"] = data.companyName || "";
    replacements["contactName"] = data.contactName || "";
    replacements["email"] = data.email || "";
    replacements["phone"] = data.phone || "";
    // format date
    try {
      replacements["date"] = new Date(data.proposalDate).toLocaleDateString("pt-BR");
    } catch {
      replacements["date"] = data.proposalDate || "";
    }

    // proposalNumber: if provided use it; else try to extract from pipedriveUrl
    replacements["proposalNumber"] = data.proposalNumber || (data.pipedriveUrl ? extractIdFromPipedriveUrl(data.pipedriveUrl) + " V.1" : "");

    // Build items_list textual representation (one line per item)
    const itemsTextLines = (data.items || []).map((it) => {
      const unit = it.priceModel === "12m" ? it.product.value_12m : it.product.value_24m;
      const subtotal = unit * it.quantity;
      // keep a compact line that includes description, qty and subtotal
      return `${it.product.description} — Qtd: ${it.quantity} — R$ ${subtotal.toFixed(2)}`;
    });

    // Full list (multi-line) and also first/second as separate keys
    replacements["items_list"] = itemsTextLines.join("\n");
    replacements["items_list1"] = itemsTextLines[0] ?? "";
    replacements["items_list2"] = itemsTextLines[1] ?? "";
    // Keep compatibility with earlier Portuguese 'descrição' tokens (map first three descriptions)
    const firstThree = (data.items || []).slice(0, 3);
    replacements["descrição"] = firstThree[0]?.product?.description ?? "";
    replacements["descrição1"] = firstThree[1]?.product?.description ?? "";
    replacements["descrição2"] = firstThree[2]?.product?.description ?? "";

    // quantities for first three (qtd, qtd1, qtd2)
    replacements["qtd"] = firstThree[0]?.quantity ?? 0;
    replacements["qtd1"] = firstThree[1]?.quantity ?? 0;
    replacements["qtd2"] = firstThree[2]?.quantity ?? 0;

    const computedTotal = (data.overrideTotal !== undefined && data.overrideTotal !== null)
      ? Number(data.overrideTotal)
      : (data.items || []).reduce((s, it) => {
        const unit = it.priceModel === "12m" ? it.product.value_12m : it.product.value_24m;
        return s + unit * it.quantity;
      }, 0);

    replacements["totalPrice"] = `R$ ${computedTotal.toFixed(2)}`;

    // Seller fields from Settings (localStorage)
    const sellerName = localStorage.getItem("seller_name") || "";
    const sellerRole = localStorage.getItem("seller_role") || "";
    const sellerEmail = localStorage.getItem("seller_email") || "";
    const sellerPhone = localStorage.getItem("seller_phone") || "";

    replacements["sellerName"] = sellerName;
    replacements["sellerRole"] = sellerRole;
    replacements["sellerEmail"] = sellerEmail;
    replacements["sellerPhone"] = sellerPhone;

    // totals users/devices from summary
    const summary = calculateProposalSummary(data.items || []);
    replacements["users"] = summary.totalUsers;
    replacements["devices"] = summary.totalDevices;

    // CNPJ and address
    replacements["CNPJ"] = data.cnpj || "";
    replacements["endereço"] = data.address || "";

    // Attempt template-based generation (JSZip-based editor). This is the preferred flow.
    const blob = await generatePptxFromTemplate({
      replacements,
      modelNames: (data.items || []).map((it) => it.product.model || it.product.description || ""),
      flags: data.flags,
      keepSlidesOverride: null,
    });

    return blob;
  } catch (err) {
    // If template processing failed (e.g. template missing or invalid), create a clean fallback PPTX so it opens.
    console.error("Template-based PPTX generation failed, falling back to generated PPTX:", err);

    try {
      const pptx = new PptxGenJS();
      // Slide 1 - cover
      const slide1 = pptx.addSlide();
      slide1.addText(data.companyName || "", { x: 0.5, y: 0.8, fontSize: 28, bold: true });
      slide1.addText(`Proposta: ${data.proposalNumber || (data.pipedriveUrl ? extractIdFromPipedriveUrl(data.pipedriveUrl) : "")}`, { x: 0.5, y: 1.6, fontSize: 14 });
      slide1.addText(`Data: ${new Date(data.proposalDate).toLocaleDateString("pt-BR")}`, { x: 0.5, y: 2.2, fontSize: 12 });
      slide1.addText(data.observations || "", { x: 0.5, y: 2.8, fontSize: 11, color: "666666" });

      // Slide 2 - contact / aos cuidados
      const slide2 = pptx.addSlide();
      slide2.addText("Aos cuidados de:", { x: 0.5, y: 0.8, fontSize: 12, bold: true });
      slide2.addText(data.contactName || "", { x: 0.5, y: 1.2, fontSize: 16 });
      slide2.addText(`${data.email || ""} · ${data.phone || ""}`, { x: 0.5, y: 1.8, fontSize: 11 });

      // Slide 3 - items summary (full list)
      const slideItems = pptx.addSlide();
      slideItems.addText("Itens", { x: 0.5, y: 0.5, fontSize: 18, bold: true });
      const itemsText = (data.items || []).map(it => {
        const unit = it.priceModel === "12m" ? it.product.value_12m : it.product.value_24m;
        const subtotal = unit * it.quantity;
        return `${it.product.description} — Qtd: ${it.quantity} — R$ ${subtotal.toFixed(2)}`;
      }).join("\n");
      slideItems.addText(itemsText || "Nenhum item", { x: 0.5, y: 1.2, fontSize: 12, lineSpacing: 12, color: "333333", w: "90%" });

      // Slide 4 - seller
      const slideSeller = pptx.addSlide();
      slideSeller.addText("Vendedor", { x: 0.5, y: 0.8, fontSize: 14, bold: true });
      slideSeller.addText("Nome: " + (localStorage.getItem("seller_name") || ""), { x: 0.5, y: 1.3, fontSize: 12 });
      slideSeller.addText("Cargo: " + (localStorage.getItem("seller_role") || ""), { x: 0.5, y: 1.7, fontSize: 11 });
      slideSeller.addText("Contato: " + `${localStorage.getItem("seller_email") || ""} · ${localStorage.getItem("seller_phone") || ""}`, { x: 0.5, y: 2.1, fontSize: 11 });

      // Slide total
      const slideTotal = pptx.addSlide();
      slideTotal.addText("Resumo", { x: 0.5, y: 0.8, fontSize: 16, bold: true });
      slideTotal.addText(`Total: R$ ${computedTotalFormatted(data)}`, { x: 0.5, y: 1.4, fontSize: 18, bold: true });

      // Create a blob and return
      // write() returns a Promise; 'blob' target returns a Blob in browsers
      // @ts-ignore - pptxgenjs types can be inconsistent across versions
      const blob: Blob = await pptx.write("blob");
      return blob;
    } catch (pptxErr) {
      console.error("Fallback PPTX generation also failed:", pptxErr);
      // Last resort: return a plain text file so the user still gets something
      const fallbackContent = `
Proposta (fallback) - ${data.companyName}
Data: ${data.proposalDate}
Contato: ${data.contactName}
E-mail: ${data.email}
Telefone: ${data.phone}
Endereço: ${data.address || ""}

Itens:
${(data.items || []).map(it => `- ${it.product.description} (Qtd: ${it.quantity})`).join("\n")}

Total: R$ ${(data.items || []).reduce((s, it) => s + (it.priceModel === '12m' ? it.product.value_12m : it.product.value_24m) * it.quantity, 0).toFixed(2)}
`.trim();
      return new Blob([fallbackContent], { type: "text/plain" });
    }
  }
};

function extractIdFromPipedriveUrl(url?: string) {
  if (!url) return "";
  try {
    const m = url.match(/\/deal\/(\d+)/);
    if (m && m[1]) return m[1];
    // fallback: last numeric segment
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

function computedTotalFormatted(data: ProposalData) {
  const computedTotal = (data.overrideTotal !== undefined && data.overrideTotal !== null)
    ? Number(data.overrideTotal)
    : (data.items || []).reduce((s, it) => {
      const unit = it.priceModel === "12m" ? it.product.value_12m : it.product.value_24m;
      return s + unit * it.quantity;
    }, 0);
  return computedTotal.toFixed(2);
}