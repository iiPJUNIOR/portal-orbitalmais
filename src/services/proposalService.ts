import { Product } from "@/types/product";
import { generatePptxFromTemplate } from "@/utils/pptxTemplate";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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
      totalPrice: new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(computedTotal),
    };

    replacements["items_list"] = data.items[0] ? data.items[0].product.description : "";
    replacements["qtd"] = data.items[0] ? data.items[0].quantity : "";
    replacements["items_list1"] = data.items[1] ? data.items[1].product.description : "";
    replacements["qtd1"] = data.items[1] ? data.items[1].quantity : "";
    replacements["items_list2"] = data.items[2] ? data.items[2].product.description : "";
    replacements["qtd2"] = data.items[2] ? data.items[2].quantity : "";

    const keepSlides = [1, 3, 4];
    for (let i = 5; i <= 18; i++) keepSlides.push(i);
    keepSlides.push(46, 57);

    const hasCatraca = data.items.some(it => {
      const cat = (it.product.category || "").toLowerCase();
      const model = (it.product.model || "").toLowerCase();
      return cat.includes("catraca") || cat.includes("torniquete") || model.includes("idblock") || model.includes("torniquete");
    });

    if (hasCatraca) {
      keepSlides.push(54, 55);
    }

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

export const generateProposalPDF = async (data: ProposalData): Promise<Blob> => {
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const primaryColor = [30, 30, 30]; // Dark Gray/Black from Control iD

  const drawSlideHeader = (title: string) => {
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 0, width, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Control iD", 10, 13);
    doc.setFontSize(10);
    doc.text(title.toUpperCase(), width - 10, 13, { align: 'right' });
  };

  // 1. CAPA
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, width, height, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(40);
  doc.text(data.companyName || "PROPOSTA COMERCIAL", 20, height / 2 - 10);
  doc.setFontSize(16);
  doc.text(`A/C: ${data.contactName}`, 20, height / 2 + 10);
  doc.setFontSize(12);
  doc.text(`Proposta: ${data.proposalNumber} | Data: ${formatDateForProposal(data.proposalDate)}`, 20, height - 20);

  // 2. INSTITUCIONAL (Simplificado para PDF)
  doc.addPage();
  drawSlideHeader("Quem somos");
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setFontSize(24);
  doc.text("Líder brasileira em tecnologia", 15, 45);
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  const introText = "A Control iD é uma empresa 100% brasileira especializada no desenvolvimento de hardware e software para controle de acesso, automação comercial e relógio de ponto. Com fabricação própria e tecnologia de ponta, oferecemos as melhores soluções do mercado.";
  doc.text(doc.splitTextToSize(introText, width - 30), 15, 60);

  // 3. IDENTIFICAÇÃO DO PROJETO
  doc.addPage();
  drawSlideHeader("Dados do Cliente");
  doc.setFontSize(20);
  doc.text("Identificação da Empresa", 15, 45);
  autoTable(doc, {
    startY: 55,
    body: [
      ["Razão Social:", data.companyName],
      ["CNPJ:", data.cnpj],
      ["Endereço:", data.address],
      ["Responsável:", data.contactName],
      ["E-mail:", data.email],
      ["Telefone:", data.phone],
    ],
    theme: 'plain',
    styles: { fontSize: 12, cellPadding: 4 },
    columnStyles: { 0: { fontStyle: 'bold', width: 50 } }
  });

  // 4. DETALHES TÉCNICOS DOS PRODUTOS
  data.items.forEach(item => {
    doc.addPage();
    drawSlideHeader("Especificações Técnicas");
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFontSize(22);
    doc.text(item.product.description, 15, 45);
    doc.setFontSize(10);
    doc.text(`Part Number: ${item.product.part_number}`, 15, 52);
    
    // Placeholder para características (mimic slide técnico)
    doc.setFontSize(12);
    doc.text("Principais Características:", 15, 70);
    const features = [
      "- Alta velocidade de identificação",
      "- Interface intuitiva e moderna",
      "- Integração total com software iDSecure",
      "- Design premiado e durabilidade superior"
    ];
    features.forEach((f, i) => doc.text(f, 20, 80 + (i * 8)));
  });

  // 5. RESUMO FINANCEIRO (Página 46 do PPTX)
  doc.addPage();
  drawSlideHeader("Resumo do Investimento");
  doc.setFontSize(22);
  doc.text("Proposta Comercial", 15, 40);
  
  autoTable(doc, {
    startY: 50,
    head: [['Item', 'Descrição do Produto', 'Qtd', 'Total']],
    body: data.items.map((it, idx) => [
      idx + 1,
      it.product.description,
      it.quantity,
      "Incluso" // No modelo simplificado
    ]),
    theme: 'grid',
    headStyles: { fillColor: primaryColor, textColor: 255 },
    styles: { fontSize: 10 }
  });

  const finalY = (doc as any).lastAutoTable.finalY;
  const computedTotal = (data.overrideTotal !== undefined && data.overrideTotal !== null)
    ? Number(data.overrideTotal)
    : (data.totalPrice || 0);

  doc.setFillColor(245, 245, 245);
  doc.rect(15, finalY + 10, width - 30, 25, 'F');
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("INVESTIMENTO TOTAL:", 20, finalY + 26);
  doc.setFontSize(18);
  doc.text(`R$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(computedTotal)}`, width - 20, finalY + 26, { align: 'right' });

  // 6. CONTATO (Página 57 do PPTX)
  doc.addPage();
  drawSlideHeader("Contato");
  doc.setFontSize(22);
  doc.text("Dúvidas sobre o projeto?", 15, 45);
  doc.setFontSize(14);
  doc.text(data.sellerName || "", 15, 65);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(data.sellerRole || "", 15, 72);
  doc.text(data.sellerEmail || "", 15, 79);
  doc.text(data.sellerPhone || "", 15, 86);

  // 7. APROVAÇÃO
  if (data.includeApprovalPage) {
    doc.addPage();
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 0, width, height, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(30);
    doc.text("CLIQUE AQUI PARA APROVAR SUA PROPOSTA", width / 2, height / 2, { align: 'center' });
  }

  return doc.output('blob');
};