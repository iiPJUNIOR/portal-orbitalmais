"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowRight, Loader2, Search, Plus, Trash2, Info, FileText, CheckCircle2, RefreshCw, ArrowLeft, Save } from "lucide-react";
import { generateProposalNumber, generateProposalPDF } from "@/services/proposalService";
import { getProposalSequenceAndRevision } from "@/services/supabaseService";
import { fetchProducts } from "@/services/productService";
import { formatCurrencyBRL } from "@/lib/formatters";
import { saveDraft, updateDraft } from "@/services/draftService";
import { saveUserSettings, getUserSettings, ProductFieldDef, defaultFields } from "@/services/settingsService";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface WizardProps {
  initialSellerData: {
    name: string;
    role: string;
    email: string;
    phone: string;
  };
  onComplete: (data: any) => void;
  onCancel: () => void;
  initialData?: any;
  initialStep?: number;
  draftId?: string;
}

const isServiceItem = (item: any) => {
  const cat = (item.category || "").toLowerCase();
  const desc = (item.description || "").toLowerCase();
  const model = (item.model || item.name || "").toLowerCase();
  return cat.includes("serviço") || cat.includes("suporte") || cat.includes("instalação") || desc.includes("software") || desc.includes("idsocial") || desc.includes("idsecure") || model.includes("idpower");
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

export function ProposalWizard({ initialSellerData, onComplete, onCancel, initialData, initialStep, draftId }: WizardProps) {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [formData, setFormData] = useState<any>({
    proposalNumber: "",
    version: "0",
    date: new Date().toISOString().split('T')[0],
    companyName: "",
    contactName: "",
    cnpj: "",
    address: "",
    email: "",
    phone: "",
    sellerName: initialSellerData.name || "",
    sellerRole: initialSellerData.role || "",
    sellerEmail: initialSellerData.email || "",
    sellerPhone: initialSellerData.phone || "",
    users: "",
    devices: 0,
    qtd: "0",
    qtd1: "0",
    qtd2: "0",
    selectedProducts: [] as any[],
    totalPrice: 0,
    includeApprovalPage: true,
    approvalLink: "",
    ensaiosInclusos: false
  });
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [fieldsConfig, setFieldsConfig] = useState<ProductFieldDef[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const lastFetchedCnpj = useRef<string>("");
  const [totalPriceInput, setTotalPriceInput] = useState("");
  const prevCalculatedSum = useRef(0);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionData, setRevisionData] = useState<any>(null);

  const calculatedSum = React.useMemo(() => {
    const currencyField = fieldsConfig.find(f => f.isActive && f.type === "currency");
    return (formData.selectedProducts || []).reduce((sum: number, p: any) => {
      const bonifiedQty = p.bonificado ? Math.min(p.bonificadoQty ?? p.quantity, p.quantity) : 0;
      const regularQty = Math.max(0, (p.quantity || 1) - bonifiedQty);
      if (regularQty <= 0) return sum;
      
      const price = currencyField 
        ? (currencyField.isCustom ? p.custom_fields?.[currencyField.key] : p[currencyField.key])
        : 0;
      const effectivePrice = Number(p.unitPrice || price || p.value_12m || p.value_24m || 0);
      return sum + (effectivePrice * regularQty);
    }, 0);
  }, [formData.selectedProducts, fieldsConfig]);

  useEffect(() => {
    if (formData.totalPrice === 0 || formData.totalPrice === prevCalculatedSum.current) {
      setFormData((prev: any) => ({ ...prev, totalPrice: calculatedSum }));
      setTotalPriceInput(formatInitialCurrency(calculatedSum));
      prevCalculatedSum.current = calculatedSum;
    }
  }, [calculatedSum]);

  useEffect(() => {
    if (formData.totalPrice && !totalPriceInput) {
      setTotalPriceInput(formatInitialCurrency(formData.totalPrice));
    }
  }, [formData.totalPrice]);

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

  const [todaySequence, setTodaySequence] = useState<number>(1);
  const [isProposalNumberEdited, setIsProposalNumberEdited] = useState(false);
  const isInitialMount = useRef(true);

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

      const cleanCnpj = (formData.cnpj || "").replace(/\D/g, "");
      if (cleanCnpj.length < 14) {
        setRevisionData(null);
        setShowRevisionModal(false);
        const { sequence, revision } = await getProposalSequenceAndRevision(cleanCnpj);
        setTodaySequence(sequence);
        setFormData((prev: any) => ({ ...prev, version: String(revision) }));
        return;
      }

      const res = await getProposalSequenceAndRevision(cleanCnpj);
      
      // Prefill contact data if returned
      setFormData((prev: any) => {
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
        setShowRevisionModal(true);
      } else {
        // CNPJ new to database, use default global sequence
        setTodaySequence(res.sequence);
        setFormData((prev: any) => ({ ...prev, version: String(res.revision) }));
        setRevisionData(null);
        setShowRevisionModal(false);
      }
    }
    loadSequenceAndRevision();
  }, [formData.cnpj]);

  // Automatically generate proposal number
  useEffect(() => {
    if (!isProposalNumberEdited && formData.companyName) {
      const formattedSeq = String(todaySequence).padStart(3, "0");
      const ver = formData.version || "0";
      setFormData((prev: any) => ({
        ...prev,
        proposalNumber: `${prev.companyName} - OBM-${formattedSeq} - REV${ver}`
      }));
    }
  }, [formData.companyName, todaySequence, formData.version, isProposalNumberEdited]);

  // Sync seller data if it arrives late (prevents "sometimes empty" issue)
  useEffect(() => {
    if (initialSellerData) {
      setFormData((prev: any) => ({
        ...prev,
        // Only fill if current value is empty to avoid overwriting user typing
        sellerName: prev.sellerName || initialSellerData.name || "",
        sellerRole: prev.sellerRole || initialSellerData.role || "",
        sellerEmail: prev.sellerEmail || initialSellerData.email || "",
        sellerPhone: prev.sellerPhone || initialSellerData.phone || "",
      }));
    }
  }, [initialSellerData]);

  // If initialData is provided (continuing a draft or editing), initialize state accordingly
  useEffect(() => {
    if (initialData) {
      try {
        // Increment version when editing an existing finalized proposal, keep it same for drafts
        const currentVersion = parseInt(initialData.version ?? "0", 10);
        const nextVersion = draftId ? (isNaN(currentVersion) ? 0 : currentVersion) : (isNaN(currentVersion) ? 1 : currentVersion + 1);
        setFormData((prev: any) => ({
          ...prev,
          ...initialData,
          version: String(nextVersion),
        }));
        // Mark number as edited so auto-gen doesn't overwrite, but allow re-gen with new version
        // We'll re-trigger auto-gen by keeping isProposalNumberEdited false
      } catch (err) {
        console.warn("Failed to apply initialData to wizard", err);
      }
    }
    if (initialStep && typeof initialStep === "number") {
      let mappedStep = initialStep;
      if (initialStep === 3) mappedStep = 2;
      else if (initialStep === 4) mappedStep = 3;
      else if (initialStep === 5) mappedStep = 4;
      else if (initialStep === 6) mappedStep = 5;
      setCurrentStep(mappedStep);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        const settings = await getUserSettings();
        if (Array.isArray(settings?.product_fields)) {
          setFieldsConfig(settings.product_fields);
        } else {
          setFieldsConfig(defaultFields);
        }

        const prods = await fetchProducts();
        const activeProds = prods.filter(p => (p.status || "").toLowerCase() === "ativo");
        setAllProducts(activeProds);
      } catch (err) {
        console.warn("Failed to fetch products or settings", err);
      } finally {
        setLoadingProducts(false);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    let q = 0; let q1 = 0; let q2 = 0;
    (formData.selectedProducts || []).forEach((it: any) => {
      const cat = (it.category || "").toLowerCase();
      const model = (it.name || "").toLowerCase();
      const desc = (it.description || "").toLowerCase();
      const qty = Number(it.quantity) || 0;

      if (model.includes("idblock") || model.includes("torniquete") || cat.includes("catraca") || cat.includes("torniquete")) {
        q1 += qty;
      } else if (cat.includes("serviço") || cat.includes("suporte") || cat.includes("instalação") || desc.includes("software") || desc.includes("idsocial") || desc.includes("idsecure") || model.includes("idpower")) {
        q2 += qty;
      } else {
        q += qty;
      }
    });
    setFormData((prev: any) => ({ ...prev, qtd: String(q), qtd1: String(q1), qtd2: String(q2), devices: q + q1 + q2 }));
  }, [formData.selectedProducts]);



  const selectedMap = React.useMemo(() => {
    const m = new Map<string, number>();
    (formData.selectedProducts || []).forEach((sp: any) => {
      const key = sp.baseId || sp.id;
      m.set(key, Number(sp.quantity) || 1);
    });
    return m;
  }, [formData.selectedProducts]);

  const filteredProducts = React.useMemo(() => {
    const q = productSearch.toLowerCase();
    const arr = allProducts.filter((p) => {
      if (q) {
        const matchesSearch =
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.extras.some((ex: any) => ex.value.toLowerCase().includes(q));
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
  }, [allProducts, productSearch, selectedMap]);

   const cnpjDebounce = useRef<NodeJS.Timeout | null>(null);
  
    const fetchCnpjData = async (rawCnpj: string) => {
      if (rawCnpj.length !== 14 || lastFetchedCnpj.current === rawCnpj) return;
      lastFetchedCnpj.current = rawCnpj;
      const toastId = toast.loading("Buscando CNPJ...");
      try {
        const { fetchCnpjData: lookupCnpj } = await import("@/services/cnpjService");
        const data = await lookupCnpj(rawCnpj);
        setFormData((prev: any) => ({
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
 
   const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
     let value = e.target.value.replace(/\D/g, "");
     if (value.length > 14) value = value.slice(0, 14);
     // Apply mask
     if (value.length >= 3) value = value.replace(/^(\d{2})(\d)/, "$1.$2");
     if (value.length >= 7) value = value.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
     if (value.length >= 11) value = value.replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4");
     if (value.length >= 16) value = value.replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
     setFormData((prev: any) => ({ ...prev, cnpj: value }));
   };
 
   const handleManualCnpjLookup = () => {
     const digits = String(formData.cnpj || "").replace(/\D/g, "");
     if (digits.length === 14) {
       fetchCnpjData(digits);
     } else {
       toast.error("CNPJ deve ter 14 dígitos.");
     }
   };
 
   useEffect(() => {
     if (cnpjDebounce.current) clearTimeout(cnpjDebounce.current);
     const digits = String(formData.cnpj || "").replace(/\D/g, "");
     if (digits.length === 14) {
       cnpjDebounce.current = setTimeout(() => {
         fetchCnpjData(digits);
       }, 600);
     }
     return () => { if (cnpjDebounce.current) clearTimeout(cnpjDebounce.current); };
   }, [formData.cnpj]);

  const handleProductToggle = (product: any) => {
    setFormData((prev: any) => {
      const exists = prev.selectedProducts.find((p: any) => p.baseId === product.id);
      if (exists) {
        return { ...prev, selectedProducts: prev.selectedProducts.filter((p: any) => p.baseId !== product.id) };
      }
      return { ...prev, selectedProducts: [...prev.selectedProducts, { ...product, baseId: product.id, name: product.model, quantity: 1, ensaiosInclusos: false }] };
    });
  };

  const handleSelectRevisionMode = (mode: "revision" | "new") => {
    if (!revisionData) return;

    if (mode === "revision") {
      setTodaySequence(revisionData.sequence);
      setFormData((prev: any) => ({
        ...prev,
        version: String(revisionData.revision)
      }));
      toast.success(`Configurado como Revisão (REV${revisionData.revision})`);
    } else {
      setTodaySequence(revisionData.nextGlobalSequence ?? (revisionData.sequence + 1));
      setFormData((prev: any) => ({
        ...prev,
        version: "0"
      }));
      toast.success(`Configurado como Novo Orçamento (REV0)`);
    }

    setShowRevisionModal(false);
  };

  const handleReset = () => {
    setFormData({
      proposalNumber: "",
      version: "0",
      date: new Date().toISOString().split('T')[0],
      companyName: "",
      contactName: "",
      cnpj: "",
      address: "",
      email: "",
      phone: "",
      sellerName: initialSellerData.name || "",
      sellerRole: initialSellerData.role || "",
      sellerEmail: initialSellerData.email || "",
      sellerPhone: initialSellerData.phone || "",
      users: "",
      devices: 0,
      qtd: "0",
      qtd1: "0",
      qtd2: "0",
      selectedProducts: [] as any[],
      totalPrice: 0,
      includeApprovalPage: true,
      approvalLink: "",
      ensaiosInclusos: false
    });
    setIsProposalNumberEdited(false);
    isInitialMount.current = true;
    setCurrentStep(1);
    lastFetchedCnpj.current = "";
    toast.info("Iniciando novo orçamento.");
  };

  const handleFinish = () => {
    let proposalNumber = formData.proposalNumber;
    if (!proposalNumber) {
      const formattedSeq = String(todaySequence).padStart(3, "0");
      proposalNumber = `${formData.companyName || "Proposta"} - OBM-${formattedSeq} - REV${formData.version || "0"}`;
    }

    // Find the active currency field from the product fields configuration
    const currencyField = fieldsConfig.find(f => f.isActive && f.type === "currency");

    onComplete({
      ...formData,
      proposalNumber,
      items: (formData.selectedProducts || []).flatMap((p: any) => {
        let fallbackPrice = 0;
        if (currencyField) {
          const rawVal = currencyField.isCustom
            ? p.custom_fields?.[currencyField.key]
            : p[currencyField.key];
          fallbackPrice = Number(rawVal) || 0;
        }

        const bonifiedQty = p.bonificado ? Math.min(p.bonificadoQty ?? p.quantity, p.quantity) : 0;
        const regularQty = p.quantity - bonifiedQty;
        const itemsToReturn = [];

        if (regularQty > 0) {
          itemsToReturn.push({
            product: {
              id: p.id,
              description: p.name,
              model: p.name,
              category: p.category,
              part_number: p.sku
            },
            quantity: regularQty,
            bonificado: false,
            ensaiosInclusos: !!formData.ensaiosInclusos,
            unitPrice: p.unitPrice || fallbackPrice || p.value_12m || p.value_24m || 0,
          });
        }

        if (bonifiedQty > 0) {
          itemsToReturn.push({
            product: {
              id: p.id,
              description: `${p.name} (Bonificado)`,
              model: p.name,
              category: p.category,
              part_number: p.sku
            },
            quantity: bonifiedQty,
            bonificado: true,
            ensaiosInclusos: !!formData.ensaiosInclusos,
            unitPrice: 0,
          });
        }

        return itemsToReturn;
      }),
      proposalDate: formData.date,
      totalPrice: formData.totalPrice
    });

    if (draftId) {
      try {
        updateDraft(draftId, { data: formData, step: currentStep });
      } catch {}
    }

    if (currentStep === 4) {
      setCurrentStep(5);
    }
  };


  const handleSaveDraft = async () => {
    try {
      const tId = toast.loading("Salvando rascunho...");
      if (draftId) {
        const ok = updateDraft(draftId, { data: formData, step: currentStep });
        if (ok) {
          toast.success("Rascunho atualizado", { id: tId });
        } else {
          toast.error("Falha ao atualizar rascunho", { id: tId });
        }
        return;
      }

      const id = await saveDraft({ data: formData, step: currentStep });
      toast.success("Rascunho salvo", { id: tId });
    } catch (err) {
      console.error("save draft failed", err);
      toast.error("Erro ao salvar rascunho");
    }
  };

  const appendToName = (baseId: string, suffix: string) => {
    if (!suffix) return;
    setFormData((prev: any) => {
      const next = (prev.selectedProducts || []).map((sp: any) => {
        if (sp.baseId !== baseId) return sp;
        const currentName = String(sp.name || "").trim();
        const parts = currentName.split(" - ").map((s: string) => s.trim()).filter(Boolean);
        if (parts.includes(suffix)) return sp;
        const newName = currentName ? `${currentName} - ${suffix}` : suffix;
        return { ...sp, name: newName };
      });
      return { ...prev, selectedProducts: next };
    });
  };

  const handleNext = async () => {
    if (currentStep === 1) {
      if (!formData.companyName || String(formData.companyName).trim() === "") {
        toast.error("Por favor, preencha a Razão Social da empresa.");
        return;
      }
      if (formData.email && String(formData.email).trim() !== "") {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(String(formData.email).trim())) {
          toast.error("Por favor, insira um e-mail válido.");
          return;
        }
      }
      if (formData.cnpj && String(formData.cnpj).trim() !== "") {
        const cleanCnpj = String(formData.cnpj).replace(/\D/g, "");
        if (cleanCnpj.length !== 14) {
          toast.error("CNPJ inválido. Deve possuir 14 dígitos.");
          return;
        }
      }
    }

    if (currentStep === 2) {
      const sellerPayload: any = {
        seller_name: formData.sellerName || undefined,
        seller_role: formData.sellerRole || undefined,
        seller_email: formData.sellerEmail || undefined,
        seller_phone: formData.sellerPhone || undefined,
      };

      const anyFilled = Object.values(sellerPayload).some((v) => v !== undefined && v !== null && String(v).trim() !== "");
      if (anyFilled) {
        try {
          await saveUserSettings(sellerPayload);
        } catch (err) {
          console.warn("Falha ao salvar perfil automaticamente", err);
        }
      }
    }

    setCurrentStep((prev) => prev + 1);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            {/* Editable Filename / Orçamento Number */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Nome do arquivo / Nº do Orçamento</Label>
                {isProposalNumberEdited && (
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 text-[10px] text-primary hover:text-primary/80 px-2 py-0 font-bold flex items-center gap-1 hover:bg-primary/5 rounded-lg"
                    onClick={() => {
                      setIsProposalNumberEdited(false);
                      const formattedSeq = String(todaySequence).padStart(3, "0");
                      const ver = formData.version || "0";
                      setFormData((prev: any) => ({
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
                  value={formData.proposalNumber}
                  onChange={(e) => {
                    setIsProposalNumberEdited(true);
                    setFormData((prev: any) => ({ ...prev, proposalNumber: e.target.value }));
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
                  value={formData.version} 
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, version: e.target.value }))} 
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input 
                  type="date" 
                  value={formData.date} 
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, date: e.target.value }))} 
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
                    value={formData.cnpj}
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
                  value={formData.companyName} 
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, companyName: e.target.value }))} 
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Nome do Contato</Label>
                <Input 
                  placeholder="A/C: Nome" 
                  value={formData.contactName} 
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, contactName: e.target.value }))} 
                  className="rounded-xl" 
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Endereço</Label>
                <Input 
                  value={formData.address} 
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, address: e.target.value }))} 
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
                  value={formData.email || ""}
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, email: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone do Cliente</Label>
                <Input
                  type="text"
                  placeholder="(00) 00000-0000"
                  value={formData.phone || ""}
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, phone: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-2"><Label>Vendedor</Label><Input value={formData.sellerName} onChange={(e) => setFormData((prev: any) => ({ ...prev, sellerName: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Cargo</Label><Input value={formData.sellerRole} onChange={(e) => setFormData((prev: any) => ({ ...prev, sellerRole: e.target.value }))} /></div>
            <div className="space-y-2"><Label>E-mail</Label><Input value={formData.sellerEmail} onChange={(e) => setFormData((prev: any) => ({ ...prev, sellerEmail: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Telefone</Label><Input value={formData.sellerPhone} onChange={(e) => setFormData((prev: any) => ({ ...prev, sellerPhone: e.target.value }))} /></div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-6">
            <div className="relative w-full">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9 w-full" placeholder="Buscar em todas as bases..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
            </div>
            <div className="border rounded-xl divide-y bg-card">
              {filteredProducts.map(p => {
                const isSelected = (formData.selectedProducts || []).some((sp: any) => sp.baseId === p.id);
                const isService = isServiceItem(p);
                return (
                  <div key={p.id} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-neutral-900 dark:text-white">{p.model}</span>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          isService 
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" 
                            : "bg-blue-100 text-blue-800 dark:bg-orange-500/20 dark:text-orange-300"
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
                            {getFieldLabel("sku", "SKU")}: {p.sku}
                          </span>
                        )}
                      </div>
                      
                      {isFieldActive("description") && p.description && (
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
                    <Button size="sm" variant={isSelected ? "destructive" : "outline"} className="h-9 w-9 p-0 rounded-full shrink-0" onClick={() => handleProductToggle(p)}>
                      {isSelected ? <Trash2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className="space-y-3 pt-6 border-t">
              <Label className="font-bold text-lg">Itens Selecionados ({(formData.selectedProducts || []).length})</Label>
              <div className="grid grid-cols-1 gap-3">
                {(formData.selectedProducts || []).map((p: any) => (
                  <div key={p.baseId} className="p-3 bg-primary/5 border border-primary/10 rounded-xl">
                    <div className="md:flex md:items-start md:justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <Input
                              value={p.name}
                              onChange={(e) => setFormData((prev: any) => ({
                                ...prev,
                                selectedProducts: prev.selectedProducts.map((sp: any) => sp.baseId === p.baseId ? { ...sp, name: e.target.value } : sp)
                              }))}
                              className="text-sm font-bold"
                            />
                          </div>
                        </div>

                        <div className="text-[11px] text-muted-foreground mt-2 break-words">
                          {p.description || <span className="italic text-xs text-muted-foreground">Sem descrição</span>}
                        </div>

                        {p.extras && p.extras.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {p.extras.map((ex: any, idx: number) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => appendToName(p.baseId, ex.value)}
                                className="text-xs px-2 py-1 rounded-md border bg-white/90 hover:bg-primary/5 transition-colors text-muted-foreground"
                                title={`Adicionar "${ex.value}" ao nome`}
                              >
                                <span className="font-semibold mr-1">{ex.label}:</span> {ex.value}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-4 md:mt-0 md:ml-4">
                        <Input
                          type="number"
                          className="w-20 h-8 text-xs bg-card text-center font-bold"
                          value={p.quantity}
                          onChange={(e) => setFormData((prev: any) => ({ ...prev, selectedProducts: prev.selectedProducts.map((sp: any) => sp.baseId === p.baseId ? { ...sp, quantity: Math.max(1, parseInt(e.target.value) || 1) } : sp) }))}
                        />
                        <Button variant="ghost" size="sm" onClick={() => setFormData((prev: any) => ({ ...prev, selectedProducts: prev.selectedProducts.filter((sp: any) => sp.baseId !== p.baseId) }))}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Global question for entire quote */}
            <div className="p-4 bg-muted/20 border border-dashed rounded-2xl space-y-2">
              <label className="text-sm font-bold text-neutral-800 dark:text-neutral-200 block">
                Os ensaios de laboratório já estão inclusos no orçamento?
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormData((prev: any) => ({ ...prev, ensaiosInclusos: true }))}
                  className={`text-xs px-4 py-2 rounded-xl font-bold border transition-all ${
                    formData.ensaiosInclusos
                      ? "bg-primary text-white border-primary"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Sim
                </button>
                <button
                  type="button"
                  onClick={() => setFormData((prev: any) => ({ ...prev, ensaiosInclusos: false }))}
                  className={`text-xs px-4 py-2 rounded-xl font-bold border transition-all ${
                    !formData.ensaiosInclusos
                      ? "bg-primary text-white border-primary"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Não
                </button>
              </div>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-6">
            {/* Items list with bonus toggle */}
            <div className="space-y-3">
              <Label className="font-bold text-base">
                Itens do Orçamento ({(formData.selectedProducts || []).length})
              </Label>
              {(formData.selectedProducts || []).length === 0 && (
                <p className="text-sm text-muted-foreground italic text-center py-4">
                  Nenhum item selecionado no passo anterior.
                </p>
              )}
              <div className="divide-y border rounded-2xl overflow-hidden bg-card">
                {(formData.selectedProducts || []).map((p: any) => {
                  const bonifiedQty = p.bonificado ? Math.min(p.bonificadoQty ?? p.quantity, p.quantity) : 0;
                  const regularQty = p.quantity - bonifiedQty;
                  
                  const currencyField = fieldsConfig.find(f => f.isActive && f.type === "currency");
                  const price = currencyField 
                    ? (currencyField.isCustom ? p.custom_fields?.[currencyField.key] : p[currencyField.key])
                    : 0;
                  const unitPrice = p.unitPrice || Number(price) || p.value_12m || p.value_24m || 0;
                  const regularTotal = unitPrice * regularQty;

                  return (
                    <div
                      key={p.baseId}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 transition-colors ${
                        p.bonificado
                          ? "bg-amber-50 dark:bg-amber-900/10"
                          : "hover:bg-muted/30"
                      }`}
                    >
                      {/* Item info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm truncate">{p.name}</span>
                          {p.bonificado && (
                            <span className="text-[10px] font-black uppercase tracking-widest bg-amber-400 text-amber-900 px-2 py-0.5 rounded-full">
                              {bonifiedQty === p.quantity ? "Bonificado" : "Parcialmente Bonificado"}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground block mt-1">
                          Qtd: <strong>{p.quantity}</strong>
                          {bonifiedQty > 0 && (
                            <span className="text-amber-600 dark:text-amber-400 ml-1.5 font-semibold">
                              ({bonifiedQty} bonif.
                              {regularQty > 0 ? ` + ${regularQty} paga` : ""})
                            </span>
                          )}
                          <span className="ml-2">
                            · Vlr. Unitário: <strong>{formatCurrencyBRL(unitPrice)}</strong>
                          </span>
                          {bonifiedQty > 0 && (
                            <span className="ml-2 text-amber-600 dark:text-amber-400 font-semibold block sm:inline mt-0.5 sm:mt-0">
                              · Subtotal no doc: {regularQty > 0 ? (
                                <span>
                                  {formatCurrencyBRL(regularTotal)} <span className="text-muted-foreground font-normal">({regularQty}x)</span> + R$ 0,00 <span className="text-muted-foreground font-normal">({bonifiedQty}x bonif.)</span>
                                </span>
                              ) : "R$ 0,00"}
                            </span>
                          )}
                        </span>
                      </div>

                      {/* Controls (quantity selector and toggle button) */}
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        {p.bonificado && p.quantity > 1 && (
                          <div className="flex items-center gap-1.5 bg-amber-100/50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl px-2.5 py-1">
                            <span className="text-[10px] text-amber-800 dark:text-amber-300 font-bold uppercase tracking-wide">Qtd Bonif:</span>
                            <select
                              value={bonifiedQty}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setFormData((prev: any) => ({
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
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            setFormData((prev: any) => ({
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
                          className={`shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border-2 transition-all duration-200 ${
                            p.bonificado
                              ? "bg-amber-400 border-amber-400 text-amber-900 hover:bg-amber-300"
                              : "bg-transparent border-muted-foreground/30 text-muted-foreground hover:border-amber-400 hover:text-amber-600"
                          }`}
                          title={p.bonificado ? "Remover bonificação" : "Marcar como bonificado (R$ 0)"}
                        >
                          <span>{p.bonificado ? "★" : "☆"}</span>
                          <span className="hidden sm:inline">
                            {p.bonificado ? "Bonificado" : "Bonificar"}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {(formData.selectedProducts || []).some((p: any) => p.bonificado) && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
                  ★ Itens bonificados aparecem com valor <strong>R$ 0,00</strong> no documento gerado.
                  O total deve ser ajustado manualmente abaixo.
                </p>
              )}
            </div>

            {/* Total price */}
            <div className="p-6 bg-primary text-white rounded-2xl space-y-1">
              <Label className="text-white/80 text-xs uppercase tracking-widest font-bold">Valor Total da Proposta</Label>
              <Input
                type="text"
                placeholder="R$ 0,00"
                className="bg-transparent border-none text-4xl font-black p-0 h-auto focus-visible:ring-0 w-full text-white placeholder:text-white/40"
                value={totalPriceInput}
                onChange={(e) => {
                  const masked = handleCurrencyInput(e.target.value);
                  setTotalPriceInput(masked);
                  const numericVal = parseCurrencyBRLToNumber(masked);
                  setFormData((prev: any) => ({ ...prev, totalPrice: numericVal }));
                }}
              />
            </div>
          </div>
        );

      case 5:
        return (
          <div className="py-10 flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in-95 duration-500">
            <div className="p-4 bg-green-100 rounded-full">
              <CheckCircle2 className="h-16 w-16 text-green-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-black text-neutral-900 dark:text-white">Proposta Gerada!</h2>
              <p className="text-muted-foreground max-w-sm">Seu orçamento foi salvo e o download está disponível.</p>
            </div>

            <div className="w-full p-4 bg-muted/30 rounded-2xl border border-dashed border-neutral-200 text-left space-y-2">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <Info className="h-4 w-4" />
                Dica: Como gerar o PDF
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Para enviar a proposta em PDF com a mesma formatação do Word, abra o arquivo <strong>DOCX</strong> baixado no Microsoft Word e vá em:<br />
                <span className="font-bold">Arquivo {'>'} Salvar como {'>'} formato PDF</span>.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 w-full">
              <Button className="h-14 rounded-2xl font-bold bg-primary hover:bg-primary/90 text-white" onClick={() => handleFinish()}>
                <FileText className="mr-2 h-5 w-5" /> Baixar DOCX Novamente
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4 w-full">
              <Button variant="ghost" className="h-14 rounded-2xl" onClick={() => setCurrentStep(4)}>
                <ArrowLeft className="mr-2 h-5 w-5" /> Voltar ao Orçamento
              </Button>
              <Button className="h-14 rounded-2xl" onClick={handleReset}>
                <RefreshCw className="mr-2 h-5 w-5" /> Novo Orçamento
              </Button>
            </div>
          </div>
        );
      default: return null;
    }
  };

  if (loadingProducts) return <div className="p-20 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <>
      <Card className="max-w-2xl mx-auto proposal-highlight rounded-3xl border-none shadow-md w-full">
        <CardHeader className="bg-primary text-white p-5 md:p-6">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-xl md:text-2xl font-black">
                {currentStep === 5 ? "Concluído" : `Passo ${currentStep}`}
              </CardTitle>
              <CardDescription className="text-white/70 text-xs md:text-sm">
                {currentStep === 5 ? "Ações disponíveis" : `Gerenciando ${(formData.selectedProducts || []).length} itens no orçamento.`}
              </CardDescription>
            </div>
            {currentStep < 5 && (
              <div className="text-xs bg-white/20 px-3 py-1 rounded-full text-white">
                {currentStep}/4
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-5 md:p-6">
          {renderStep()}

          {currentStep < 5 && (
            <div className="flex justify-between mt-5 pt-4 border-t">
              <div className="flex gap-2">
                <Button variant="ghost" className="rounded-xl" onClick={currentStep === 1 ? onCancel : () => setCurrentStep((prev) => prev - 1)}>
                  {currentStep === 1 ? "Cancelar" : "Voltar"}
                </Button>

                {currentStep >= 3 ? (
                  <Button variant="outline" className="rounded-xl" onClick={handleSaveDraft}>
                    <Save className="mr-2 h-4 w-4" /> Salvar rascunho
                  </Button>
                ) : null}
              </div>

              <div className="flex gap-2">
                {currentStep === 4 ? (
                  <Button className="rounded-xl px-6 font-bold" onClick={() => handleFinish()}>
                    <FileText className="mr-2 h-4 w-4" /> Gerar DOCX
                  </Button>
                ) : (
                  <Button className="rounded-xl px-6" onClick={handleNext}>
                    Próximo <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {showRevisionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card border rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-200 text-left">
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white">Propostas Anteriores Encontradas</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Já existem orçamentos salvos para o CNPJ <strong>{formData.cnpj}</strong> na base de dados. Como deseja prosseguir com este orçamento?
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => handleSelectRevisionMode("revision")}
                className="w-full h-12 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/95 transition-colors"
              >
                Criar como Revisão (REV{revisionData?.revision})
              </button>
              <button
                type="button"
                onClick={() => handleSelectRevisionMode("new")}
                className="w-full h-12 rounded-xl bg-transparent border-2 border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200 font-bold text-sm hover:bg-muted transition-colors"
              >
                Criar como Novo Orçamento (REV0)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}