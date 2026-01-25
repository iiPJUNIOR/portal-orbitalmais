"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowRight, Loader2, Search, Plus, Trash2, Info, FileDown, Presentation, CheckCircle2, RefreshCw, Link as LinkIcon, ArrowLeft } from "lucide-react";
import { fetchBases, type StoredBase } from "@/services/productBaseService";
import { generateProposalNumber } from "@/services/proposalService";
import { Switch } from "@/components/ui/switch";
import { formatCurrencyBRL, parseSpreadsheetNumber } from "@/lib/formatters";

interface WizardProps {
  initialSellerData: {
    name: string;
    role: string;
    email: string;
    phone: string;
  };
  onComplete: (data: any, format: 'pptx' | 'pdf') => void;
  onCancel: () => void;
}

export function ProposalWizard({ initialSellerData, onComplete, onCancel }: WizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [loadingBases, setLoadingBases] = useState(true);
  const [availableBases, setAvailableBases] = useState<StoredBase[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const lastFetchedCnpj = useRef<string>("");
  
  const initialFormState = {
    pipedriveUrl: "",
    dealId: "",
    version: "1",
    date: new Date().toISOString().split('T')[0],
    companyName: "",
    contactName: "",
    cnpj: "",
    address: "",
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
    approvalLink: ""
  };

  const [formData, setFormData] = useState(initialFormState);
  const [displayTotal, setDisplayTotal] = useState("0,00");

  // Helper to format CNPJ
  const formatCnpj = (value: string) => {
    const digits = value.replace(/\D/g, "");
    let formatted = digits;
    if (digits.length > 2) formatted = `${digits.substring(0, 2)}.${digits.substring(2)}`;
    if (digits.length > 5) formatted = `${formatted.substring(0, 6)}.${digits.substring(5)}`;
    if (digits.length > 8) formatted = `${formatted.substring(0, 10)}/${digits.substring(8)}`;
    if (digits.length > 12) formatted = `${formatted.substring(0, 15)}-${digits.substring(12, 14)}`;
    return formatted.substring(0, 18);
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const bases = await fetchBases();
        setAvailableBases(bases);
      } finally {
        setLoadingBases(false);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    let q = 0; let q1 = 0; let q2 = 0;
    formData.selectedProducts.forEach(it => {
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
    setFormData(prev => ({ ...prev, qtd: String(q), qtd1: String(q1), qtd2: String(q2), devices: q + q1 + q2 }));
  }, [formData.selectedProducts]);

  // Sincroniza o valor total formatado para exibição
  useEffect(() => {
    setDisplayTotal(new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(formData.totalPrice));
  }, [formData.totalPrice]);

  const allProducts = React.useMemo(() => {
    return availableBases.flatMap((base) => {
      const headers = base.headers;
      const nameCol = base.name_column?.toLowerCase();
      const descCol = base.description_column?.toLowerCase();
      const extraCols = (base.extra_columns || []).map(c => c.toLowerCase());
      return base.rows.map((row, idx) => {
        const p: any = {};
        headers.forEach((h, i) => { p[h.toLowerCase()] = row[i]; });
        const name = nameCol ? p[nameCol] : (p.modelo || p.description || p.descrição || p.nome || p.dispositivo || p.product);
        const description = descCol ? p[descCol] : (p.description || p.descrição || p.detalhes || "");
        const extras = extraCols.map(col => ({ label: col, value: String(p[col] || "").trim() })).filter(ex => ex.value !== "");
        return {
          id: `${base.id}-${idx}`,
          name: String(name || "Produto sem nome").trim(),
          description: String(description).trim(),
          extras: extras,
          sku: p.sku || p["part number"] || p.pn || "",
          category: p.categoria || p.category || "",
          baseName: base.name
        };
      });
    });
  }, [availableBases]);

  const filteredProducts = allProducts.filter(p => 
    p.name.toLowerCase().includes(productSearch.toLowerCase()) || 
    p.sku.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.extras.some(ex => ex.value.toLowerCase().includes(productSearch.toLowerCase()))
  );

  const fetchCnpjData = async (rawCnpj: string) => {
    if (rawCnpj.length !== 14 || lastFetchedCnpj.current === rawCnpj) return;
    lastFetchedCnpj.current = rawCnpj;
    const toastId = toast.loading("Buscando CNPJ...");
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${rawCnpj}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFormData(prev => ({
        ...prev,
        companyName: data.razao_social || data.nome_fantasia || prev.companyName,
        address: [data.logradouro, data.numero, data.bairro, data.municipio].filter(Boolean).join(", ")
      }));
      toast.success("Dados preenchidos!", { id: toastId });
    } catch {
      toast.error("Erro ao carregar CNPJ.", { id: toastId });
    }
  };

  useEffect(() => {
    const digits = formData.cnpj.replace(/\D/g, "");
    if (digits.length === 14) fetchCnpjData(digits);
  }, [formData.cnpj]);

  const handleProductToggle = (product: any) => {
    setFormData(prev => {
      const exists = prev.selectedProducts.find(p => p.baseId === product.id);
      if (exists) {
        return { ...prev, selectedProducts: prev.selectedProducts.filter(p => p.baseId !== product.id) };
      }
      return { ...prev, selectedProducts: [...prev.selectedProducts, { ...product, baseId: product.id, quantity: 1 }] };
    });
  };

  const handleReset = () => {
    setFormData(initialFormState);
    setCurrentStep(1);
    lastFetchedCnpj.current = "";
    toast.info("Iniciando novo orçamento.");
  };

  const handleFinish = (format: 'pptx' | 'pdf') => {
    const proposalNumber = generateProposalNumber(formData.pipedriveUrl, formData.version);
    
    onComplete({
      ...formData,
      proposalNumber,
      items: formData.selectedProducts.map(p => ({
        product: { 
          id: p.id,
          description: p.name, 
          model: p.name, 
          category: p.category,
          part_number: p.sku
        },
        quantity: p.quantity,
        unitPrice: 0,
      })),
      proposalDate: formData.date,
      totalPrice: formData.totalPrice
    }, format);
    
    if (currentStep === 5) {
      setCurrentStep(6);
    }
  };

  const handleTotalChange = (val: string) => {
    setDisplayTotal(val);
    const numeric = parseSpreadsheetNumber(val);
    setFormData(prev => ({ ...prev, totalPrice: numeric }));
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>URL Pipedrive</Label>
              <Input 
                placeholder="https://controlid.pipedrive.com/deal/214049" 
                value={formData.pipedriveUrl} 
                onChange={e => setFormData(prev => ({ ...prev, pipedriveUrl: e.target.value }))} 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Versão</Label><Input value={formData.version} onChange={e => setFormData(prev => ({ ...prev, version: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Data</Label><Input type="date" value={formData.date} onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))} /></div>
            </div>
            <div className="space-y-2">
              <Label>CNPJ</Label>
              <Input 
                placeholder="00.000.000/0000-00" 
                value={formData.cnpj} 
                onChange={e => setFormData(prev => ({ ...prev, cnpj: formatCnpj(e.target.value) }))} 
              />
            </div>
            <div className="space-y-2"><Label>Razão Social (companyName)</Label><Input placeholder="Nome da Empresa" value={formData.companyName} onChange={e => setFormData(prev => ({ ...prev, companyName: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Nome do Contato (contactName)</Label><Input placeholder="A/C: Nome" value={formData.contactName} onChange={e => setFormData(prev => ({ ...prev, contactName: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Endereço</Label><Input value={formData.address} onChange={e => setFormData(prev => ({ ...prev, address: e.target.value }))} /></div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-2"><Label>Vendedor (sellerName)</Label><Input value={formData.sellerName} onChange={e => setFormData(prev => ({ ...prev, sellerName: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Cargo (sellerRole)</Label><Input value={formData.sellerRole} onChange={e => setFormData(prev => ({ ...prev, sellerRole: e.target.value }))} /></div>
            <div className="space-y-2"><Label>E-mail (sellerEmail)</Label><Input value={formData.sellerEmail} onChange={e => setFormData(prev => ({ ...prev, sellerEmail: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Telefone (sellerPhone)</Label><Input value={formData.sellerPhone} onChange={e => setFormData(prev => ({ ...prev, sellerPhone: e.target.value }))} /></div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <Label>Usuários do Sistema (users)</Label>
            <Input type="number" value={formData.users} onChange={e => setFormData(prev => ({ ...prev, users: e.target.value }))} />
          </div>
        );
      case 4:
        return (
          <div className="space-y-6">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar em todas as bases..." value={productSearch} onChange={e => setProductSearch(e.target.value)} />
            </div>
            <div className="max-h-96 overflow-y-auto border rounded-xl divide-y bg-white">
              {filteredProducts.map(p => {
                const isSelected = formData.selectedProducts.some(sp => sp.baseId === p.id);
                return (
                  <div key={p.id} className="flex items-center justify-between p-3 hover:bg-gray-50 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{p.name}</span>
                        <span className="text-[9px] bg-neutral-100 px-1.5 py-0.5 rounded text-neutral-500 uppercase font-medium">{p.baseName}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">{p.sku} | {p.description}</div>
                    </div>
                    <Button size="sm" variant={isSelected ? "destructive" : "outline"} className="h-8 w-8 p-0 rounded-full" onClick={() => handleProductToggle(p)}>
                      {isSelected ? <Trash2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className="space-y-3 pt-6 border-t">
              <Label className="font-bold text-lg">Itens Selecionados ({formData.selectedProducts.length})</Label>
              <div className="grid grid-cols-1 gap-3">
                {formData.selectedProducts.map(p => (
                  <div key={p.baseId} className="flex items-center justify-between p-3 bg-primary/5 border border-primary/10 rounded-xl">
                    <div className="flex-1"><span className="font-bold text-sm">{p.name}</span></div>
                    <div className="flex items-center gap-3 ml-4">
                      <Input type="number" className="w-16 h-8 text-xs bg-white text-center font-bold" value={p.quantity} onChange={e => setFormData(prev => ({ ...prev, selectedProducts: prev.selectedProducts.map(sp => sp.baseId === p.baseId ? { ...sp, quantity: Math.max(1, parseInt(e.target.value) || 1) } : sp) }))} />
                      <Button variant="ghost" size="sm" onClick={() => setFormData(prev => ({ ...prev, selectedProducts: prev.selectedProducts.filter(sp => sp.baseId !== p.baseId) }))}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-6">
            <div className="p-6 bg-neutral-900 text-white rounded-2xl">
              <Label>VALOR TOTAL DA PROPOSTA (totalPrice)</Label>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-2xl text-gray-500">R$</span>
                <Input 
                  type="text" 
                  className="bg-transparent border-none text-4xl font-black p-0 h-auto focus-visible:ring-0" 
                  value={displayTotal} 
                  onChange={e => handleTotalChange(e.target.value)} 
                />
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-2xl bg-white shadow-sm">
                <div className="space-y-0.5">
                  <Label className="text-base font-bold">Página de Aprovação</Label>
                  <p className="text-xs text-muted-foreground">Incluir a página "Clique aqui para aprovar" ao final da proposta.</p>
                </div>
                <Switch 
                  checked={formData.includeApprovalPage} 
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, includeApprovalPage: checked }))} 
                />
              </div>

              {formData.includeApprovalPage && (
                <div className="p-4 border border-dashed rounded-2xl bg-neutral-50 space-y-3 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center gap-2 text-primary">
                    <LinkIcon className="h-4 w-4" />
                    <Label className="font-bold">Link do Gerador de Aprovação</Label>
                  </div>
                  <Input 
                    placeholder="Cole aqui o link gerado no Gerador de Aprovação" 
                    value={formData.approvalLink}
                    onChange={e => setFormData(prev => ({ ...prev, approvalLink: e.target.value }))}
                    className="bg-white"
                  />
                  <p className="text-[10px] text-muted-foreground">O link inserido será incorporado no botão de aprovação da proposta.</p>
                </div>
              )}
            </div>

            <p className="text-sm text-muted-foreground text-center">Clique em um dos formatos abaixo para gerar e baixar sua proposta.</p>
          </div>
        );
      case 6:
        return (
          <div className="py-10 flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in-95 duration-500">
            <div className="p-4 bg-green-100 rounded-full">
              <CheckCircle2 className="h-16 w-16 text-green-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-black text-neutral-900">Proposta Gerada!</h2>
              <p className="text-muted-foreground max-w-sm">Seu orçamento foi salvo e o download iniciado. Você pode baixar em outro formato ou retornar para ajustes.</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4 w-full">
              <Button variant="outline" className="h-14 rounded-2xl" onClick={() => handleFinish('pdf')}>
                <FileDown className="mr-2 h-5 w-5" /> Baixar PDF
              </Button>
              <Button variant="outline" className="h-14 rounded-2xl" onClick={() => handleFinish('pptx')}>
                <Presentation className="mr-2 h-5 w-5" /> Baixar PPTX
              </Button>
            </div>
            
            <div className="grid grid-cols-2 gap-4 w-full">
              <Button variant="ghost" className="h-14 rounded-2xl" onClick={() => setCurrentStep(5)}>
                <ArrowLeft className="mr-2 h-5 w-5" /> Voltar ao Orçamento
              </Button>
              <Button className="h-14 rounded-2xl bg-neutral-900 hover:bg-neutral-800" onClick={handleReset}>
                <RefreshCw className="mr-2 h-5 w-5" /> Novo Orçamento
              </Button>
            </div>
          </div>
        );
      default: return null;
    }
  };

  if (loadingBases) return <div className="p-20 flex justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <Card className="max-w-2xl mx-auto shadow-2xl rounded-3xl overflow-hidden border-none">
      <CardHeader className="bg-neutral-900 text-white p-8">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-2xl font-black">
              {currentStep === 6 ? "Concluído" : `Passo ${currentStep}`}
            </CardTitle>
            <CardDescription className="text-gray-400">
              {currentStep === 6 ? "Ações disponíveis" : `Gerenciando ${formData.selectedProducts.length} itens no orçamento.`}
            </CardDescription>
          </div>
          {currentStep < 6 && (
            <div className="text-xs bg-white/10 px-3 py-1 rounded-full text-white/70">
              {currentStep}/5
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-8">
        {renderStep()}
        
        {currentStep < 6 && (
          <div className="flex justify-between mt-10">
            <Button variant="ghost" onClick={currentStep === 1 ? onCancel : () => setCurrentStep(prev => prev - 1)}>
              {currentStep === 1 ? "Cancelar" : "Voltar"}
            </Button>
            <div className="flex gap-2">
              {currentStep === 5 ? (
                <>
                  <Button variant="outline" className="rounded-full px-6" onClick={() => handleFinish('pdf')}>
                    <FileDown className="mr-2 h-4 w-4" /> Gerar PDF
                  </Button>
                  <Button className="rounded-full px-6" onClick={() => handleFinish('pptx')}>
                    <Presentation className="mr-2 h-4 w-4" /> Gerar PPTX
                  </Button>
                </>
              ) : (
                <Button className="rounded-full px-8" onClick={() => setCurrentStep(prev => prev + 1)}>
                  Próximo <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}