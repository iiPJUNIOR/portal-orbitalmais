"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowRight, Loader2, Search, Plus, Trash2 } from "lucide-react";
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

export function ProposalWizard({ initialSellerData, onComplete, onCancel }: WizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
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

  useEffect(() => {
    const loadData = async () => {
      try {
        const bases = await fetchBases();
        setAvailableBases(bases);
        if (bases.length > 0) setSelectedBaseId(bases[0].id || "");
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
    const nameCol = currentBase.name_column?.toLowerCase();
    const descCol = currentBase.description_column?.toLowerCase();

    return currentBase.rows.map((row, idx) => {
      const p: any = {};
      headers.forEach((h, i) => { p[h.toLowerCase()] = row[i]; });
      
      const name = nameCol ? p[nameCol] : (p.modelo || p.description || p.descrição || p.nome || p.dispositivo || p.product);
      const description = descCol ? p[descCol] : (p.description || p.descrição || p.detalhes || "");
      
      return {
        id: `${currentBase.id}-${idx}`,
        name: String(name || "Produto sem nome").trim(),
        description: String(description).trim(),
        sku: p.sku || p["part number"] || p.pn || "",
        category: p.categoria || p.category || "",
      };
    });
  }, [currentBase]);

  const filteredProducts = productsFromBase.filter(p => 
    p.name.toLowerCase().includes(productSearch.toLowerCase()) || 
    p.sku.toLowerCase().includes(productSearch.toLowerCase())
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
      return { 
        ...prev, 
        selectedProducts: [...prev.selectedProducts, { ...product, baseId: product.id, quantity: 1 }] 
      };
    });
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="space-y-2"><Label>URL Pipedrive</Label><Input value={formData.pipedriveUrl} onChange={e => setFormData(prev => ({ ...prev, pipedriveUrl: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Versão</Label><Input value={formData.version} onChange={e => setFormData(prev => ({ ...prev, version: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Data</Label><Input value={formData.date} onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label>CNPJ</Label><Input value={formData.cnpj} onChange={e => setFormData(prev => ({ ...prev, cnpj: e.target.value.replace(/\D/g, "").substring(0, 14) }))} /></div>
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
            <Label>Usuários do Sistema</Label>
            <Input type="number" value={formData.users} onChange={e => setFormData(prev => ({ ...prev, users: e.target.value }))} />
          </div>
        );
      case 4:
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Base de Produtos</Label>
              <select className="w-full border rounded p-2" value={selectedBaseId} onChange={e => setSelectedBaseId(e.target.value)}>
                {availableBases.map(b => <option key={b.id} value={b.id!}>{b.name}</option>)}
              </select>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar..." value={productSearch} onChange={e => setProductSearch(e.target.value)} />
            </div>
            <div className="max-h-80 overflow-y-auto border rounded-xl divide-y">
              {filteredProducts.map(p => {
                const isSelected = formData.selectedProducts.some(sp => sp.baseId === p.id);
                return (
                  <div key={p.id} className="flex items-center justify-between p-3 hover:bg-gray-50 transition-colors">
                    <div className="flex-1">
                      <div className="font-bold text-sm">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground">{p.sku} | {p.description}</div>
                    </div>
                    <Button size="sm" variant={isSelected ? "destructive" : "outline"} className="h-8 w-8 p-0 rounded-full" onClick={() => handleProductToggle(p)}>
                      {isSelected ? <Trash2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className="space-y-3 pt-4 border-t">
              <Label className="font-bold">Itens Selecionados ({formData.selectedProducts.length})</Label>
              {formData.selectedProducts.map(p => (
                <Card key={p.baseId} className="p-3 bg-primary/5 flex items-center justify-between">
                  <div className="text-xs font-bold truncate flex-1">{p.name}</div>
                  <div className="flex items-center gap-2">
                    <Input type="number" className="w-14 h-7 text-xs" value={p.quantity} onChange={e => setFormData(prev => ({ ...prev, selectedProducts: prev.selectedProducts.map(sp => sp.baseId === p.baseId ? { ...sp, quantity: Math.max(1, parseInt(e.target.value) || 1) } : sp) }))} />
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setFormData(prev => ({ ...prev, selectedProducts: prev.selectedProducts.filter(sp => sp.baseId !== p.baseId) }))}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-6">
            <div className="p-6 bg-neutral-900 text-white rounded-2xl">
              <Label>VALOR TOTAL</Label>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-2xl text-gray-500">R$</span>
                <Input type="number" step="0.01" className="bg-transparent border-none text-4xl font-black p-0 h-auto" value={formData.totalPrice || ""} onChange={e => setFormData(prev => ({ ...prev, totalPrice: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1"><Label className="text-[10px]">qtd</Label><Input value={formData.qtd} onChange={e => setFormData(prev => ({ ...prev, qtd: e.target.value }))} /></div>
              <div className="space-y-1"><Label className="text-[10px]">qtd1</Label><Input value={formData.qtd1} onChange={e => setFormData(prev => ({ ...prev, qtd1: e.target.value }))} /></div>
              <div className="space-y-1"><Label className="text-[10px]">qtd2</Label><Input value={formData.qtd2} onChange={e => setFormData(prev => ({ ...prev, qtd2: e.target.value }))} /></div>
            </div>
          </div>
        );
      default: return null;
    }
  };

  const handleFinish = () => {
    onComplete({
      ...formData,
      proposalNumber: `P${Math.floor(Math.random() * 10000)} V${formData.version}`,
      items: formData.selectedProducts.map(p => ({
        product: { description: p.name, model: p.name, category: p.category },
        quantity: p.quantity,
        unitPrice: 0,
      })),
      overrideTotal: formData.totalPrice
    });
  };

  if (loadingBases) return <div className="p-20 flex justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <Card className="max-w-2xl mx-auto shadow-2xl rounded-3xl overflow-hidden">
      <CardHeader className="bg-neutral-900 text-white p-8">
        <CardTitle className="text-2xl font-black">Passo {currentStep}</CardTitle>
      </CardHeader>
      <CardContent className="p-8">
        {renderStep()}
        <div className="flex justify-between mt-10">
          <Button variant="ghost" onClick={currentStep === 1 ? onCancel : () => setCurrentStep(prev => prev - 1)}>{currentStep === 1 ? "Cancelar" : "Voltar"}</Button>
          <Button className="rounded-full px-8" onClick={currentStep === 5 ? handleFinish : () => setCurrentStep(prev => prev + 1)}>
            {currentStep === 5 ? "Gerar PPTX" : "Próximo"} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}