"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowRight, Loader2, Search, Plus, Trash2, Info, Presentation, CheckCircle2, RefreshCw, Link as LinkIcon, FileText } from "lucide-react";
import { fetchBases, type StoredBase } from "@/services/productBaseService";
import { generateProposalNumber } from "@/services/proposalService";
import { Switch } from "@/components/ui/switch";
import { formatCurrencyBRL } from "@/lib/formatters";

interface WizardProps {
  initialSellerData: {
    name: string;
    role: string;
    email: string;
    phone: string;
  };
  onComplete: (data: any, type: 'pptx' | 'pdf') => void;
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
      const qty = Number(it.quantity) || 0;
      if (model.includes("idblock") || model.includes("torniquete") || cat.includes("catraca")) q1 += qty;
      else if (cat.includes("serviço") || cat.includes("suporte")) q2 += qty;
      else q += qty;
    });
    setFormData(prev => ({ ...prev, qtd: String(q), qtd1: String(q1), qtd2: String(q2), devices: q + q1 + q2 }));
  }, [formData.selectedProducts]);

  const allProducts = React.useMemo(() => {
    return availableBases.flatMap((base) => {
      const headers = base.headers;
      const nameCol = base.name_column?.toLowerCase();
      return base.rows.map((row, idx) => {
        const p: any = {};
        headers.forEach((h, i) => { p[h.toLowerCase()] = row[i]; });
        const name = nameCol ? p[nameCol] : (p.modelo || p.description || p.product);
        return {
          id: `${base.id}-${idx}`,
          name: String(name || "Produto").trim(),
          description: String(p.description || "").trim(),
          sku: p.sku || p.pn || "",
          category: p.categoria || p.category || "",
          baseName: base.name
        };
      });
    });
  }, [availableBases]);

  const filteredProducts = allProducts.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()));

  const handleFinish = (type: 'pptx' | 'pdf') => {
    const proposalNumber = generateProposalNumber(formData.pipedriveUrl, formData.version);
    const payload = {
      ...formData,
      proposalNumber,
      items: formData.selectedProducts.map(p => ({
        product: { id: p.id, description: p.name, model: p.name, category: p.category, part_number: p.sku },
        quantity: p.quantity,
        unitPrice: 0,
      })),
      proposalDate: formData.date,
      totalPrice: formData.totalPrice
    };
    onComplete(payload, type);
    setCurrentStep(6);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="space-y-2"><Label>URL Pipedrive</Label><Input value={formData.pipedriveUrl} onChange={e => setFormData(prev => ({ ...prev, pipedriveUrl: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Versão</Label><Input value={formData.version} onChange={e => setFormData(prev => ({ ...prev, version: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Data</Label><Input type="date" value={formData.date} onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label>CNPJ</Label><Input value={formData.cnpj} onChange={e => setFormData(prev => ({ ...prev, cnpj: formatCnpj(e.target.value) }))} /></div>
            <div className="space-y-2"><Label>Razão Social</Label><Input value={formData.companyName} onChange={e => setFormData(prev => ({ ...prev, companyName: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Contato</Label><Input value={formData.contactName} onChange={e => setFormData(prev => ({ ...prev, contactName: e.target.value }))} /></div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-2"><Label>Vendedor</Label><Input value={formData.sellerName} onChange={e => setFormData(prev => ({ ...prev, sellerName: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Cargo</Label><Input value={formData.sellerRole} onChange={e => setFormData(prev => ({ ...prev, sellerRole: e.target.value }))} /></div>
          </div>
        );
      case 3:
        return <div className="space-y-4"><Label>Usuários</Label><Input type="number" value={formData.users} onChange={e => setFormData(prev => ({ ...prev, users: e.target.value }))} /></div>;
      case 4:
        return (
          <div className="space-y-4">
            <Input placeholder="Buscar produto..." value={productSearch} onChange={e => setProductSearch(e.target.value)} />
            <div className="max-h-60 overflow-y-auto border rounded-xl divide-y">
              {filteredProducts.map(p => (
                <div key={p.id} className="flex items-center justify-between p-2">
                  <span className="text-xs font-bold">{p.name}</span>
                  <Button size="sm" onClick={() => setFormData(prev => ({ ...prev, selectedProducts: [...prev.selectedProducts, { ...p, quantity: 1 }] }))}>Add</Button>
                </div>
              ))}
            </div>
            <div className="pt-4 space-y-2">
              <Label className="font-bold">Selecionados</Label>
              {formData.selectedProducts.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-muted p-2 rounded">
                  <span>{p.name}</span>
                  <Input type="number" className="w-12 h-6" value={p.quantity} onChange={e => setFormData(prev => ({ ...prev, selectedProducts: prev.selectedProducts.map((sp, idx) => idx === i ? { ...sp, quantity: parseInt(e.target.value) } : sp) }))} />
                </div>
              ))}
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-6">
            <div className="p-6 bg-primary text-white rounded-2xl">
              <Label>VALOR TOTAL</Label>
              <Input type="number" step="0.01" className="bg-transparent border-none text-4xl font-black text-white" value={formData.totalPrice} onChange={e => setFormData(prev => ({ ...prev, totalPrice: parseFloat(e.target.value) }))} />
            </div>
            <div className="flex items-center justify-between p-4 border rounded-2xl">
              <Label>Página de Aprovação</Label>
              <Switch checked={formData.includeApprovalPage} onCheckedChange={v => setFormData(prev => ({ ...prev, includeApprovalPage: v }))} />
            </div>
          </div>
        );
      case 6:
        return (
          <div className="py-10 text-center space-y-6">
            <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto" />
            <h2 className="text-3xl font-black">Pronto!</h2>
            <Button className="w-full h-12" onClick={handleReset}>Novo Orçamento</Button>
          </div>
        );
      default: return null;
    }
  };

  if (loadingBases) return <Loader2 className="animate-spin mx-auto" />;

  return (
    <Card className="max-w-2xl mx-auto proposal-highlight rounded-3xl overflow-hidden shadow-2xl">
      <CardHeader className="bg-primary text-white p-8">
        <CardTitle>Passo {currentStep}</CardTitle>
      </CardHeader>
      <CardContent className="p-8">
        {renderStep()}
        {currentStep < 6 && (
          <div className="flex justify-between mt-10">
            <Button variant="ghost" onClick={currentStep === 1 ? onCancel : () => setCurrentStep(prev => prev - 1)}>Voltar</Button>
            <div className="flex gap-2">
              {currentStep === 5 ? (
                <>
                  <Button variant="outline" onClick={() => handleFinish('pdf')}><FileText className="mr-2 h-4 w-4" /> PDF</Button>
                  <Button onClick={() => handleFinish('pptx')}><Presentation className="mr-2 h-4 w-4" /> PPTX</Button>
                </>
              ) : (
                <Button onClick={() => setCurrentStep(prev => prev + 1)}>Próximo</Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}