"use client";

import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, CheckCircle2, FileText,
  Loader2, Plus, Search, Trash2, Save, Info,
  X, RefreshCw, Settings as SettingsIcon, ShieldCheck
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getUserSettings, saveUserSettings, defaultFields, ProductFieldDef, TypeObject, ResponsabilidadeDef } from "@/services/settingsService";
import { fetchProducts } from "@/services/productService";
import { Product } from "@/types/product";
import { ProductModal } from "@/components/ProductModal";
import { formatCurrencyBRL } from "@/lib/formatters";
import { saveDraft, updateDraft, deleteDraft } from "@/services/draftService";
import { getProposalSequenceAndRevision } from "@/services/supabaseService";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { saveAs } from "file-saver";

/* ─── DOCX helpers ─── */
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

async function generateServiceDocx(data: Record<string, string>, templateUrl: string): Promise<Blob> {
  const res = await fetch(encodeURI(templateUrl));
  if (!res.ok) throw new Error(`Template DOCX não encontrado: ${templateUrl}`);
  const buf = await res.arrayBuffer();
  const zip = new PizZip(buf);

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

  const final: Record<string, string> = {};
  Object.entries(data).forEach(([k, v]) => {
    final[k] = v; final[k.toLowerCase()] = v; final[k.toUpperCase()] = v;
  });

  doc.setData(final);
  doc.render();

  return doc.getZip().generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

/* ─── helpers ─── */
const formatCurrency = (v: string): string => {
  const digits = v.replace(/\D/g, "");
  if (!digits) return "";
  const num = (parseInt(digits, 10) / 100).toFixed(2);
  const [int, dec] = num.split(".");
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${intFmt},${dec}`;
};

const formatInitialCurrency = (value: number | string | null | undefined): string => {
  if (value === undefined || value === null || value === "") return "";
  const num = Number(value);
  if (isNaN(num)) return "";
  return num.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
};

const handleCurrencyInput = (valueStr: string): string => {
  const cleanStr = valueStr.replace(/\D/g, "");
  if (!cleanStr) return "";
  const numValue = Number(cleanStr) / 100;
  return numValue.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
};

const parseCurrencyBRLToNumber = (formattedStr: string): number => {
  if (!formattedStr) return 0;
  const cleanStr = formattedStr.replace(/\D/g, "");
  if (!cleanStr) return 0;
  return Number(cleanStr) / 100;
};
interface Props {
  onCancel: () => void;
  draftId?: string;
  initialData?: any;
  initialStep?: number;
  onComplete?: () => void;
}

export function ServiceWizard({ onCancel, draftId, initialData, initialStep, onComplete }: Props) {
  const [currentStep, setCurrentStep] = useState<number>(() => {
    if (initialStep && typeof initialStep === "number") {
      const isLegacy = !initialData?.wizardVersion;
      if (isLegacy) {
        if (initialStep === 2) return 2;
        if (initialStep === 3) return 3;
        if (initialStep === 4) return 4;
      }
      return initialStep;
    }
    return 1;
  });
  const [loading, setLoading] = useState(false);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [newRespClienteText, setNewRespClienteText] = useState("");
  const [newRespOrbitalText, setNewRespOrbitalText] = useState("");
  const [templateUrl, setTemplateUrl] = useState<string>("/Solicitação de vistoria.docx");
  const lastFetchedCnpj = useRef<string>("");
  const cnpjDebounce = useRef<NodeJS.Timeout | null>(null);
  const [todaySequence, setTodaySequence] = useState(1);
  const [numberEdited, setNumberEdited] = useState(false);
  const isInitialMount = useRef(true);

  const [fieldsConfig, setFieldsConfig] = useState<ProductFieldDef[]>([]);

  const isServiceItem = (item: any) => {
    const cat = (item.category || "").toLowerCase();
    const desc = (item.description || "").toLowerCase();
    const model = (item.model || item.name || "").toLowerCase();
    return cat.includes("serviço") || cat.includes("suporte") || cat.includes("instalação") || desc.includes("software") || desc.includes("idsocial") || desc.includes("idsecure") || model.includes("idpower");
  };

  const isFieldActive = (key: string) => {
    return fieldsConfig.some((f) => f.key === key && f.isActive);
  };

  const getFieldLabel = (key: string, fallback: string) => {
    const field = fieldsConfig.find((f) => f.key === key);
    return field ? field.label : fallback;
  };

  const isValueEmpty = (v: any) => {
    if (v === undefined || v === null) return true;
    if (typeof v === "string" && v.trim() === "") return true;
    if (Array.isArray(v) && v.length === 0) return true;
    return false;
  };

  // Revision modal states
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionData, setRevisionData] = useState<any>(null);
  const [selectedQuoteForRevision, setSelectedQuoteForRevision] = useState<any | null>(null);
  const [revisionModalStep, setRevisionModalStep] = useState<"choose-mode" | "select-quote" | "confirm-revision">("choose-mode");

  const [form, setForm] = useState<any>({
    proposalType: "service",
    wizardVersion: 2,
    proposalNumber: "",
    version: "0",
    date: new Date().toISOString().split("T")[0],
    companyName: "",
    contactName: "",
    cnpj: "",
    address: "",
    email: "",
    phone: "",
    sellerName: "",
    sellerRole: "",
    sellerEmail: "",
    sellerPhone: "",
    selectedProducts: [] as any[],
    totalPrice: "",
    observations: "",
    tipoServico: "",
    tipoJunta: "",
    dependencias: "",
    tipoMaterial: "",
    numeroSoldas: "",
    corpoProva: "",
    executionLocation: "",
    prazo: "",
    usaEpsOrbital: null as boolean | null,
    respCliente: [] as string[],
    respOrbital: [] as string[],
    porcentagemEntrada: "",
    porcentagemFinal: "",
    diasQuitacao: "",
    obsResponsabilidadeCliente: "",
  });

  const [tiposServicoOptions, setTiposServicoOptions] = useState<string[]>([]);
  const [tiposJuntaOptions, setTiposJuntaOptions] = useState<string[]>([]);
  const [tiposMaterialOptions, setTiposMaterialOptions] = useState<string[]>([]);
  const [tiposServicoList, setTiposServicoList] = useState<any[]>([]);
  const [tiposJuntaList, setTiposJuntaList] = useState<any[]>([]);
  const [tiposMaterialList, setTiposMaterialList] = useState<any[]>([]);
  const [camposTipoServico, setCamposTipoServico] = useState<any[]>([]);
  const [camposTipoJunta, setCamposTipoJunta] = useState<any[]>([]);
  const [camposTipoMaterial, setCamposTipoMaterial] = useState<any[]>([]);

  // Quick-add modal state
  const [quickAddTarget, setQuickAddTarget] = useState<"servico" | "junta" | "material" | null>(null);
  const [quickAddName, setQuickAddName] = useState("");
  const [savingQuickAdd, setSavingQuickAdd] = useState(false);
  const [respOptions, setRespOptions] = useState<{ cliente: ResponsabilidadeDef[]; orbital: ResponsabilidadeDef[] }>({ cliente: [], orbital: [] });
  const [onlyServices, setOnlyServices] = useState(false);
  const [selectedProductForDetails, setSelectedProductForDetails] = useState<Product | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [detailsModalReadOnly, setDetailsModalReadOnly] = useState(true);
  const [showCatalog, setShowCatalog] = useState(false);

  const loadProducts = async () => {
    try {
      const prods = await fetchProducts();
      setAllProducts(prods.filter((p: any) => (p.status || "").toLowerCase() === "ativo"));
    } catch (err) {
      console.error("Failed to load products:", err);
    }
  };

  const handleAddManualService = () => {
    const manualId = `manual-service-${Date.now()}`;
    const newManualService = {
      id: manualId,
      baseId: manualId,
      sku: `SERV-MAN-${Date.now()}`,
      category: "Serviço",
      model: "Serviço Personalizado",
      name: "Serviço Personalizado",
      description: "",
      value_12m: 0,
      value_24m: 0,
      quantity: 1,
      unitPrice: 0,
      status: "Ativo",
      custom_fields: {
        observacao: ""
      }
    };
    setForm((prev: any) => ({
      ...prev,
      selectedProducts: [...(prev.selectedProducts || []), newManualService]
    }));
    toast.success("Serviço manual adicionado!");
  };

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  /* load settings + products */
  useEffect(() => {
    (async () => {
      try {
        const s = await getUserSettings();
        if (s) {
          setForm((p: any) => ({
            ...p,
            sellerName: p.sellerName || s.seller_name || "",
            sellerRole: p.sellerRole || s.seller_role || "",
            sellerEmail: p.sellerEmail || s.seller_email || "",
            sellerPhone: p.sellerPhone || s.seller_phone || "",
          }));
          // If user configured a service docx template, use it
          if ((s as any).service_docx_url) setTemplateUrl((s as any).service_docx_url);

          if (Array.isArray(s?.product_fields)) {
            setFieldsConfig(s.product_fields);
          } else {
            setFieldsConfig(defaultFields);
          }

          const tsList = s.tipos_servico || [];
          const tjList = s.tipos_junta || [];
          const tmList = s.tipos_material || [];
          setTiposServicoList(tsList);
          setTiposJuntaList(tjList);
          setTiposMaterialList(tmList);
          setCamposTipoServico(s.campos_tipo_servico || []);
          setCamposTipoJunta(s.campos_tipo_junta || []);
          setCamposTipoMaterial(s.campos_tipo_material || []);
          setRespOptions({
            cliente: s.responsabilidades_cliente || [],
            orbital: s.responsabilidades_orbital || [],
          });

          setTiposServicoOptions(tsList.map((opt: any) => typeof opt === 'string' ? opt : opt.name));
          setTiposJuntaOptions(tjList.map((opt: any) => typeof opt === 'string' ? opt : opt.name));
          setTiposMaterialOptions(tmList.map((opt: any) => typeof opt === 'string' ? opt : opt.name));
        } else {
          setFieldsConfig(defaultFields);
        }
        await loadProducts();
      } catch {}
    })();
  }, []);

  // Get sequence and revision on mount or when CNPJ changes
  useEffect(() => {
    async function loadSequenceAndRevision() {
      if (isInitialMount.current && initialData) {
        isInitialMount.current = false;
        const obmMatch = String(initialData.proposalNumber || "").match(/OBM-(\d+)/i);
        if (obmMatch) {
          setTodaySequence(parseInt(obmMatch[1], 10));
        }
        return;
      }
      isInitialMount.current = false;

      const cleanCnpj = (form.cnpj || "").replace(/\D/g, "");
      if (cleanCnpj.length < 14) {
        setRevisionData(null);
        setSelectedQuoteForRevision(null);
        setRevisionModalStep("choose-mode");
        setShowRevisionModal(false);
        const { getProposalSequenceAndRevision } = await import("@/services/supabaseService");
        const { sequence, revision } = await getProposalSequenceAndRevision(cleanCnpj);
        setTodaySequence(sequence);
        setForm((prev: any) => ({ ...prev, version: String(revision) }));
        return;
      }

      const { getProposalSequenceAndRevision } = await import("@/services/supabaseService");
      const res = await getProposalSequenceAndRevision(cleanCnpj);
      
      // Prefill contact data if returned
      setForm((prev: any) => {
        const updated = { ...prev };
        if (res.previousContact) {
          const pc = res.previousContact;
          if (pc.companyName && !prev.companyName) updated.companyName = pc.companyName;
          if (pc.contactName && !prev.contactName) updated.contactName = pc.contactName;
          if (pc.email && !prev.email) updated.email = pc.email;
          if (pc.phone && !prev.phone) updated.phone = pc.phone;
          if (pc.address && !prev.address) updated.address = pc.address;
        }
        return updated;
      });

      if (res.revision > 0) {
        // Existing quote found! Show the popup
        setRevisionData(res);
        setSelectedQuoteForRevision(null);
        setRevisionModalStep("choose-mode");
        setShowRevisionModal(true);
      } else {
        // CNPJ new to database, use default global sequence
        setTodaySequence(res.sequence);
        setForm((prev: any) => ({ ...prev, version: String(res.revision) }));
        setRevisionData(null);
        setSelectedQuoteForRevision(null);
        setRevisionModalStep("choose-mode");
        setShowRevisionModal(false);
      }
    }
    loadSequenceAndRevision();
  }, [form.cnpj]);

  // Automatically generate proposal number
  useEffect(() => {
    if (!numberEdited && form.companyName) {
      const formattedSeq = String(todaySequence).padStart(3, "0");
      const ver = form.version || "0";
      setForm((prev: any) => ({
        ...prev,
        proposalNumber: `${prev.companyName} - OBM-${formattedSeq} - REV${ver}`
      }));
    }
  }, [form.companyName, todaySequence, form.version, numberEdited]);

  /* apply initialData */
  useEffect(() => {
    if (initialData) {
      try {
        const currentVersion = parseInt(initialData.version ?? "0", 10);
        const nextVersion = draftId ? (isNaN(currentVersion) ? 0 : currentVersion) : (isNaN(currentVersion) ? 1 : currentVersion + 1);
        setForm((prev: any) => ({
          ...prev,
          ...initialData,
          version: String(nextVersion),
          wizardVersion: 2,
        }));
      } catch (err) {
        console.warn("Failed to apply initialData to wizard", err);
      }
    }
  }, []);

  /* CNPJ Input Handler */
  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length > 14) value = value.slice(0, 14);
    // Apply mask
    if (value.length >= 3) value = value.replace(/^(\d{2})(\d)/, "$1.$2");
    if (value.length >= 7) value = value.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
    if (value.length >= 11) value = value.replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4");
    if (value.length >= 16) value = value.replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
    setForm((prev: any) => ({ ...prev, cnpj: value }));
  };

  const fetchCnpjData = async (rawCnpj: string) => {
    if (rawCnpj.length !== 14 || lastFetchedCnpj.current === rawCnpj) return;
    lastFetchedCnpj.current = rawCnpj;
    const toastId = toast.loading("Buscando CNPJ...");
    try {
      const { fetchCnpjData: lookupCnpj } = await import("@/services/cnpjService");
      const data = await lookupCnpj(rawCnpj);
      setForm((prev: any) => ({
        ...prev,
        companyName: data.companyName || prev.companyName,
        address: data.address || prev.address,
        email: data.email || prev.email,
        phone: data.phone || prev.phone
      }));
      toast.success("Dados preenchidos!", { id: toastId });
    } catch (error) {
      console.error("CNPJ fetch error:", error);
      toast.error("Erro ao buscar CNPJ. Tente novamente.", { id: toastId });
    }
  };

  const handleManualCnpjLookup = () => {
    const digits = String(form.cnpj || "").replace(/\D/g, "");
    if (digits.length === 14) {
      fetchCnpjData(digits);
    } else {
      toast.error("CNPJ deve ter 14 dígitos.");
    }
  };

  useEffect(() => {
    if (cnpjDebounce.current) clearTimeout(cnpjDebounce.current);
    const digits = String(form.cnpj || "").replace(/\D/g, "");
    if (digits.length === 14) {
      cnpjDebounce.current = setTimeout(() => {
        fetchCnpjData(digits);
      }, 600);
    }
    return () => { if (cnpjDebounce.current) clearTimeout(cnpjDebounce.current); };
  }, [form.cnpj]);

  const parseProposalNumber = (num: string) => {
    const obmMatch = String(num || "").match(/OBM-(\d+)/i);
    const revMatch = String(num || "").match(/REV(\d+)/i);
    return {
      seq: obmMatch ? parseInt(obmMatch[1], 10) : 0,
      rev: revMatch ? parseInt(revMatch[1], 10) : 0
    };
  };

  const handleSelectRevisionMode = (mode: "revision" | "new", targetQuote?: any) => {
    if (!revisionData) return;

    if (mode === "revision") {
      const quoteToRevise = targetQuote || revisionData.existingQuotes?.[0];
      if (!quoteToRevise) return;

      const { seq, rev } = parseProposalNumber(quoteToRevise.proposal_number);
      const nextRev = rev + 1;

      setTodaySequence(seq > 0 ? seq : revisionData.sequence);
      
      const previousSettings = quoteToRevise.settings || {};
      setForm((prev: any) => ({
        ...prev,
        ...previousSettings,
        version: String(nextRev),
        companyName: quoteToRevise.company_name || quoteToRevise.companyName || previousSettings.companyName || prev.companyName,
        contactName: quoteToRevise.contact_name || quoteToRevise.contactName || previousSettings.contactName || prev.contactName,
        email: quoteToRevise.email || previousSettings.email || prev.email,
        phone: quoteToRevise.phone || previousSettings.phone || prev.phone,
        address: quoteToRevise.address || previousSettings.address || prev.address,
        selectedProducts: previousSettings.selectedProducts || []
      }));
      toast.success(`Configurado como Revisão (REV${nextRev}) do orçamento ${quoteToRevise.proposal_number}.`);
    } else {
      setTodaySequence(revisionData.nextGlobalSequence ?? (revisionData.sequence + 1));
      setForm((prev: any) => ({
        ...prev,
        version: "0",
        selectedProducts: []
      }));
      toast.success(`Configurado como Novo Orçamento (REV0)`);
    }

    setShowRevisionModal(false);
  };

  const handleNext = async () => {
    if (currentStep === 1) {
      if (!form.companyName || String(form.companyName).trim() === "") {
        toast.error("Por favor, preencha a Razão Social da empresa.");
        return;
      }
      if (form.email && String(form.email).trim() !== "") {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(String(form.email).trim())) {
          toast.error("Por favor, insira um e-mail válido.");
          return;
        }
      }
      if (form.cnpj && String(form.cnpj).trim() !== "") {
        const cleanCnpj = String(form.cnpj).replace(/\D/g, "");
        if (cleanCnpj.length !== 14) {
          toast.error("CNPJ inválido. Deve possuir 14 dígitos.");
          return;
        }
      }
    }

    setCurrentStep((prev) => prev + 1);
  };

  /* products */
  const selectedMap = React.useMemo(() => {
    const m = new Map<string, number>();
    (form.selectedProducts || []).forEach((sp: any) => {
      const key = sp.baseId || sp.id;
      m.set(key, Number(sp.quantity) || 1);
    });
    return m;
  }, [form.selectedProducts]);

  const filteredProducts = React.useMemo(() => {
    const q = productSearch.toLowerCase().trim();
    const arr = allProducts.filter((p) => {
      if (onlyServices && !isServiceItem(p)) {
        return false;
      }
      if (q) {
        const matchesSearch =
          (p.model || "").toLowerCase().includes(q) ||
          (p.sku || "").toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      return true;
    });

    arr.sort((a, b) => {
      const aq = selectedMap.get(a.id) ?? 0;
      const bq = selectedMap.get(b.id) ?? 0;

      if (aq > 0 && bq === 0) return -1;
      if (aq === 0 && bq > 0) return 1;
      if (aq > 0 && bq > 0) return bq - aq;
      return 0;
    });

    return arr;
  }, [allProducts, productSearch, selectedMap, onlyServices]);

  const isSelected = (id: string) => form.selectedProducts.some((sp: any) => sp.baseId === id);

  const toggleProduct = (p: any) => {
    setForm((prev: any) => {
      const exists = prev.selectedProducts.find((sp: any) => sp.baseId === p.id);
      if (exists) return { ...prev, selectedProducts: prev.selectedProducts.filter((sp: any) => sp.baseId !== p.id) };
      return { ...prev, selectedProducts: [...prev.selectedProducts, { ...p, baseId: p.id, name: p.model, quantity: 1 }] };
    });
  };

  /* items text for DOCX */
  const buildItemsText = (): string =>
    form.selectedProducts.map((p: any) => `• ${p.name} (Qtd: ${p.quantity})`).join("\n");

  /* generate DOCX */
  const handleGenerate = async () => {
    setLoading(true);
    const tId = toast.loading("Gerando proposta de serviço...");
    try {
      const settings = await getUserSettings();
      const serviceMappings = settings?.service_docx_mappings || {};

      // Parse BRL currency to a number helper
      const parseCurrencyBRLToNumber = (formattedStr: string): number => {
        if (!formattedStr) return 0;
        const cleanStr = formattedStr.replace(/\D/g, "");
        if (!cleanStr) return 0;
        return Number(cleanStr) / 100;
      };

      const serviceProducts = form.selectedProducts.filter((p: any) => isServiceItem(p));
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
        datadoorçamento: form.date || "",
        razaosocial: form.companyName || "",
        emaildocliente: form.email || "", 
        tipodeservico: form.tipoServico || "",
        dependencias: form.dependencias || "",
        tipodematerial: form.tipoMaterial || "",
        tipodejunta: form.tipoJunta || "",
        descricaodoservico: combinedServiceDesc || form.observations || "",
        numerodesoldas: form.numeroSoldas || "",
        obsservicos: combinedServiceObs || form.observations || "",
        responsabilidadeorbital: form.respOrbital
          .map((id: string) => respOptions.orbital.find((r) => r.id === id)?.label)
          .filter(Boolean)
          .map((label: string, idx: number) => `3.${idx + 1} ${label}`)
          .join('\n') || "",
        responsabilidadedocliente: form.respCliente
          .map((id: string) => respOptions.cliente.find((r) => r.id === id)?.label)
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
          return match ? match[0].toUpperCase() : `OBM-${String(todaySequence).padStart(3, "0")}`;
        })(),
        numerorev: `REV${form.version || "0"}`,

        // Backward compatibility default keys
        nomevendedor: form.sellerName || "",
        cargovendedor: form.sellerRole || "",
        emailvendedor: form.sellerEmail || "",
        telvendedor: form.sellerPhone || "",
        empresa: form.companyName || "",
        cnpj: form.cnpj || "",
        nomecliente: form.contactName || "",
        endereco: form.address || "",
        produto: buildItemsText(),
        qtd: String(form.selectedProducts.length),
        valor: form.totalPrice || "",
        numeroproposta: form.proposalNumber || "",
        versao: form.version || "",
        data: form.date || "",
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

      const blob = await generateServiceDocx(finalDocxData, templateUrl);
      const safe = String(form.proposalNumber || form.companyName || "Proposta").replace(/[\/\\:*?"<>|]/g, "_");
      saveAs(blob, `${safe}.docx`);

      // Save quote to Supabase
      const { saveQuote } = await import("@/services/supabaseService");
      const numTotal = parseCurrencyBRLToNumber(form.totalPrice);
      
      const saveResult = await saveQuote(
        {
          cnpj: form.cnpj || "",
          companyName: form.companyName || "",
          contactName: form.contactName || "",
          email: form.email || "",
          phone: form.phone || "",
          address: form.address || "",
          proposalDate: form.date || new Date().toISOString().split("T")[0],
          proposalNumber: form.proposalNumber || `OBM-${Date.now()}`,
          priceModel: "padrao",
          totalPrice: numTotal,
          status: "enviada",
          observations: form.observations || "",
          settings: {
            ...form,
            proposalType: "service"
          },
        },
        form.selectedProducts.map((it: any) => {
          const currencyField = fieldsConfig.find(f => f.isActive && f.type === "currency");
          const price = currencyField 
            ? (currencyField.isCustom ? it.custom_fields?.[currencyField.key] : it[currencyField.key])
            : 0;
          const defaultPrice = Number(price || it.value_12m || it.value_24m || 0);
          const uPrice = it.unitPrice !== undefined ? it.unitPrice : defaultPrice;
          const isBonified = !!it.bonificado;
          const bonifiedQty = isBonified ? Math.min(it.bonificadoQty ?? it.quantity, it.quantity) : 0;
          const finalPrice = isBonified && bonifiedQty === it.quantity ? 0 : uPrice;

          return {
            sku: it.sku || it.name || "",
            productDescription: isBonified && bonifiedQty > 0
              ? `${it.name || ""} (Bonificado ${bonifiedQty}x)`
              : it.name || "",
            quantity: it.quantity || 1,
            unitPrice: finalPrice,
            priceModel: "padrao",
            bonificado: isBonified,
          };
        })
      );

      if (draftId) {
        try {
          await deleteDraft(draftId);
        } catch (err) {
          console.warn("ServiceWizard: failed to delete draft", err);
        }
      }

      if (onComplete) {
        onComplete();
      }

      if (saveResult.isRemote) {
        toast.success("Proposta de serviço gerada e salva no histórico!", { id: tId });
      } else {
        const errMsg = saveResult.error?.message || "Erro ao salvar na base remota.";
        toast.error(`Proposta gerada, mas NÃO foi salva no histórico: ${errMsg}`, { 
          id: tId,
          duration: 6000
        });
      }
      
      setCurrentStep(5);
    } catch (err: any) {
      console.error("Erro na geração:", err);
      if (err.properties && err.properties.errors) {
        console.error(err.properties.errors);
        const detail = err.properties.errors.map((e: any) => {
          const tagInfo = e.properties?.xtag ? ` [tag: ${e.properties.xtag}]` : "";
          const explanation = e.properties?.explanation || e.message || String(e);
          return `${explanation}${tagInfo}`;
        }).join(" | ");
        toast.error(`Erro: ${detail}`, { id: tId, duration: 10000 });
      } else {
        toast.error(`Erro: ${err.message || String(err)}`, { id: tId });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleNextStep = () => {
    if (currentStep === 1) {
      if (!form.cnpj || form.cnpj.trim() === "") {
        toast.error("Por favor, preencha o CNPJ para continuar.");
        return;
      }
    }
    setCurrentStep((p) => p + 1);
  };

  const handleAddQuickRespCliente = async () => {
    const label = newRespClienteText.trim();
    if (!label) return;
    const newId = `resp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newItem: ResponsabilidadeDef = { id: newId, label };
    const updated = [...respOptions.cliente, newItem];
    
    setRespOptions(prev => ({ ...prev, cliente: updated }));
    setForm((prev: any) => ({ ...prev, respCliente: [...prev.respCliente, newId] }));
    setNewRespClienteText("");

    try {
      await saveUserSettings({ responsabilidades_cliente: updated });
      toast.success("Responsabilidade do cliente adicionada!");
    } catch (err) {
      console.warn("Failed to persist quick client responsibility:", err);
    }
  };

  const handleAddQuickRespOrbital = async () => {
    const label = newRespOrbitalText.trim();
    if (!label) return;
    const newId = `resp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newItem: ResponsabilidadeDef = { id: newId, label };
    const updated = [...respOptions.orbital, newItem];

    setRespOptions(prev => ({ ...prev, orbital: updated }));
    setForm((prev: any) => ({ ...prev, respOrbital: [...prev.respOrbital, newId] }));
    setNewRespOrbitalText("");

    try {
      await saveUserSettings({ responsabilidades_orbital: updated });
      toast.success("Responsabilidade Orbitalmais adicionada!");
    } catch (err) {
      console.warn("Failed to persist quick orbital responsibility:", err);
    }
  };

  const handleSaveDraft = async () => {
    try {
      const tId = toast.loading("Salvando rascunho...");
      if (draftId) {
        const { success, synced } = await updateDraft(draftId, { data: form, step: currentStep });
        if (success) {
          if (synced) {
            toast.success("Rascunho atualizado e sincronizado com o servidor", { id: tId });
          } else {
            toast.info("Rascunho atualizado localmente (offline)", { id: tId });
          }
        } else {
          toast.error("Falha ao atualizar rascunho", { id: tId });
        }
      } else {
        const { id, synced } = await saveDraft({ data: form, step: currentStep });
        if (synced) {
          toast.success("Rascunho salvo e sincronizado com o servidor", { id: tId });
        } else {
          toast.info("Rascunho salvo localmente (offline)", { id: tId });
        }
      }
    } catch (err) {
      console.error("save draft failed", err);
      toast.error("Erro ao salvar rascunho");
    }
  };

  /* Quick-add type handler */
  const handleQuickAddType = async () => {
    const name = quickAddName.trim();
    if (!name || !quickAddTarget) return;

    setSavingQuickAdd(true);
    try {
      const s = await getUserSettings();
      const newItem: TypeObject = {
        id: `type-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name,
        properties: {}
      };

      if (quickAddTarget === "servico") {
        const updatedList = [...(s?.tipos_servico || []), newItem];
        await saveUserSettings({ tipos_servico: updatedList });
        setTiposServicoList(updatedList);
        setTiposServicoOptions(updatedList.map((t: any) => t.name));
        set("tipoServico", name);
      } else if (quickAddTarget === "junta") {
        const updatedList = [...(s?.tipos_junta || []), newItem];
        await saveUserSettings({ tipos_junta: updatedList });
        setTiposJuntaList(updatedList);
        setTiposJuntaOptions(updatedList.map((t: any) => t.name));
        set("tipoJunta", name);
      } else {
        const updatedList = [...(s?.tipos_material || []), newItem];
        await saveUserSettings({ tipos_material: updatedList });
        setTiposMaterialList(updatedList);
        setTiposMaterialOptions(updatedList.map((t: any) => t.name));
        set("tipoMaterial", name);
      }

      toast.success(`Tipo "${name}" criado e selecionado!`);
      setQuickAddTarget(null);
      setQuickAddName("");
    } catch {
      toast.error("Erro ao criar o tipo. Tente novamente.");
    } finally {
      setSavingQuickAdd(false);
    }
  };

  /* ─── Steps ─── */
  const renderStep = () => {
    switch (currentStep) {
      /* Step 1: Client data */
      case 1:
        return (
          <div className="space-y-4">
            {/* Editable Filename / Orçamento Number */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Nome do arquivo / Nº do Orçamento</Label>
                {numberEdited && (
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 text-[10px] text-primary hover:text-primary/95 px-2 py-0 font-bold flex items-center gap-1 hover:bg-primary/10 rounded-lg"
                    onClick={() => {
                      setNumberEdited(false);
                      const formattedSeq = String(todaySequence).padStart(3, "0");
                      const ver = form.version || "0";
                      setForm((prev: any) => ({
                        ...prev,
                        proposalNumber: `${prev.companyName || "Proposta"} - OBM-${formattedSeq} - REV${ver}`
                      }));
                    }}
                  >
                    <RefreshCw className="h-3 w-3" /> Restaurar Automático
                  </Button>
                )}
              </div>
              <div className="relative">
                <Input
                  value={form.proposalNumber}
                  onChange={(e) => {
                    setNumberEdited(true);
                    setForm((prev: any) => ({ ...prev, proposalNumber: e.target.value }));
                  }}
                  placeholder="Razão Social - OBM-001 - REV0"
                  className="pr-16 font-mono text-sm border-primary/25 focus-visible:ring-primary rounded-xl"
                />
                <span className="absolute right-4 top-2.5 text-xs text-muted-foreground font-bold pointer-events-none select-none">
                  .docx
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>REV (Versão)</Label>
                <Input 
                  type="number" 
                  min="0" 
                  value={form.version} 
                  onChange={(e) => setForm((prev: any) => ({ ...prev, version: e.target.value }))} 
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input 
                  type="date" 
                  value={form.date} 
                  onChange={(e) => setForm((prev: any) => ({ ...prev, date: e.target.value }))} 
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>CNPJ</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="00.000.000/0000-00"
                    value={form.cnpj}
                    onChange={handleCnpjChange}
                    className="rounded-xl"
                  />
                  <Button type="button" variant="outline" onClick={handleManualCnpjLookup} className="rounded-xl px-3">
                    <Search className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Razão Social</Label>
                <Input 
                  placeholder="Nome da Empresa" 
                  value={form.companyName} 
                  onChange={(e) => setForm((prev: any) => ({ ...prev, companyName: e.target.value }))} 
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Nome do Contato</Label>
                <Input 
                  placeholder="A/C: Nome" 
                  value={form.contactName} 
                  onChange={(e) => setForm((prev: any) => ({ ...prev, contactName: e.target.value }))} 
                  className="rounded-xl" 
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Endereço</Label>
                <Input 
                  value={form.address} 
                  onChange={(e) => setForm((prev: any) => ({ ...prev, address: e.target.value }))} 
                  className="rounded-xl" 
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>E-mail do Cliente</Label>
                <Input
                  type="email"
                  placeholder="cliente@email.com"
                  value={form.email || ""}
                  onChange={(e) => setForm((prev: any) => ({ ...prev, email: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone do Cliente</Label>
                <Input
                  type="text"
                  placeholder="(00) 00000-0000"
                  value={form.phone || ""}
                  onChange={(e) => setForm((prev: any) => ({ ...prev, phone: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
            </div>
          </div>
        );

      /* Step 2: Informações Complementares do Serviço */
      case 2:
        return (
          <div className="space-y-5 animate-in fade-in duration-300">
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-neutral-900 dark:text-white flex items-center gap-2 uppercase tracking-wider text-muted-foreground">
                <SettingsIcon className="h-4 w-4 text-primary" />
                Informações Complementares do Serviço
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Tipo de Serviço */}
                <div className="space-y-1.5 text-left">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="tipo-servico">Tipo de Serviço</Label>
                    <button
                      type="button"
                      title="Cadastrar novo tipo de serviço"
                      onClick={() => { setQuickAddTarget("servico"); setQuickAddName(""); }}
                      className="flex items-center gap-0.5 text-[10px] font-bold text-primary hover:text-primary/80 hover:bg-primary/10 px-1.5 py-0.5 rounded-md transition-colors"
                    >
                      <Plus className="h-3 w-3" /> Novo
                    </button>
                  </div>
                  <Select value={form.tipoServico || ""} onValueChange={(val) => set("tipoServico", val)}>
                    <SelectTrigger id="tipo-servico" className="rounded-xl bg-card">
                      <SelectValue placeholder="Selecione o tipo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {tiposServicoOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Selected service properties preview */}
                  {(() => {
                    const selectedItem = tiposServicoList.find(t => t.name === form.tipoServico);
                    if (!selectedItem || !selectedItem.properties || Object.keys(selectedItem.properties).length === 0) return null;
                    return (
                      <div className="mt-2 p-3 bg-primary/5 border border-primary/10 rounded-xl space-y-1.5 animate-in fade-in slide-in-from-top-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary block">Atributos do Serviço</span>
                        <div className="grid grid-cols-1 gap-1 text-xs">
                          {camposTipoServico.map(f => {
                            const val = selectedItem.properties?.[f.key];
                            if (val === undefined || val === null || val === "") return null;
                            const displayVal = f.type === "boolean" ? (val ? "Sim" : "Não") : String(val);
                            return (
                              <div key={f.key} className="flex justify-between border-b pb-0.5">
                                <span className="text-muted-foreground">{f.label}:</span>
                                <span className="font-bold text-foreground">{displayVal}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Tipo de Junta */}
                <div className="space-y-1.5 text-left">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="tipo-junta">Tipo de Junta</Label>
                    <button
                      type="button"
                      title="Cadastrar novo tipo de junta"
                      onClick={() => { setQuickAddTarget("junta"); setQuickAddName(""); }}
                      className="flex items-center gap-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 px-1.5 py-0.5 rounded-md transition-colors"
                    >
                      <Plus className="h-3 w-3" /> Novo
                    </button>
                  </div>
                  <Select value={form.tipoJunta || ""} onValueChange={(val) => set("tipoJunta", val)}>
                    <SelectTrigger id="tipo-junta" className="rounded-xl bg-card">
                      <SelectValue placeholder="Selecione o tipo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {tiposJuntaOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Selected joint properties preview */}
                  {(() => {
                    const selectedItem = tiposJuntaList.find(t => t.name === form.tipoJunta);
                    if (!selectedItem || !selectedItem.properties || Object.keys(selectedItem.properties).length === 0) return null;
                    return (
                      <div className="mt-2 p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl space-y-1.5 animate-in fade-in slide-in-from-top-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">Atributos da Junta</span>
                        <div className="grid grid-cols-1 gap-1 text-xs">
                          {camposTipoJunta.map(f => {
                            const val = selectedItem.properties?.[f.key];
                            if (val === undefined || val === null || val === "") return null;
                            const displayVal = f.type === "boolean" ? (val ? "Sim" : "Não") : String(val);
                            return (
                              <div key={f.key} className="flex justify-between border-b pb-0.5">
                                <span className="text-muted-foreground">{f.label}:</span>
                                <span className="font-bold text-foreground">{displayVal}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Tipo de Material */}
                <div className="space-y-1.5 text-left">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="tipo-material">Tipo de Material</Label>
                    <button
                      type="button"
                      title="Cadastrar novo tipo de material"
                      onClick={() => { setQuickAddTarget("material"); setQuickAddName(""); }}
                      className="flex items-center gap-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 px-1.5 py-0.5 rounded-md transition-colors"
                    >
                      <Plus className="h-3 w-3" /> Novo
                    </button>
                  </div>
                  <Select value={form.tipoMaterial || ""} onValueChange={(val) => set("tipoMaterial", val)}>
                    <SelectTrigger id="tipo-material" className="rounded-xl bg-card">
                      <SelectValue placeholder="Selecione o tipo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {tiposMaterialOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Selected material properties preview */}
                  {(() => {
                    const selectedItem = tiposMaterialList.find(t => t.name === form.tipoMaterial);
                    if (!selectedItem || !selectedItem.properties || Object.keys(selectedItem.properties).length === 0) return null;
                    return (
                      <div className="mt-2 p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl space-y-1.5 animate-in fade-in slide-in-from-top-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block">Atributos do Material</span>
                        <div className="grid grid-cols-1 gap-1 text-xs">
                          {camposTipoMaterial.map(f => {
                            const val = selectedItem.properties?.[f.key];
                            if (val === undefined || val === null || val === "") return null;
                            const displayVal = f.type === "boolean" ? (val ? "Sim" : "Não") : String(val);
                            return (
                              <div key={f.key} className="flex justify-between border-b pb-0.5">
                                <span className="text-muted-foreground">{f.label}:</span>
                                <span className="font-bold text-foreground">{displayVal}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="space-y-1.5 text-left">
                  <Label htmlFor="numero-soldas">Número de Soldas</Label>
                  <Input
                    id="numero-soldas"
                    value={form.numeroSoldas || ""}
                    onChange={(e) => set("numeroSoldas", e.target.value)}
                    placeholder="Ex: 12"
                    className="rounded-xl bg-card"
                  />
                </div>

                {/* Question: Onde o serviço será executado? */}
                <div className="space-y-2 sm:col-span-2 text-left border-t pt-4 mt-2">
                  <Label className="font-bold text-sm text-neutral-900 dark:text-white">Onde o serviço será executado?</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        set("executionLocation", "cliente");
                        set("dependencias", form.companyName || "");
                      }}
                      className={`p-3.5 rounded-2xl border-2 text-left transition-all flex flex-col justify-between min-h-[72px] ${
                        form.executionLocation === "cliente"
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-muted hover:border-primary/30"
                      }`}
                    >
                      <span className="font-bold text-sm">Nas dependências do Cliente</span>
                      <span className="text-xs text-muted-foreground truncate w-full mt-1">
                        {form.companyName || "Razão Social do Cliente"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        set("executionLocation", "orbital");
                        set("dependencias", "Orbitalmais");
                      }}
                      className={`p-3.5 rounded-2xl border-2 text-left transition-all flex flex-col justify-between min-h-[72px] ${
                        form.executionLocation === "orbital"
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-muted hover:border-primary/30"
                      }`}
                    >
                      <span className="font-bold text-sm">Nas dependências da Orbitalmais</span>
                      <span className="text-xs text-muted-foreground mt-1">
                        Orbitalmais
                      </span>
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 text-left">
                  <Label htmlFor="dependencias">Dependências / Local</Label>
                  <Input
                    id="dependencias"
                    value={form.dependencias || ""}
                    onChange={(e) => set("dependencias", e.target.value)}
                    placeholder="Ex: Nome da Empresa ou Orbitalmais"
                    className="rounded-xl bg-card"
                  />
                </div>


              </div>
            </div>
          </div>
        );

      /* Step 3: Itens do Orçamento e Fechamento */
      case 3:
        return (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Toggle Catalog View Card */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between p-4 bg-muted/15 rounded-2xl border border-dashed border-primary/20 gap-3">
              <div className="text-left">
                <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  Catálogo de Produtos & Serviços
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">Adicione serviços manuais ou consulte itens na base.</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  onClick={handleAddManualService}
                  size="sm"
                  className="rounded-xl font-bold flex items-center gap-1.5 h-10 px-4 bg-primary text-white hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar Serviço
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCatalog(!showCatalog)}
                  className="rounded-xl font-bold flex items-center gap-2 text-xs bg-card hover:bg-muted/10 h-10 px-4 border"
                >
                  {showCatalog ? "Ocultar Catálogo" : "Ver Catálogo"}
                </Button>
              </div>
            </div>

            {showCatalog && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                {/* Search and Filter */}
                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9 rounded-xl bg-card border-muted-foreground/20 focus-visible:ring-primary"
                      placeholder="Buscar produto ou serviço..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2 bg-muted/30 dark:bg-muted/10 px-3.5 py-2 rounded-xl border border-muted-foreground/10 select-none h-10 shrink-0">
                    <input
                      type="checkbox"
                      id="only-services-filter"
                      checked={onlyServices}
                      onChange={(e) => setOnlyServices(e.target.checked)}
                      className="h-4 w-4 accent-primary rounded cursor-pointer"
                    />
                    <label htmlFor="only-services-filter" className="text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400 cursor-pointer select-none">
                      Apenas Serviços
                    </label>
                  </div>
                </div>

            {/* Catalog list */}
            <div className="border rounded-xl divide-y bg-card max-h-64 overflow-y-auto">
              {filteredProducts.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground text-center">Nenhum produto ou serviço encontrado.</p>
              )}
              {filteredProducts.map((p) => {
                const isItemSelect = isSelected(p.id);
                const isService = isServiceItem(p);
                return (
                  <div key={p.id} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex-1 space-y-1 text-left">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isService ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProductForDetails(p);
                              setDetailsModalReadOnly(true);
                              setIsDetailsModalOpen(true);
                            }}
                            className="font-bold text-sm text-primary hover:underline text-left cursor-pointer"
                          >
                            {p.model}
                          </button>
                        ) : (
                          <span className="font-bold text-sm text-neutral-900 dark:text-white">{p.model}</span>
                        )}
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          isService 
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" 
                            : "bg-blue-100 text-blue-800 dark:bg-primary/20 dark:text-primary-300"
                        }`}>
                          {isService ? "Serviço" : "Produto"}
                        </span>
                        {isFieldActive("category") && p.category && (
                          <span className="text-[10px] bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 px-2 py-0.5 rounded-md font-medium">
                            {p.category}
                          </span>
                        )}
                        {isFieldActive("sku") && p.sku && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {getFieldLabel("sku", "Código")}: {p.sku}
                          </span>
                        )}
                      </div>
                      
                      {(isService || isFieldActive("description")) && p.description && (
                        <p className="text-xs text-muted-foreground max-w-xl leading-relaxed">{p.description}</p>
                      )}
                      
                      {/* Active Custom and Option Attributes */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-medium pt-1 text-neutral-600 dark:text-neutral-400">
                        {fieldsConfig
                          .filter((f) => f.isActive && f.key !== "model" && f.key !== "description" && f.key !== "category" && f.key !== "sku" && f.key !== "status")
                          .map((f) => {
                            const isCustom = f.isCustom;
                            const val = isCustom ? p.custom_fields?.[f.key] : p[f.key as keyof typeof p];
                            
                            if (isValueEmpty(val)) return null;
                            
                            let renderedVal = "";
                            if (f.type === "boolean") {
                              renderedVal = val ? "Sim" : "Não";
                            } else if (f.type === "currency") {
                              renderedVal = formatCurrencyBRL(Number(val));
                            } else if (Array.isArray(val)) {
                              renderedVal = val.join(", ");
                            } else {
                              renderedVal = String(val);
                            }
                            
                            return (
                              <span key={f.key} className="border-r pr-4 last:border-0 last:pr-0">
                                <span className="font-semibold text-neutral-500 dark:text-neutral-500">{f.label}:</span>{" "}
                                <strong className="text-primary">{renderedVal}</strong>
                              </span>
                            );
                          })}
                      </div>
                    </div>
                    <Button size="sm" variant={isItemSelect ? "destructive" : "outline"} className="h-9 w-9 p-0 rounded-full shrink-0 ml-3" onClick={() => toggleProduct(p)}>
                      {isItemSelect ? <Trash2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  </div>
                );
              })}
            </div>
            </div>
            )}

            {/* Selected items with editing & bonification */}
            {form.selectedProducts.length > 0 && (
              <div className="space-y-3 pt-6 border-t">
                <Label className="font-bold text-lg text-neutral-900 dark:text-white flex text-left">Itens Selecionados ({form.selectedProducts.length})</Label>
                <div className="grid grid-cols-1 gap-4">
                  {form.selectedProducts.map((p: any) => {
                    const isManualService = p.baseId?.startsWith("manual-service");
                    const currencyField = fieldsConfig.find(f => f.isActive && f.type === "currency");
                    const price = currencyField 
                      ? (currencyField.isCustom ? p.custom_fields?.[currencyField.key] : p[currencyField.key])
                      : 0;
                    const defaultPrice = Number(price || p.value_12m || p.value_24m || 0);

                    const bonifiedQty = p.bonificado ? Math.min(p.bonificadoQty ?? p.quantity, p.quantity) : 0;
                    const regularQty = p.quantity - bonifiedQty;
                    const unitPrice = p.unitPrice ?? defaultPrice;
                    const regularTotal = unitPrice * regularQty;

                    return (
                      <div 
                        key={p.baseId} 
                        className={`p-4 border rounded-xl transition-colors text-left ${
                          p.bonificado 
                            ? "bg-amber-50/50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-900/30" 
                            : "bg-primary/5 border-primary/10"
                        }`}
                      >
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="flex-1">
                              {isManualService ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-black text-primary uppercase tracking-wider flex items-center gap-1.5 py-1.5">
                                    <Plus className="h-4 w-4 text-primary shrink-0" /> Serviço Manual
                                  </span>
                                </div>
                              ) : (
                                <Input
                                  value={p.name}
                                  onChange={(e) => setForm((prev: any) => ({
                                    ...prev,
                                    selectedProducts: prev.selectedProducts.map((sp: any) => sp.baseId === p.baseId ? { ...sp, name: e.target.value } : sp)
                                  }))}
                                  className="text-sm font-bold h-9 bg-card"
                                />
                              )}
                            </div>
                            
                            {p.bonificado && (
                              <span className="text-[10px] font-black uppercase tracking-widest bg-amber-400 text-amber-900 px-2 py-1 rounded-full shrink-0">
                                {bonifiedQty === p.quantity ? "Bonificado" : "Parcial"}
                              </span>
                            )}
                          </div>

                          {isServiceItem(p) ? (
                            <div className="space-y-3 animate-in fade-in duration-200">
                              <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground uppercase font-bold">Descrição do Serviço</Label>
                                <Textarea
                                  value={p.description || ""}
                                  onChange={(e) => setForm((prev: any) => ({
                                    ...prev,
                                    selectedProducts: prev.selectedProducts.map((sp: any) => 
                                      sp.baseId === p.baseId ? { ...sp, description: e.target.value } : sp
                                    )
                                  }))}
                                  placeholder="Digite a descrição do serviço para esta proposta..."
                                  className="text-xs resize-none h-16 rounded-xl bg-card border-primary/20 focus-visible:ring-primary"
                                />
                              </div>
                              {(!isManualService || p.showObs || p.custom_fields?.observacao) ? (
                                <div className="space-y-1.5 animate-in slide-in-from-top-1 duration-200">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-[10px] text-muted-foreground uppercase font-bold">Observação do Serviço</Label>
                                    {isManualService && (
                                      <button
                                        type="button"
                                        onClick={() => setForm((prev: any) => ({
                                          ...prev,
                                          selectedProducts: prev.selectedProducts.map((sp: any) =>
                                            sp.baseId === p.baseId
                                              ? { 
                                                  ...sp, 
                                                  showObs: false,
                                                  custom_fields: { ...sp.custom_fields, observacao: "" } 
                                                }
                                              : sp
                                          )
                                        }))}
                                        className="text-[10px] text-destructive hover:underline font-bold"
                                      >
                                        Remover Observação
                                      </button>
                                    )}
                                  </div>
                                  <Textarea
                                    value={p.custom_fields?.observacao || ""}
                                    onChange={(e) => setForm((prev: any) => ({
                                      ...prev,
                                      selectedProducts: prev.selectedProducts.map((sp: any) => {
                                        if (sp.baseId === p.baseId) {
                                          const cf = { ...sp.custom_fields, observacao: e.target.value };
                                          return { ...sp, custom_fields: cf };
                                        }
                                        return sp;
                                      })
                                    }))}
                                    placeholder="Digite a observação do serviço para esta proposta..."
                                    className="text-xs resize-none h-16 rounded-xl bg-card border-primary/20 focus-visible:ring-primary"
                                  />
                                </div>
                              ) : (
                                <div className="pt-1">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setForm((prev: any) => ({
                                      ...prev,
                                      selectedProducts: prev.selectedProducts.map((sp: any) =>
                                        sp.baseId === p.baseId ? { ...sp, showObs: true } : sp
                                      )
                                    }))}
                                    className="text-[10px] font-bold h-8 rounded-xl flex items-center gap-1 border-dashed border-primary/30 hover:bg-primary/5 hover:border-primary/50 text-primary transition-all"
                                  >
                                    <Plus className="h-3.5 w-3.5" /> Adicionar Observação
                                  </Button>
                                </div>
                              )}
                            </div>
                          ) : (
                            p.description && (
                              <div className="text-[11px] text-muted-foreground break-words bg-card/50 p-2.5 rounded-lg border border-dashed">
                                {p.description}
                              </div>
                            )
                          )}

                          {/* Active Custom and Option Attributes */}
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-medium text-neutral-600 dark:text-neutral-400">
                            {fieldsConfig
                              .filter((f) => f.isActive && f.key !== "model" && f.key !== "description" && f.key !== "category" && f.key !== "sku" && f.key !== "status")
                              .map((f) => {
                                const isCustom = f.isCustom;
                                const val = isCustom ? p.custom_fields?.[f.key] : p[f.key as keyof typeof p];
                                
                                if (isValueEmpty(val)) return null;
                                
                                let renderedVal = "";
                                if (f.type === "boolean") {
                                  renderedVal = val ? "Sim" : "Não";
                                } else if (f.type === "currency") {
                                  renderedVal = formatCurrencyBRL(Number(val));
                                } else if (Array.isArray(val)) {
                                  renderedVal = val.join(", ");
                                } else {
                                  renderedVal = String(val);
                                }
                                
                                return (
                                  <span key={f.key} className="border-r pr-3 last:border-0 last:pr-0">
                                    <span className="font-semibold text-neutral-500 dark:text-neutral-500">{f.label}:</span>{" "}
                                    <strong className="text-primary">{renderedVal}</strong>
                                  </span>
                                );
                              })}
                          </div>

                          {/* Pricing and Bonification controls row */}
                          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t">
                            <div className="flex flex-wrap items-center gap-3">
                              {!isManualService && (
                                <>
                                  <div className="flex flex-col gap-1 w-16">
                                    <Label className="text-[10px] text-muted-foreground uppercase font-bold text-center">Qtd</Label>
                                    <Input
                                      type="number"
                                      className="h-8 text-xs bg-card text-center font-bold"
                                      value={p.quantity}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setForm((prev: any) => ({
                                          ...prev,
                                          selectedProducts: prev.selectedProducts.map((sp: any) =>
                                            sp.baseId === p.baseId
                                              ? { ...sp, quantity: val === "" ? "" : Math.max(1, parseInt(val) || 1) }
                                              : sp
                                          )
                                        }));
                                      }}
                                      onBlur={(e) => {
                                        const val = e.target.value;
                                        if (val === "" || parseInt(val) < 1) {
                                          setForm((prev: any) => ({
                                            ...prev,
                                            selectedProducts: prev.selectedProducts.map((sp: any) =>
                                              sp.baseId === p.baseId ? { ...sp, quantity: 1 } : sp
                                            )
                                          }));
                                        }
                                      }}
                                    />
                                  </div>
                                  
                                  <div className="flex flex-col gap-1 w-28">
                                    <Label className="text-[10px] text-muted-foreground uppercase font-bold text-right">Vlr. Unitário</Label>
                                    <Input
                                      type="text"
                                      className="h-8 text-xs bg-card text-right font-bold"
                                      value={formatInitialCurrency(p.unitPrice ?? defaultPrice)}
                                      onChange={(e) => {
                                        const masked = handleCurrencyInput(e.target.value);
                                        const numericVal = parseCurrencyBRLToNumber(masked);
                                        setForm((prev: any) => ({
                                          ...prev,
                                          selectedProducts: prev.selectedProducts.map((sp: any) => 
                                            sp.baseId === p.baseId ? { ...sp, unitPrice: numericVal } : sp
                                          )
                                        }));
                                      }}
                                    />
                                  </div>

                                  {p.bonificado && p.quantity > 1 && (
                                    <div className="flex flex-col gap-1">
                                      <Label className="text-[10px] text-muted-foreground uppercase font-bold text-left pl-1">Qtd Bonif.</Label>
                                      <div className="flex items-center bg-amber-100/50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl px-2 h-8">
                                        <select
                                          value={bonifiedQty}
                                          onChange={(e) => {
                                            const val = parseInt(e.target.value, 10);
                                            setForm((prev: any) => ({
                                              ...prev,
                                              selectedProducts: prev.selectedProducts.map((sp: any) =>
                                                sp.baseId === p.baseId
                                                  ? { ...sp, bonificadoQty: val }
                                                  : sp
                                              ),
                                            }));
                                          }}
                                          className="bg-transparent border-none text-xs font-black text-amber-950 dark:text-amber-200 focus:outline-none focus:ring-0 cursor-pointer"
                                        >
                                          {Array.from({ length: p.quantity }, (_, i) => i + 1).map((num) => (
                                            <option key={num} value={num} className="bg-card text-foreground">
                                              {num}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {!isManualService && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setForm((prev: any) => ({
                                      ...prev,
                                      selectedProducts: prev.selectedProducts.map((sp: any) =>
                                        sp.baseId === p.baseId
                                          ? { 
                                              ...sp, 
                                              bonificado: !sp.bonificado,
                                              bonificadoQty: !sp.bonificado ? sp.quantity : 0
                                            }
                                          : sp
                                      ),
                                    }))
                                  }
                                  className={`flex items-center justify-center gap-1 text-xs font-bold px-3 h-8 rounded-xl border transition-all duration-200 ${
                                    p.bonificado
                                      ? "bg-amber-400 border-amber-400 text-amber-900 hover:bg-amber-300"
                                      : "bg-transparent border-muted hover:border-amber-400 hover:text-amber-600"
                                  }`}
                                  title={p.bonificado ? "Remover bonificação" : "Bonificar item (Valor R$ 0)"}
                                >
                                  <span>{p.bonificado ? "★" : "☆"}</span>
                                  <span>{p.bonificado ? "Bonificado" : "Bonificar"}</span>
                                </button>
                              )}

                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 w-8 p-0 rounded-xl" 
                                onClick={() => setForm((prev: any) => ({ ...prev, selectedProducts: prev.selectedProducts.filter((sp: any) => sp.baseId !== p.baseId) }))}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>

                          {/* Subtotal preview info inside card */}
                          {p.bonificado && (
                            <div className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-500/5 p-2 rounded-lg border border-amber-500/10">
                              {regularQty > 0 ? (
                                <span>
                                  Subtotal considerado: <strong>{formatCurrencyBRL(regularTotal)}</strong> ({regularQty} paga{regularQty > 1 ? "s" : ""}) + <strong>R$ 0,00</strong> ({bonifiedQty} bonificada{bonifiedQty > 1 ? "s" : ""})
                                </span>
                              ) : (
                                <span>Item 100% bonificado (Valor R$ 0,00)</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Seção de Responsabilidades */}
            <div className="space-y-4 p-4 bg-muted/20 rounded-2xl border">
              <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5" /> Responsabilidades
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Responsabilidades do Cliente */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Do Cliente</p>
                  {respOptions.cliente.map((r) => (
                    <label key={r.id} className="flex items-start gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-rose-600 h-4 w-4 rounded cursor-pointer shrink-0"
                        checked={form.respCliente.includes(r.id)}
                        onChange={(e) => {
                          const current = form.respCliente as string[];
                          if (e.target.checked) {
                            set("respCliente", [...current, r.id]);
                          } else {
                            set("respCliente", current.filter((id: string) => id !== r.id));
                          }
                        }}
                      />
                      <span className="text-sm text-foreground group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors leading-snug">{r.label}</span>
                    </label>
                  ))}
                  
                  {/* Quick add Do Cliente */}
                  <div className="flex gap-2 pt-2 items-center">
                    <Input
                      placeholder="Adicionar responsabilidade..."
                      value={newRespClienteText}
                      onChange={(e) => setNewRespClienteText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddQuickRespCliente();
                        }
                      }}
                      className="h-8 text-xs rounded-xl bg-card border border-rose-200 dark:border-rose-950 focus-visible:ring-rose-500"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddQuickRespCliente}
                      className="h-8 rounded-xl px-2.5 bg-rose-600 hover:bg-rose-700 text-white shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="pt-3">
                    <Label htmlFor="obs-resp-cliente" className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">Observações das Responsabilidades</Label>
                    <Textarea
                      id="obs-resp-cliente"
                      value={form.obsResponsabilidadeCliente || ""}
                      onChange={(e) => set("obsResponsabilidadeCliente", e.target.value)}
                      placeholder="Ex: Detalhes, ressalvas ou observações adicionais sobre as responsabilidades do cliente..."
                      rows={2}
                      className="text-xs bg-card rounded-xl mt-1 border-rose-200 dark:border-rose-950 focus-visible:ring-rose-500"
                    />
                  </div>
                </div>

                {/* Responsabilidades Orbitalmais */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-primary uppercase tracking-wider">Da Orbitalmais</p>
                  {respOptions.orbital.map((r) => (
                    <label key={r.id} className="flex items-start gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-primary h-4 w-4 rounded cursor-pointer shrink-0"
                        checked={form.respOrbital.includes(r.id)}
                        onChange={(e) => {
                          const current = form.respOrbital as string[];
                          if (e.target.checked) {
                            set("respOrbital", [...current, r.id]);
                          } else {
                            set("respOrbital", current.filter((id: string) => id !== r.id));
                          }
                        }}
                      />
                      <span className="text-sm text-foreground group-hover:text-primary transition-colors leading-snug">{r.label}</span>
                    </label>
                  ))}

                  {/* Quick add Da Orbitalmais */}
                  <div className="flex gap-2 pt-2 items-center">
                    <Input
                      placeholder="Adicionar responsabilidade..."
                      value={newRespOrbitalText}
                      onChange={(e) => setNewRespOrbitalText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddQuickRespOrbital();
                        }
                      }}
                      className="h-8 text-xs rounded-xl bg-card border border-primary/20 focus-visible:ring-primary"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddQuickRespOrbital}
                      className="h-8 rounded-xl px-2.5 bg-primary hover:bg-primary/90 text-white shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Prazo + Corpo de Prova / EPS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-muted/20 rounded-2xl border">
              <h4 className="sm:col-span-2 font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <FileText className="h-3.5 w-3.5" /> Prazo e Corpo de Prova
              </h4>

              {/* Prazo */}
              <div className="space-y-1.5">
                <Label htmlFor="prazo">Prazo de Execução</Label>
                <Input
                  id="prazo"
                  value={form.prazo || ""}
                  onChange={(e) => set("prazo", e.target.value)}
                  placeholder="Ex: 6 a 10 dias"
                  className="rounded-xl bg-card"
                />
              </div>

              {/* Corpo de Prova / EPS */}
              <div className="space-y-1.5">
                <Label>Corpo de Prova — EPS da Orbitalmais?</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => set("usaEpsOrbital", true)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      form.usaEpsOrbital === true
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-muted hover:border-primary/30"
                    }`}
                  >
                    <span className="font-bold text-sm block">✓ Sim</span>
                    <span className="text-[11px] text-muted-foreground leading-tight block mt-0.5">Usa EPS da Orbitalmais</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => set("usaEpsOrbital", false)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      form.usaEpsOrbital === false
                        ? "border-amber-500 bg-amber-500/5 text-amber-700 dark:text-amber-400"
                        : "border-muted hover:border-amber-400/40"
                    }`}
                  >
                    <span className="font-bold text-sm block">✗ Não</span>
                    <span className="text-[11px] text-muted-foreground leading-tight block mt-0.5">+1 mobilização / mock-up</span>
                  </button>
                </div>
                {form.usaEpsOrbital === false && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium animate-in fade-in duration-200">
                    → +1 para mobilização e soldagem do mock-up
                  </p>
                )}
                {form.usaEpsOrbital === true && (
                  <p className="text-[11px] text-primary font-medium animate-in fade-in duration-200">
                    → EPS da Orbitalmais incluso, sem acréscimo de dia
                  </p>
                )}
              </div>
            </div>
          </div>
        );

      /* Step 4: Fechamento & Condições de Pagamento */
      case 4:
        return (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Total price card */}
            <div className="p-5 bg-primary text-white rounded-3xl space-y-1.5 text-left shadow-md">
              <Label className="text-white/80 text-[10px] uppercase tracking-widest font-extrabold">Valor Total da Proposta</Label>
              <Input
                placeholder="R$ 0,00"
                className="bg-transparent border-none text-3xl font-black text-white placeholder:text-white/40 p-0 h-auto focus-visible:ring-0 w-full"
                value={form.totalPrice}
                onChange={(e) => set("totalPrice", formatCurrency(e.target.value))}
              />
            </div>

            {/* Condição de Pagamento */}
            <div className="p-5 bg-card border rounded-3xl space-y-4 text-left shadow-sm">
              <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
                Condições de Pagamento
              </h4>
              <div className="flex flex-col gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="porcentagem-entrada" className="text-xs font-bold text-neutral-700 dark:text-neutral-300">% na Mobilização</Label>
                  <Input
                    id="porcentagem-entrada"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="Ex: 30"
                    value={form.porcentagemEntrada || ""}
                    onChange={(e) => set("porcentagemEntrada", e.target.value)}
                    className="rounded-xl bg-card"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="porcentagem-final" className="text-xs font-bold text-neutral-700 dark:text-neutral-300">% após término de cada serviço</Label>
                  <Input
                    id="porcentagem-final"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="Ex: 70"
                    value={form.porcentagemFinal || ""}
                    onChange={(e) => set("porcentagemFinal", e.target.value)}
                    className="rounded-xl bg-card"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dias-quitacao" className="text-xs font-bold text-neutral-700 dark:text-neutral-300">Prazo (Dias após término)</Label>
                  <Input
                    id="dias-quitacao"
                    type="number"
                    min="0"
                    placeholder="Ex: 15"
                    value={form.diasQuitacao || ""}
                    onChange={(e) => set("diasQuitacao", e.target.value)}
                    className="rounded-xl bg-card"
                  />
                </div>
              </div>
            </div>
          </div>
        );

      /* Step 5: Success */
      case 5:
        return (
          <div className="py-10 flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in-95 duration-500">
            <div className="p-4 bg-green-100 dark:bg-green-900/30 rounded-full">
              <CheckCircle2 className="h-16 w-16 text-green-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-black text-neutral-900 dark:text-white">Proposta Gerada!</h2>
              <p className="text-muted-foreground max-w-sm">
                O documento foi baixado. Você pode baixar novamente ou iniciar uma nova proposta.
              </p>
            </div>
            <div className="p-4 bg-muted/30 rounded-2xl border border-dashed text-left w-full space-y-1">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <Info className="h-4 w-4" /> Dica
              </div>
              <p className="text-xs text-muted-foreground">
                Para substituir o template, acesse <strong>Configurações → Bases Salvas</strong> e envie seu arquivo DOCX base.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 w-full max-w-xs">
              <Button variant="outline" className="h-12 rounded-2xl" onClick={handleGenerate} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                Baixar Novamente
              </Button>
              <Button className="h-12 rounded-2xl" onClick={onCancel}>Voltar ao Início</Button>
            </div>
          </div>
        );

      default: return null;
    }
  };

  return (
    <>
      <Card className="max-w-2xl mx-auto proposal-highlight rounded-3xl border-none shadow-md w-full">
        <CardHeader className="bg-primary text-white p-6 md:p-8">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-xl md:text-2xl font-black">
                {currentStep === 5 ? "Concluído" : `Passo ${currentStep}`}
              </CardTitle>
              <CardDescription className="text-white/70 text-xs md:text-sm">
                {currentStep === 1 && "Dados do cliente"}
                {currentStep === 2 && "Informações do serviço e local"}
                {currentStep === 3 && "Itens e Serviços"}
                {currentStep === 4 && "Fechamento e Condições"}
                {currentStep === 5 && "Proposta de serviço pronta"}
              </CardDescription>
            </div>
            {currentStep < 5 && (
              <div className="text-xs bg-white/20 px-3 py-1 rounded-full text-white">
                {currentStep}/4
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-6 md:p-8">
          {renderStep()}

          {currentStep < 5 && (
            <div className="flex justify-between mt-6 pt-4 border-t">
              <div className="flex gap-2">
                <Button variant="ghost" className="rounded-xl"
                  onClick={currentStep === 1 ? onCancel : () => setCurrentStep((p) => p - 1)}>
                  {currentStep === 1 ? "Cancelar" : "Voltar"}
                </Button>
                {currentStep >= 2 && (
                  <Button variant="outline" className="rounded-xl" onClick={handleSaveDraft}>
                    <Save className="mr-2 h-4 w-4" /> Salvar rascunho
                  </Button>
                )}
              </div>

              {currentStep < 4 ? (
                <Button className="rounded-xl px-6" onClick={handleNextStep}>
                  Próximo <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button className="rounded-xl px-6 font-bold" onClick={handleGenerate} disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                  Gerar DOCX
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {showRevisionModal && revisionData && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowRevisionModal(false)}
        >
          <div 
            className="relative bg-card border rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-200 text-left border-primary/20"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setShowRevisionModal(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
              title="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
            
            {/* Case A: Multiple quotes found - Step 1: Choose Mode */}
            {revisionData.existingQuotes && revisionData.existingQuotes.length > 1 && revisionModalStep === "choose-mode" && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h3 className="text-2xl font-black text-neutral-900 dark:text-white flex items-center gap-2">
                    <span className="text-primary">★</span> Orçamentos Anteriores
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Identificamos <strong>{revisionData.existingQuotes.length}</strong> orçamentos anteriores associados ao CNPJ <strong>{form.cnpj}</strong>. Como você deseja proceder?
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => setRevisionModalStep("select-quote")}
                    className="w-full h-14 rounded-2xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    Revisar um Orçamento Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectRevisionMode("new")}
                    className="w-full h-14 rounded-2xl bg-transparent border-2 border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200 font-bold text-sm hover:bg-muted transition-colors"
                  >
                    Criar como Novo Orçamento (REV0)
                  </button>
                </div>
              </div>
            )}

            {/* Case A: Multiple quotes found - Step 2: Select Quote */}
            {revisionData.existingQuotes && revisionData.existingQuotes.length > 1 && revisionModalStep === "select-quote" && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <h3 className="text-2xl font-black text-neutral-900 dark:text-white">Selecione o Orçamento</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Escolha qual dos orçamentos abaixo você gostaria de alterar (gerar nova revisão):
                  </p>
                </div>

                <div className="border rounded-2xl divide-y bg-muted/20 max-h-60 overflow-y-auto shadow-inner">
                  {revisionData.existingQuotes.map((q: any) => {
                    const { rev } = parseProposalNumber(q.proposal_number);
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => {
                          setSelectedQuoteForRevision(q);
                          setRevisionModalStep("confirm-revision");
                        }}
                        className="w-full p-4 hover:bg-primary/5 text-left transition-colors flex items-center justify-between group"
                      >
                        <div className="space-y-1">
                          <p className="font-bold text-neutral-800 dark:text-neutral-200 group-hover:text-primary transition-colors">
                            {q.proposal_number}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Data: {q.proposal_date || "N/A"} • Cliente: {q.contact_name || "N/A"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-neutral-900 dark:text-white">
                            {formatCurrencyBRL(q.total_price || 0)}
                          </p>
                          <span className="text-[10px] uppercase tracking-wider font-bold bg-neutral-200 dark:bg-neutral-800 px-2 py-0.5 rounded text-muted-foreground">
                            REV{rev}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    variant="ghost"
                    className="w-full h-12 rounded-xl"
                    onClick={() => setRevisionModalStep("choose-mode")}
                  >
                    Voltar
                  </Button>
                </div>
              </div>
            )}

            {/* Case A: Multiple quotes found - Step 3: Confirm Revision */}
            {revisionModalStep === "confirm-revision" && selectedQuoteForRevision && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <h3 className="text-2xl font-black text-neutral-900 dark:text-white">Confirmar Nova Revisão</h3>
                  <div className="p-4 bg-primary/5 border border-primary/10 rounded-2xl space-y-2 text-sm">
                    <p className="text-neutral-800 dark:text-neutral-200">
                      Você selecionou o orçamento:
                    </p>
                    <div className="font-mono bg-white dark:bg-neutral-950 p-3 rounded-xl border space-y-1 text-xs">
                      <p><strong>Número:</strong> {selectedQuoteForRevision.proposal_number}</p>
                      <p><strong>Data:</strong> {selectedQuoteForRevision.proposal_date || "N/A"}</p>
                      <p><strong>Valor:</strong> {formatCurrencyBRL(selectedQuoteForRevision.total_price || 0)}</p>
                      <p><strong>Cliente:</strong> {selectedQuoteForRevision.contact_name || "N/A"}</p>
                    </div>
                    <p className="text-xs text-muted-foreground pt-1">
                      A nova versão será a <strong>REV{parseProposalNumber(selectedQuoteForRevision.proposal_number).rev + 1}</strong> e carregará automaticamente todos os itens e dados deste orçamento.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="ghost"
                    className="h-12 rounded-xl"
                    onClick={() => setRevisionModalStep("select-quote")}
                  >
                    Voltar
                  </Button>
                  <Button
                    className="h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold"
                    onClick={() => handleSelectRevisionMode("revision", selectedQuoteForRevision)}
                  >
                    Confirmar REV{parseProposalNumber(selectedQuoteForRevision.proposal_number).rev + 1}
                  </Button>
                </div>
              </div>
            )}

            {/* Case B: Only one quote found - Straight confirmation */}
            {revisionData.existingQuotes && revisionData.existingQuotes.length === 1 && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <h3 className="text-2xl font-black text-neutral-900 dark:text-white flex items-center gap-2">
                    <span className="text-primary">★</span> Orçamento Encontrado
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Identificamos um orçamento anterior para este CNPJ na base de dados.
                  </p>
                  
                  <div className="p-4 bg-primary/5 border border-primary/10 rounded-2xl space-y-2 text-sm">
                    <p className="text-neutral-800 dark:text-neutral-200">
                      Dados do orçamento encontrado:
                    </p>
                    <div className="font-mono bg-white dark:bg-neutral-950 p-3 rounded-xl border space-y-1 text-xs">
                      <p><strong>Número:</strong> {revisionData.existingQuotes[0].proposal_number}</p>
                      <p><strong>Data:</strong> {revisionData.existingQuotes[0].proposal_date || "N/A"}</p>
                      <p><strong>Valor:</strong> {formatCurrencyBRL(revisionData.existingQuotes[0].total_price || 0)}</p>
                      <p><strong>Cliente:</strong> {revisionData.existingQuotes[0].contact_name || "N/A"}</p>
                    </div>
                    <p className="text-xs text-muted-foreground pt-1">
                      Deseja criar a revisão <strong>REV{parseProposalNumber(revisionData.existingQuotes[0].proposal_number).rev + 1}</strong> deste orçamento ou iniciar um novo?
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => handleSelectRevisionMode("revision", revisionData.existingQuotes[0])}
                    className="w-full h-14 rounded-2xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    Sim, criar revisão (REV{parseProposalNumber(revisionData.existingQuotes[0].proposal_number).rev + 1})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectRevisionMode("new")}
                    className="w-full h-14 rounded-2xl bg-transparent border-2 border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200 font-bold text-sm hover:bg-muted transition-colors"
                  >
                    Não, criar Novo Orçamento (REV0)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Quick-Add Type Dialog */}
      <Dialog open={!!quickAddTarget} onOpenChange={(open) => { if (!open) setQuickAddTarget(null); }}>
        <DialogContent className="sm:max-w-[380px] rounded-3xl border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Plus className={`h-5 w-5 ${quickAddTarget === "servico" ? "text-primary" : quickAddTarget === "junta" ? "text-indigo-600" : "text-amber-600"}`} />
              Novo Tipo de {quickAddTarget === "servico" ? "Serviço" : quickAddTarget === "junta" ? "Junta" : "Material"}
            </DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(e) => { e.preventDefault(); handleQuickAddType(); }}
            className="space-y-4 py-2"
          >
            <div className="space-y-2">
              <Label htmlFor="quick-add-name">Nome</Label>
              <Input
                id="quick-add-name"
                placeholder={
                  quickAddTarget === "servico"
                    ? "Ex: Inspeção Visual"
                    : quickAddTarget === "junta"
                    ? "Ex: Junta de Topo"
                    : "Ex: Aço Carbono"
                }
                value={quickAddName}
                onChange={(e) => setQuickAddName(e.target.value)}
                className="rounded-xl font-medium"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground italic">
                O tipo será criado e selecionado automaticamente. Para adicionar atributos customizados, acesse Configurações → Tipos.
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setQuickAddTarget(null)}
                className="rounded-xl font-semibold"
                disabled={savingQuickAdd}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={!quickAddName.trim() || savingQuickAdd}
                className={`rounded-xl font-bold text-white ${
                  quickAddTarget === "servico"
                    ? "bg-primary hover:bg-primary/90"
                    : quickAddTarget === "junta"
                    ? "bg-indigo-600 hover:bg-indigo-700"
                    : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                {savingQuickAdd ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Criar e Selecionar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {selectedProductForDetails && (
        <ProductModal
          open={isDetailsModalOpen}
          onOpenChange={setIsDetailsModalOpen}
          product={selectedProductForDetails}
          onSaveSuccess={loadProducts}
          initialReadOnly={detailsModalReadOnly}
        />
      )}
    </>
  );
}
