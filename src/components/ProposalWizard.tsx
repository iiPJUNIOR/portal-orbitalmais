"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  onComplete: (data: any) => void;
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

  // Helper to format CNPJ
  const formatCnpj = (value: string) => {
    const digits = value.replace(/\D/g, "");
    let formatted = digits;
    if (digits.length > 2) formatted = `${digits.substring(0, 2)}.${digits.substring(2)}`;
    if (digits.length > 5) formatted = `${formatted.substring(0, 6)}.${formatted.substring(5)}`;
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

  const allProducts = React.useMemo(() => {
    return availableBases.flatMap((base) => {
      const headers = base.headers;
      const nameCol = base.name_column?.toLowerCase();
      const descCol = base.description_column?.toLowerCase();
      const extraCols = (base.extra_columns || []).map(c => c.toLowerCase());
      
      return base.rows.map((row, idx) => {
        const p: any = {};
        headers.forEach((h, i) => { p[h.toLowerCase()] = row[i]; });
        
        // Mapeamento dinâmico baseado nas configurações da base
        const name = nameCol && p[nameCol] ? p[nameCol] : (p.modelo || p.description || p.descrição || p.nome || p.dispositivo || p.product);
        const description = descCol && p[descCol] ? p[descCol] : (p.description || p.descrição || p.detalhes || "");
        
        const extras = (base.extra_columns || []).map(col => {
          const val = p[col.toLowerCase()];
          return val !== undefined && val !== null ? { label: col, value: String(val).trim() } : null;
        }).filter(Boolean);

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

  // Map of selected product id -> quantity (used to prioritize sorting)
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
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.extras.some((ex: any) => ex.value.toLowerCase().includes(q))
      );
    });

    // Sort so selected products come first. Among selected, order by selected quantity descending.
    arr.sort((a, b) => {
      const aq = selectedMap.get(a.id) ?? 0;
      const bq = selectedMap.get(b.id) ?? 0;

      // If one is selected and the other not, the selected one goes first
      if (aq > 0 && bq === 0) return -1;
      if (aq === 0 && bq > 0) return 1;

      // If both selected, sort by quantity descending
      if (aq > 0 && bq > 0) return bq - aq;

      // Otherwise keep original relative order (return 0)
      return 0;
    });

    return arr;
  }, [allProducts, productSearch, selectedMap]);

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
      // Add with editable name and description fields
      return { ...prev, selectedProducts: [...prev.selectedProducts, { ...product, baseId: product.id, quantity: 1, name: product.name, description: product.description }] };
    });
  };

  const handleReset = () => {
    setFormData(initialFormState);
    setCurrentStep(1);
    lastFetchedCnpj.current = "";
    toast.info("Iniciando novo orçamento.");
  };

  const handleFinish = () => {
    const proposalNumber = generateProposalNumber(formData.pipedriveUrl, formData.version);
    
    onComplete({
      ...formData,
      proposalNumber,
      items: formData.selectedProducts.map(p => ({
        product: { 
          id: p.id,
          description: p.description || p.name,
          model: p.name,
          category: p.category,
          part_number: p.sku
        },
        quantity: p.quantity,
        unitPrice: p.unitPrice || 0,
      })),
      proposalDate: formData.date,
      totalPrice: formData.totalPrice
    });
    
    if (currentStep === 5) {
      setCurrentStep(6);
    }
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
            <div className="max-h-96 overflow-y-auto border rounded-xl divide-y bg-card">
              {filteredProducts.map(p => {
                const isSelected = formData.selectedProducts.some(sp => sp.baseId === p.id);
                return (
                  <div key={p.id} className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{p.name}</span>
                        <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground uppercase font-medium">{p.baseName}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mb-1">{p.sku} | {p.description}</div>
                      
                      {/* Colunas Extras Mapeadas */}
                      {p.extras && p.extras.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {p.extras.map((ex: any) => (
                            <span key={ex.label} className="text-[9px] border px-1.5 py-0.5 rounded bg-muted/30">
                              <span className="font-bold opacity-70">{ex.label}:</span> {ex.value}
                            </span>
                          ))}
                        </div>
                      )}
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
                {formData.selectedProducts.map((p: any) => (
                  <div key={p.baseId} className="p-3 bg-primary/5 border border-primary/10 rounded-xl">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 space-y-2">
                        <div>
                          <Label className="text-sm">Nome do Item</Label>
                          <Input
                            value={p.name}
                            onChange={(e) => {
                              const v = e.target.value;
                              setFormData(prev => ({
                                ...prev,
                                selectedProducts: prev.selectedProducts.map((sp: any) =>
                                  sp.baseId === p.baseId ? { ...sp, name: v } : sp
                                )
                              }));
                            }}
                          />
                        </div>

                        <div>
                          <Label className="text-sm">Descrição (aparece na proposta)</Label>
                          <Textarea
                            value={p.description}
                            onChange={(e) => {
                              const v = e.target.value;
                              setFormData(prev => ({
                                ...prev,
                                selectedProducts: prev.selectedProducts.map((sp: any) =>
                                  sp.baseId === p.baseId ? { ...sp, description: v } : sp
                                )
                              }));
                            }}
                            rows={2}
                          />
                        </div>

                        {p.extras && p.extras.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-1">
                            {p.extras.map((ex: any) => (
                              <span key={ex.label} className="text-[10px] border px-1.5 py-0.5 rounded bg-muted/30">
                                <span className="font-medium opacity-80">{ex.label}:</span> {ex.value}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="w-40 flex flex-col items-end gap-3">
                        <Input
                          type="number"
                          className="w-24 text-center"
                          min={1}
                          value={p.quantity}
                          onChange={(e) => {
                            const q = Math.max(1, parseInt(e.target.value) || 1);
                            setFormData(prev => ({
                              ...prev,
                              selectedProducts: prev.selectedProducts.map((sp: any) =>
                                sp.baseId === p.baseId ? { ...sp, quantity: q } : sp
                              )
                            }));
                          }}
                        />

                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setFormData(prev => ({ ...prev, selectedProducts: prev.selectedProducts.filter((sp: any) => sp.baseId !== p.baseId) }))}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
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
            <div className="p-6 bg-primary text-white rounded-2xl">
              <Label>VALOR TOTAL DA PROPOSTA (totalPrice)</Label>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-2xl opacity-70">R$</span>
                <Input 
                  type="number" 
                  step="0.01"
                  className="bg-transparent border-none text-4xl font-black p-0 h-auto focus-visible:ring-0 w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-white" 
                  value={formData.totalPrice || ""} 
                  onChange={e => {
                    const val = parseFloat(e.target.value || "0");
                    setFormData(prev => ({ ...prev, totalPrice: val }));
                  }} 
                />
              </div>
              <div className="mt-2 text-sm text-white/70 font-medium">
                Visualização: {formatCurrencyBRL(formData.totalPrice)}
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-2xl bg-card shadow-sm">
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
                <div className="p-4 border border-dashed rounded-2xl bg-muted/30 space-y-3 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center gap-2 text-primary">
                    <LinkIcon className="h-4 w-4" />
                    <Label className="font-bold">Link do Gerador de Aprovação</Label>
                  </div>
                  <Input 
                    placeholder="Cole aqui o link gerado no Gerador de Aprovação" 
                    value={formData.approvalLink}
                    onChange={e => setFormData(prev => ({ ...prev, approvalLink: e.target.value }))}
                    className="bg-card"
                  />
                  <p className="text-[10px] text-muted-foreground">O link inserido será incorporado no botão de aprovação da proposta.</p>
                </div>
              )}
            </div>

            <p className="text-sm text-muted-foreground text-center">Clique no botão abaixo para gerar e baixar sua proposta.</p>
          </div>
        );
      case 6:
        return (
          <div className="py-10 flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in-95 duration-500">
            <div className="p-4 bg-green-100 rounded-full">
              <CheckCircle2 className="h-16 w-16 text-green-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-black text-neutral-900 dark:text-white">Proposta Gerada!</h2>
              <p className="text-muted-foreground max-w-sm">Seu orçamento foi salvo e o download iniciado.</p>
            </div>
            
            <div className="w-full p-4 bg-muted/30 rounded-2xl border border-dashed border-neutral-200 text-left space-y-2">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <Info className="h-4 w-4" />
                Dica: Como gerar o PDF
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Para enviar a proposta em PDF, abra o arquivo baixado no **PowerPoint** e vá em:<br />
                <span className="font-bold">Arquivo {'>'} Exportar {'>'} Criar PDF/XPS</span> ou <span className="font-bold">Salvar como PDF</span>.
              </p>
            </div>
            
            <div className="grid grid-cols-1 gap-4 w-full">
              <Button variant="outline" className="h-14 rounded-2xl border-primary text-primary hover:bg-primary/5" onClick={() => handleFinish()}>
                <Presentation className="mr-2 h-5 w-5" /> Baixar PPTX Novamente
              </Button>
            </div>
            
            <div className="grid grid-cols-2 gap-4 w-full">
              <Button variant="ghost" className="h-14 rounded-2xl" onClick={() => setCurrentStep(5)}>
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

  if (loadingBases) return <div className="p-20 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <Card className="max-w-2xl mx-auto proposal-highlight rounded-3xl overflow-hidden border-none">
      <CardHeader className="bg-primary text-white p-8">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-2xl font-black">
              {currentStep === 6 ? "Concluído" : `Passo ${currentStep}`}
            </CardTitle>
            <CardDescription className="text-white/70">
              {currentStep === 6 ? "Ações disponíveis" : `Gerenciando ${formData.selectedProducts.length} itens no orçamento.`}
            </CardDescription>
          </div>
          {currentStep < 6 && (
            <div className="text-xs bg-white/20 px-3 py-1 rounded-full text-white">
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
                <Button className="rounded-full px-8" onClick={() => handleFinish()}>
                  <Presentation className="mr-2 h-4 w-4" /> Gerar PPTX
                </Button>
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