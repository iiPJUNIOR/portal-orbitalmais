import { Product } from "@/types/product";
import { generatePptxFromTemplate } from "@/utils/pptxTemplate";
import PptxGenJS from "pptxgenjs";
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
  versao?: number;
  sellerName?: string;
  sellerRole?: string;
  sellerEmail?: string;
  sellerPhone?: string;
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
  overrideTotal?: number | null;
}

const MODEL_TO_SLIDE: Record<string, number> = {
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
  "idblock next catraca inteligente com reconhecimento facial": 30,
  "idblock next catraca inteligente com biometria digital": 31,
  "idblock facial inox catraca inteligente com reconhecimento facial": 32,
  "idblock facial preta catraca inteligente com reconhecimento facial": 33,
  "idblock facial mini preta catraca inteligente com reconhecimento facial": 34,
  "idblock facial mini inox catraca inteligente com reconhecimento facial": 35,
  "idblock inox catraca biométrica digital inteligente": 36,
  "idblock preta catraca biométrica digital inteligente": 37,
  "idblock braço articulado inox catraca biométrica digital inteligente": 38,
  "idblock braço articulado preta catraca biométrica digital inteligente": 39,
  "idblock balcão catraca biométrica digital inteligente": 40,
  "idblock pne catraca biométrica digital inteligente": 41,
  "torniquete fet 100 torniquete biométrico digital inteligente": 42,
  "idpower fonte carregador temporizado": 43,
  "idprox usb leitor de mesa rfid": 44,
  "idbio leitor biométrico de mesa": 45,
};

export const calculateProposalSummary = (items: Array<any>) => {
  const totalDevices = (items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  const totalUsers = (items || []).reduce((s, it) => {
    const qty = Number(it.quantity) || 0;
    const perDevice = (it.product && (Number((it.product as any).users) || 0)) || 0;
    return s + qty * perDevice;
  }, 0);
  return { totalDevices, totalUsers };
};

export const generateProposalNumber = (): string => {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `${datePart}-${rand}`;
};

export const formatDateForProposal = (dateStr?: string | null): string => {
  try {
    let dt = dateStr ? (dateStr.includes("T") ? parseISO(dateStr) : new Date(dateStr + "T12:00:00")) : new Date();
    return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
  } catch { return dateStr || ""; }
};

function extractIdFromPipedriveUrl(url?: string) {
  if (!url) return "";
  const m = url.match(/\/deal\/(\d+)/);
  return m ? m[1] : "";
}

export const generateProposalPPTX = async (data: ProposalData): Promise<Blob> => {
  try {
    const replacements: Record<string, string | number> = {
      companyName: data.companyName || "",
      contactName: data.contactName || "",
      date: formatDateForProposal(data.proposalDate),
      proposalNumber: data.proposalNumber || `${extractIdFromPipedriveUrl(data.pipedriveUrl)} V${data.versao || 1}`,
      sellerName: data.sellerName || "",
      sellerRole: data.sellerRole || "",
      sellerEmail: data.sellerEmail || "",
      sellerPhone: data.sellerPhone || "",
      CNPJ: data.cnpj || "",
      endereço: data.address || "",
    };

    const summary = calculateProposalSummary(data.items);
    replacements["users"] = summary.totalUsers || (data.flags?.systemIncluded ? 150 : 0);
    replacements["devices"] = summary.totalDevices;

    const computedTotal = (data.overrideTotal !== undefined && data.overrideTotal !== null)
      ? Number(data.overrideTotal)
      : data.items.reduce((s, it) => s + (it.unitPrice ?? 0) * it.quantity, 0);
    replacements["totalPrice"] = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(computedTotal);

    // Items list formatting
    const mainItems: string[] = [];
    const serviceItems: string[] = [];
    const mechanicalItems: string[] = [];

    data.items.forEach(it => {
      const line = `${it.product.description} – ${it.quantity} un – ${it.product.model}`;
      const cat = it.product.category?.toLowerCase() || "";
      if (cat.includes("catraca") || cat.includes("torniquete") || cat.includes("uhf")) {
        mechanicalItems.push(line);
      } else if (cat.includes("serviço") || cat.includes("suporte")) {
        serviceItems.push(line);
      } else {
        mainItems.push(line);
      }
    });

    replacements["items_list"] = mainItems.join("\n");
    replacements["items_list1"] = serviceItems.join("\n");
    replacements["items_list2"] = mechanicalItems.join("\n");

    const firstThree = data.items.slice(0, 3);
    replacements["qtd"] = firstThree[0]?.quantity ?? 0;
    replacements["qtd1"] = firstThree[1]?.quantity ?? 0;
    replacements["qtd2"] = firstThree[2]?.quantity ?? 0;

    // Slide selection logic
    const keepSlides = [1, 2, 3, 4];
    for (let i = 5; i <= 18; i++) keepSlides.push(i);
    keepSlides.push(46, 55);

    let hasCatraca = false;
    data.items.forEach(it => {
      const key = (it.product.model || "").toLowerCase().trim();
      const slide = MODEL_TO_SLIDE[key];
      if (slide) keepSlides.push(slide);
      if (slide >= 30 && slide <= 42) hasCatraca = true;
    });

    // Conditional installation slides
    const hasIdFacePro = data.items.some(it => it.product.model?.toLowerCase().includes("idface pro"));
    const hasIdAccessNano = data.items.some(it => it.product.model?.toLowerCase().includes("idaccess nano"));
    const hasIdFlexPro = data.items.some(it => it.product.model?.toLowerCase().includes("idflex pro"));

    if (hasIdFacePro && data.flags?.idfaceEntry && data.flags?.botoeira) keepSlides.push(47);
    if (hasIdFacePro && data.flags?.idfaceEntry && data.flags?.idfaceExit) keepSlides.push(48);
    if (hasIdAccessNano && data.flags?.idAccessNanoEntry && data.flags?.botoeira) keepSlides.push(49);
    if (hasIdFlexPro && data.flags?.idFlexProEntry && data.flags?.botoeira) keepSlides.push(51);
    if (hasIdFlexPro && data.flags?.idFlexProGlass) keepSlides.push(52);
    if (hasCatraca || data.flags?.hasCatraca) keepSlides.push(53);

    return await generatePptxFromTemplate({
      replacements,
      keepSlidesOverride: Array.from(new Set(keepSlides)).sort((a, b) => a - b),
    });
  } catch (err) {
    console.error("PPTX generation failed:", err);
    const pptx = new PptxGenJS();
    const s = pptx.addSlide();
    s.addText("Erro ao processar template. Dados: " + data.companyName, { x: 1, y: 1 });
    return await pptx.write("blob") as Blob;
  }
};