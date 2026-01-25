"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Check, ArrowRight, ArrowLeft, Package, User, Building, Layout, DollarSign, Loader2, Search, Plus, Trash2 } from "lucide-react";
import { fetchBases, type StoredBase } from "@/services/productBaseService";
import { parseSpreadsheetNumber } from "@/lib/formatters";

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

const DOOR_CONTROLLERS = [
  "iDFace Pro", "iDFace Max", "iDFlex IP65", "iDFlex Pro", "iDAccess Nano", "iDAccess", "iDAccess Pro"
];

export function ProposalWizard({ initialSellerData, onComplete, onCancel }: WizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [fetchingCnpj, setFetchingCnpj] = useState(false);
  const [loadingBases, setLoadingBases] = useState(true);
  const [availableBases, setAvailableBases] = useState<StoredBase[]>([]);
  const [selectedBaseId, setSelectedBaseId] = useState<string>("");
  const [productSearch, setProductSearch] = useState("");
  const lastFetchedCnpj = useRef<string>("");
  
  const [formData, setFormData] = useState({
    pipedriveUrl: "",
    dealId: "",
    version: "1",
    date: new Date().toLocaleDateString('pt-BR'),
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
    qtd: "",
    qtd1: "",
    qtd2: "",
    selectedProducts: [] as any[],
    totalPrice: 0
  });

  // Carregar bases do Supabase
  useEffect(() => {
    const loadData = async () => {
      try {
        const bases = await fetchBases();
        setAvailableBases(bases);
        if (bases.length > 0) setSelectedBaseId(bases[0].id || "");
      } catch (err) {
        toast.error("Erro ao carregar bases de produtos.");
      } finally {
        setLoadingBases(false);
      }
    };
    loadData();
  }, []);

  const currentBase = availableBases.find(b => b.id === selectedBaseId);
  const productsFromBase = React.useMemo(() => {
    if (!currentBase) return [];
    const headers = currentBase.headers;
    return currentBase.rows.map((row, idx) => {
      const p: any = {};
      headers.forEach((h, i) => { p[h.toLowerCase()] = row[i]; });
      return {
        id: `${currentBase.id}-${idx}`,
        name: p.modelo || p.description || p.descrição || p.nome || "Produto sem nome",
        sku: p.sku || p["part number"] || p.pn || "",
        category: p.categoria || p.category || "",
        price12: parseSpreadsheetNumber(p.valor12 || p.price12 || p.value_12m || 0),
        price24: parseSpreadsheetNumber(p.valor24 || p.price24 || p.value_24m || 0)
      };
    });
  }, [currentBase]);

  const filteredProducts = productsFromBase.filter(p => 
    p.name.toLowerCase().includes(productSearch.toLowerCase()) || 
    p.sku.toLowerCase().includes(productSearch.toLowerCase())
  );

  const fetchCnpjData = async (rawCnpj: string) => {
    if (rawCnpj.length !== 14 || lastFetchedCnpj.current === rawCnpj) return;
    setFetchingCnpj(true);
    lastFetchedCnpj.current = rawCnpj;
    const toastId = toast.loading("Buscando dados do CNPJ...");
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
    } catch (err) {
      toast.error("Erro ao carregar CNPJ.", { id: toastId });
    } finally {
      setFetchingCnpj(false);
    }
  };

  useEffect(() => {
    const digits = formData.cnpj.replace(/\D/g, "");
    if (digits.length === 14) fetchCnpjData(digits);
  }, [formData.cnpj]);

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, "").substring(0, 14);
    setFormData(prev => ({ ...prev, cnpj: val }));
  };

  const handleProductToggle = (product: any) => {
    setFormData(prev => {
      const exists = prev.selectedProducts.find(p => p.baseId === product.id);
      if (exists) {
        return { ...prev, selectedProducts: prev.selectedProducts.filter(p => p.baseId !== product.id) };
      } else {
        return { 
          ...prev, 
          selectedProducts: [...prev.selectedProducts, { 
            ...product,
            baseId: product.id,
            quantity: 1,
            entryTech: 'facial',
            exitTech: 'botoeira',
            doorType: 'madeira'
          }] 
        };
      }
    });
  };

  const updateProductQty = (baseId: string, qty: number) => {
    setFormData(prev => ({
      ...prev,
      selectedProducts: prev.selectedProducts.map(p => p.baseId === baseId ? { ...p, quantity: Math.max(1, qty) } : p)
    }));
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>URL do Pipedrive</Label>
              <Input placeholder="https://controlid.pipedrive.com/deal/..." value={formData.pipedriveUrl} onChange={e => setFormData(prev => ({ ...prev, pipedriveUrl: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Versão</Label><Input value={formData.version} onChange={e => setFormData(prev => ({ ...prev, version: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Data</Label><Input value={formData.date} onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label>CNPJ</Label><Input placeholder="00.000.000/0000-00" value={formData.cnpj} onChange={handleCnpjChange} /></div>
            <div className="space-y-2"><Label>Empresa</Label><Input value={formData.companyName} onChange={e => setFormData(prev => ({ ...prev, companyName: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Contato (A/C)</Label><Input value={formData.contactName} onChange={e => setFormData(prev => ({ ...prev, contactName: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Endereço</Label><Input value={formData.address} onChange={e => setFormData(prev => ({ ...prev, address: e.target.value }))} /></div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-2"><Label>Vendedor</Label><Input value={formData.sellerName} onChange={e => setFormData(prev => ({ ...prev, sellerName: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Cargo</Label><Input value={formData.sellerRole} onChange={e => setFormData(prev => ({ ...prev, sellerRole: e.target.value }))} /></div>
            <div className="space-y-2"><Label>E-mail</Label><Input value={formData.sellerEmail} onChange={e => setFormData(prev => ({ ...prev, sellerEmail: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Telefone</Label><Input value={formData.sellerPhone} onChange={e => setFormData(prev => ({ ...prev, sellerPhone: e.target.value }))} /></div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nº de Usuários</Label><Input type="number" value={formData.users} onChange={e => setFormData(prev => ({ ...prev, users: e.target.value }))} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1"><Label className="text-xs">qtd</Label><Input value={formData.qtd} onChange={e => setFormData(prev => ({ ...prev, qtd: e.target.value }))} /></div>
              <div className="space-y-1"><Label className="text-xs">qtd1</Label><Input value={formData.qtd1} onChange={e => setFormData(prev => ({ ...prev, qtd1: e.target.value }))} /></div>
              <div className="space-y-1"><Label className="text-xs">qtd2</Label><Input value={formData.qtd2} onChange={e => setFormData(prev => ({ ...prev, qtd2: e.target.value }))} /></div>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Selecione a Base de Produtos</Label>
              <select className="w-full border rounded p-2" value={selectedBaseId} onChange={e => setSelectedBaseId(e.target.value)}>
                {availableBases.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar produto na base..." value={productSearch} onChange={e => setProductSearch(e.target.value)} />
            </div>

            <div className="max-h-80 overflow-y-auto border rounded-xl divide-y">
              {filteredProducts.map(p => {
                const isSelected = formData.selectedProducts.some(sp => sp.baseId === p.id);
                return (
                  <div key={p.id} className="flex items-center justify-between p-3 hover:bg-gray-50 transition-colors">
                    <div className="flex-1">
                      <div className="font-bold text-sm">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground uppercase">{p.sku} | {p.category}</div>
                    </div>
                    <Button 
                      size="sm" 
                      variant={isSelected ? "destructive" : "outline"} 
                      className="h-8 w-8 p-0 rounded-full"
                      onClick={() => handleProductToggle(p)}
                    >
                      {isSelected ? <Trash2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  </div>
                );
              })}
              {filteredProducts.length === 0 && <div className="p-8 text-center text-muted-foreground">Nenhum produto encontrado.</div>}
            </div>

            {formData.selectedProducts.length > 0 && (
              <div className="space-y-3 pt-4 border-t">
                <Label className="text-primary font-bold">Itens no Orçamento ({formData.selectedProducts.length})</Label>
                {formData.selectedProducts.map(p => (
                  <Card key={p.baseId} className="p-3 bg-primary/5 border-primary/20">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="text-xs font-bold truncate max-w-[200px]">{p.name}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-[10px]">Qtd:</Label>
                        <Input 
                          type="number" 
                          className="w-16 h-8 text-xs" 
                          value={p.quantity} 
                          onChange={e => updateProductQty(p.baseId, parseInt(e.target.value) || 1)} 
                        />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        );
      case 5:
        return (
          <div className="space-y-4">
            <div className="p-6 bg-neutral-900 text-white rounded-2xl shadow-inner">
              <Label className="text-gray-400">VALOR TOTAL DA PROPOSTA</Label>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-2xl font-light text-gray-500">R$</span>
                <Input 
                  type="number" 
                  step="0.01" 
                  className="bg-transparent border-none text-4xl font-black focus-visible:ring-0 p-0 h-auto"
                  value={formData.totalPrice || ""} 
                  onChange={e => setFormData(prev => ({ ...prev, totalPrice: parseFloat(e.target.value) || 0 }))} 
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <Card className="p-3"><Label className="text-muted-foreground">Itens</Label><div className="text-lg font-bold">{formData.selectedProducts.length}</div></Card>
              <Card className="p-3"><Label className="text-muted-foreground">Cliente</Label><div className="text-lg font-bold truncate">{formData.companyName || "-"}</div></Card>
            </div>
          </div>
        );
      default: return null;
    }
  };

  const handleFinish = () => {
    const payload = {
      ...formData,
      proposalNumber: `${formData.dealId} V${formData.version}`,
      items: formData.selectedProducts.map(p => ({
        product: { description: p.name, model: p.name, category: p.category },
        quantity: p.quantity,
        unitPrice: 0,
        installationData: { entryTech: p.entryTech, exitTech: p.exitTech, doorType: p.doorType }
      })),
      overrideTotal: formData.totalPrice
    };
    onComplete(payload);
  };

  if (loadingBases) return <div className="flex items-center justify-center p-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <Card className="max-w-2xl mx-auto shadow-2xl border-none rounded-3xl overflow-hidden">
      <CardHeader className="bg-neutral-900 text-white p-8">
        <div className="flex items-center justify-between mb-6 opacity-40">
          {[1,2,3,4,5].map(i => <div key={i} className={`h-1.5 flex-1 mx-0.5 rounded-full ${currentStep >= i ? 'bg-primary' : 'bg-white/20'}`} />)}
        </div>
        <CardTitle className="text-2xl font-black">Passo {currentStep}</CardTitle>
        <CardDescription className="text-gray-400">Configure os detalhes da sua proposta comercial.</CardDescription>
      </CardHeader>
      <CardContent className="p-8">
        {renderStep()}
        <div className="flex justify-between mt-10">
          <Button variant="ghost" onClick={currentStep === 1 ? onCancel : () => setCurrentStep(prev => prev - 1)}>
            {currentStep === 1 ? "Cancelar" : "Voltar"}
          </Button>
          <Button className="rounded-full px-8" onClick={currentStep === 5 ? handleFinish : () => setCurrentStep(prev => prev + 1)}>
            {currentStep === 5 ? "Gerar PPTX" : "Próximo"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}