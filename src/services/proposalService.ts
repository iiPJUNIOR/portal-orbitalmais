import { Product } from "@/types/product";
import { generatePptxFromTemplate } from "@/utils/pptxTemplate";
import { normalizeModelDisplay } from "@/lib/normalizeModel";

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
 * Generate a PPTX proposal as a Blob using the template and the provided data.
 * This will:
 *  - Prepare replacement tokens (companyName, contactName, date, proposalNumber, items_list, totalPrice, seller info if available)
 *  - Call generatePptxFromTemplate to perform token substitution and slide blanking
 */
export const generateProposalPPTX = async (data: ProposalData): Promise<Blob> => {
  // If the template util is not available or something fails, fallback to a simple text file (legacy behavior)
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

    // proposalNumber: if provided use it; else fallback to empty
    replacements["proposalNumber"] = data.proposalNumber || (data.pipedriveUrl ? extractIdFromPipedriveUrl(data.pipedriveUrl) + " V.1" : "");

    // Build items_list textual representation (simple fallback: one line per item)
    const itemsTextLines = (data.items || []).map((it) => {
      const unit = it.priceModel === "12m" ? it.product.value_12m : it.product.value_24m;
      const subtotal = unit * it.quantity;
      return `${it.product.description} — Qtd: ${it.quantity} — R$ ${subtotal.toFixed(2)}`;
    });

    replacements["items_list"] = itemsTextLines.join("\n");

    const computedTotal = (data.overrideTotal !== undefined && data.overrideTotal !== null)
      ? Number(data.overrideTotal)
      : (data.items || []).reduce((s, it) => {
        const unit = it.priceModel === "12m" ? it.product.value_12m : it.product.value_24m;
        return s + unit * it.quantity;
      }, 0);

    replacements["totalPrice"] = `R$ ${computedTotal.toFixed(2)}`;

    // Seller fields: these are stored in localStorage via Settings (keys below)
    const sellerName = localStorage.getItem("seller_name") || "";
    const sellerRole = localStorage.getItem("seller_role") || "";
    const sellerEmail = localStorage.getItem("seller_email") || "";
    const sellerPhone = localStorage.getItem("seller_phone") || "";

    replacements["sellerName"] = sellerName;
    replacements["sellerRole"] = sellerRole;
    replacements["sellerEmail"] = sellerEmail;
    replacements["sellerPhone"] = sellerPhone;

    // model names array (normalized for display)
    const modelNames = (data.items || []).map((it) => normalizeModelDisplay(it.product.model || it.product.description || ""));

    // Call the template generator
    const blob = await generatePptxFromTemplate({
      replacements,
      modelNames,
      flags: data.flags,
      keepSlidesOverride: null,
    });

    return blob;
  } catch (err) {
    console.error("generateProposalPPTX failed, falling back to text file:", err);

    const proposalSummary = (data.items || []).reduce((sum, item) => {
      const price = item.priceModel === '12m' ? item.product.value_12m : item.product.value_24m;
      return sum + (price * item.quantity);
    }, 0);

    const content = `
Proposta (fallback) - ${data.companyName}
Data: ${data.proposalDate}
Contato: ${data.contactName}
E-mail: ${data.email}
Telefone: ${data.phone}
Itens:
${(data.items || []).map(it => `- ${it.product.description} (Qtd: ${it.quantity})`).join("\n")}

Total: R$ ${proposalSummary.toFixed(2)}
`.trim();

    return new Blob([content], { type: "text/plain" });
  }
};

/**
 * Calculate a simple summary for the proposal used in the UI.
 * Returns an object with totalUsers and totalDevices.
 *
 * Note: the app doesn't have explicit user/device mapping for every product in the catalog,
 * so this function derives totals from item quantities:
 *  - totalDevices: sum of quantities across items
 *  - totalUsers: same as totalDevices (can be adjusted later if you want different heuristics)
 */
export function calculateProposalSummary(items: Array<{ quantity?: number }>) {
  const totalDevices = (items || []).reduce((sum, it) => sum + (it.quantity || 0), 0);
  const totalUsers = totalDevices; // default heuristic; adjust if you want a different rule
  return {
    totalDevices,
    totalUsers,
  };
}

/**
 * Generate a short human-readable proposal number.
 * Format: YYYYMMDD-HHMMSS-<4hex>
 */
export function generateProposalNumber(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const datePart = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const timePart = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const randomPart = Math.random().toString(16).slice(2, 6).toUpperCase();
  return `${datePart}-${timePart}-${randomPart}`;
}

/**
 * Format a date string for display on the proposal (pt-BR). If parsing fails, returns the original input.
 */
export function formatDateForProposal(input?: string) {
  if (!input) return "";
  try {
    const d = new Date(input);
    if (isNaN(d.getTime())) return input;
    return d.toLocaleDateString("pt-BR");
  } catch {
    return input;
  }
}

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