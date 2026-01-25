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
  // Metadata for conditional slides
  installationData?: {
    entryTech?: 'facial' | 'biometria' | 'botoeira';
    exitTech?: 'facial' | 'biometria' | 'botoeira';
    doorType?: 'madeira' | 'ferro' | 'vidro';
  };
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
  versao?: string | number;
  sellerName?: string;
  sellerRole?: string;
  sellerEmail?: string;
  sellerPhone?: string;
  users?: number;
  devices?: number;
  qtd?: string;
  qtd1?: string;
  qtd2?: string;
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

// Mapeamento exato de slides conforme solicitado
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
  "idblock next facial": 30,
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

export const calculateProposalSummary = (items: Array<any>) => {
  const totalDevices = (items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  return { totalDevices };
};

export const generateProposalNumber = (dealId?: string, version?: string | number): string => {
  if (dealId) return `${dealId} V${version || 1}`;
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${datePart}-${rand} V${version || 1}`;
};

export const formatDateForProposal = (dateStr?: string | null): string => {
  try {
    if (!dateStr) return new Date().toLocaleDateString('pt-BR');
    if (dateStr.includes("/")) return dateStr;
    let dt = dateStr.includes("T") ? parseISO(dateStr) : new Date(dateStr + "T12:00:00");
    return dt.toLocaleDateString('pt-BR');
  } catch { return dateStr || ""; }
};

export const generateProposalPPTX = async (data: ProposalData): Promise<Blob> => {
  try {
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
      qtd: data.qtd || "",
      qtd1: data.qtd1 || "",
      qtd2: data.qtd2 || "",
    };

    const computedTotal = (data.overrideTotal !== undefined && data.overrideTotal !== null)
      ? Number(data.overrideTotal)
      : data.items.reduce((s, it) => s + (it.unitPrice ?? 0) * it.quantity, 0);
    
    const formattedNumber = new Intl.NumberFormat("pt-BR", { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    }).format(computedTotal);
    
    replacements["totalPrice"] = formattedNumber;

    const mainItems: string[] = [];
    const serviceItems: string[] = [];
    const mechanicalItems: string[] = [];

    data.items.forEach(it => {
      const line = `${it.product.description} – ${it.quantity} un`;
      const cat = it.product.category?.toLowerCase() || "";
      const model = it.product.model?.toLowerCase() || "";
      
      if (model.includes("idblock") || model.includes("torniquete") || model.includes("iduhf") || model.includes("idprox") || model.includes("idbio")) {
        mechanicalItems.push(line);
      } else if (cat.includes("serviço") || cat.includes("suporte") || model.includes("idpower")) {
        serviceItems.push(line);
      } else {
        mainItems.push(line);
      }
    });

    replacements["items_list"] = mainItems.join("\n");
    replacements["items_list1"] = serviceItems.join("\n");
    replacements["items_list2"] = mechanicalItems.join("\n");

    // Lógica de exclusão do slide 2
    const keepSlides = [1, 3, 4]; // Pulando o 2 explicitamente
    for (let i = 5; i <= 18; i++) keepSlides.push(i);
    keepSlides.push(46, 55);

    let hasCatraca = false;
    let hasIdFaceProForSlide47 = false;
    let hasIdFaceProForSlide48 = false;
    let hasIdAccessNanoForSlide49 = false;
    let hasIdFlexProForSlide51 = false;
    let hasIdFlexProForSlide52 = false;

    data.items.forEach(it => {
      const modelLower = (it.product.model || "").toLowerCase().trim();
      let foundSlide = MODEL_TO_SLIDE[modelLower];
      if (!foundSlide) {
        const key = Object.keys(MODEL_TO_SLIDE).find(k => modelLower.includes(k));
        if (key) foundSlide = MODEL_TO_SLIDE[key];
      }

      if (foundSlide) {
        keepSlides.push(foundSlide);
        if (foundSlide >= 30 && foundSlide <= 42) hasCatraca = true;
      }

      const install = it.installationData;
      if (modelLower.includes("idface pro")) {
        if (install?.entryTech === 'facial' && install?.exitTech === 'botoeira') hasIdFaceProForSlide47 = true;
        if (install?.entryTech === 'facial' && install?.exitTech === 'facial') hasIdFaceProForSlide48 = true;
      }
      if (modelLower.includes("idaccess nano")) {
        if (install?.entryTech === 'biometria' && install?.exitTech === 'botoeira') hasIdAccessNanoForSlide49 = true;
      }
      if (modelLower.includes("idflex pro")) {
        if (install?.entryTech === 'facial' && install?.exitTech === 'botoeira') hasIdFlexProForSlide51 = true;
        if (install?.doorType === 'vidro') hasIdFlexProForSlide52 = true;
      }
    });

    if (hasIdFaceProForSlide47) keepSlides.push(47);
    if (hasIdFaceProForSlide48) keepSlides.push(48);
    if (hasIdAccessNanoForSlide49) keepSlides.push(49);
    if (hasIdFlexProForSlide51) keepSlides.push(51);
    if (hasIdFlexProForSlide52) keepSlides.push(52);
    if (hasCatraca) keepSlides.push(53);

    return await generatePptxFromTemplate({
      replacements,
      keepSlidesOverride: Array.from(new Set(keepSlides)).sort((a, b) => a - b),
    });
  } catch (err) {
    console.error("Erro na geração do PPTX:", err);
    throw err;
  }
};