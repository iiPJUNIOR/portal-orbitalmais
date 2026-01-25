"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Check, ArrowRight, ArrowLeft, Package, User, Building, Layout, DollarSign, Loader2 } from "lucide-react";

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

const PRODUCT_LIST = [
  "iDFace Pro", "iDFace Max", "iDAccess Nano", "iDFlex IP65", "iDFlex Pro", 
  "iDAccess", "iDFit 4x2", "iDAccess Pro", "Secbox", "idUHF", "idUHF Lite", 
  "iDBlock Next Catraca Inteligente com Reconhecimento Facial",
  "iDBlock Next Catraca Inteligente com Biometria Digital",
  "iDBlock Facial Inox Catraca Inteligente com Reconhecimento Facial",
  "iDBlock Facial Preta Catraca Inteligente com Reconhecimento Facial",
  "iDBlock Facial Mini Preta Catraca Inteligente com Reconhecimento Facial",
  "iDBlock Facial Mini Inox Catraca Inteligente com Reconhecimento Facial",
  "iDBlock Inox Catraca Biométrica Digital Inteligente",
  "iDBlock Preta Catraca Biométrica Digital Inteligente",
  "iDBlock Braço Articulado Inox Catraca Biométrica Digital Inteligente",
  "iDBlock Braço Articulado Preta Catraca Biométrica Digital Inteligente",
  "iDBlock Balcão Catraca Biométrica Digital Inteligente",
  "iDBlock PNE Catraca Biométrica Digital Inteligente",
  "Torniquete FET 100 Torniquete Biométrico Digital Inteligente",
  "iDPower Fonte Carregador Temporizado",
  "iDProx USB Leitor de mesa para cadastramento de RFID por proximidade",
  "iDBio Leitor biométrico de mesa"
];

const DOOR_CONTROLLERS = [
  "iDFace Pro", "iDFace Max", "iDFlex IP65", "iDFlex Pro", "iDAccess Nano", "iDAccess", "iDAccess Pro"
];

export function ProposalWizard({ initialSellerData, onComplete, onCancel }: WizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [fetchingCnpj, setFetchingCnpj] = useState(false);
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

  // Função para formatar endereço da API
  const buildAddressFromApi = (data: any) => {
    const street = data.logradouro || "";
    const number = data.numero || "";
    const neighborhood = data.bairro || "";
    const city = data.municipio || "";
    const uf = data.uf || "";
    const cep = data.cep || "";
    
    return [
      street ? `${street}${number ? `, ${number}` : ""}` : "",
      neighborhood,
      city ? `${city} - ${uf}` : "",
      cep
    ].filter(Boolean).join(", ");
  };

  // Busca de CNPJ
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
        address: buildAddressFromApi(data) || prev.address
      }));
      
      toast.success("Dados preenchidos automaticamente!", { id: toastId });
    } catch (err) {
      toast.error("Não foi possível carregar os dados do CNPJ.", { id: toastId });
    } finally {
      setFetchingCnpj(false);
    }
  };

  // Monitorar CNPJ para busca automática
  useEffect(() => {
    const digits = formData.cnpj.replace(/\D/g, "");
    if (digits.length === 14) {
      fetchCnpjData(digits);
    }
  }, [formData.cnpj]);

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, "");
    if (val.length > 14) val = val.substring(0, 14);
    
    // Máscara 00.000.000/0000-00
    let masked = val;
    if (val.length > 12) masked = val.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*/, "$1.$2.$3/$4-$5");
    else if (val.length > 8) masked = val.replace(/^(\d{2})(\d{3})(\d{3})(\d{4}).*/, "$1.$2.$3/$4");
    else if (val.length > 5) masked = val.replace(/^(\d{2})(\d{3})(\d{3}).*/, "$1.$2.$3");
    else if (val.length > 2) masked = val.replace(/^(\d{2})(\d{3}).*/, "$1.$2");
    
    setFormData(prev => ({ ...prev, cnpj: masked }));
  };

  const nextStep = () => {
    if (validateStep()) setCurrentStep(prev => prev + 1);
  };
  
  const prevStep = () => setCurrentStep(prev => prev - 1);

  const validateStep = () => {
    if (currentStep === 1) {
      if (!formData.companyName) return notifyError("Nome da empresa é obrigatório");
      if (!formData.contactName) return notifyError("Nome do contato é obrigatório");
      if (!formData.pipedriveUrl) return notifyError("URL do Pipedrive é obrigatória");
    }
    if (currentStep === 2) {
      if (!formData.sellerName) return notifyError("Nome do vendedor é obrigatório");
    }
    if (currentStep === 3) {
      if (!formData.users || Number(formData.users) <= 0) return notifyError("Número de usuários deve ser maior que zero");
    }
    if (currentStep === 4) {
      if (formData.selectedProducts.length === 0) return notifyError("Selecione pelo menos um produto");
      for (const p of formData.selectedProducts) {
        if (!p.quantity || p.quantity < 1) return notifyError(`Quantidade inválida para ${p.name}`);
      }
    }
    return true;
  };

  const notifyError = (msg: string) => {
    toast.error(msg);
    return false;
  };

  const handleProductToggle = (productName: string) => {
    setFormData(prev => {
      const exists = prev.selectedProducts.find(p => p.name === productName);
      if (exists) {
        return { ...prev, selectedProducts: prev.selectedProducts.filter(p => p.name !== productName) };
      } else {
        return { 
          ...prev, 
          selectedProducts: [...prev.selectedProducts, { 
            name: productName, 
            quantity: 1,
            entryTech: 'facial',
            exitTech: 'botoeira',
            doorType: 'madeira'
          }] 
        };
      }
    });
  };

  const updateProductData = (name: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      selectedProducts: prev.selectedProducts.map(p => p.name === name ? { ...p, [field]: value } : p)
    }));
  };

  // Extrair deal ID do pipedrive
  useEffect(() => {
    if (formData.pipedriveUrl) {
      const match = formData.pipedriveUrl.match(/\/deal\/(\d+)/);
      if (match) setFormData(prev => ({ ...prev, dealId: match[1] }));
    }
  }, [formData.pipedriveUrl]);

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>URL do Pipedrive (Pipe)</Label>
              <Input 
                placeholder="https://controlid.pipedrive.com/deal/214049" 
                value={formData.pipedriveUrl}
                onChange={e => setFormData(prev => ({ ...prev, pipedriveUrl: e.target.value }))}
              />
              {formData.dealId && <p className="text-xs text-green-600">ID detectado: {formData.dealId}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Versão</Label>
                <Input value={formData.version} onChange={e => setFormData(prev => ({ ...prev, version: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Data da Proposta</Label>
                <Input value={formData.date} onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))} />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                CNPJ da Empresa
                {fetchingCnpj && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
              </Label>
              <Input 
                placeholder="00.000.000/0000-00" 
                value={formData.cnpj} 
                onChange={handleCnpjChange}
              />
              <p className="text-[10px] text-muted-foreground">Preenchimento automático ao digitar 14 dígitos.</p>
            </div>

            <div className="space-y-2">
              <Label>Razão Social / Nome da Empresa</Label>
              <Input 
                placeholder="Empresa LTDA" 
                value={formData.companyName} 
                onChange={e => setFormData(prev => ({ ...prev, companyName: e.target.value }))} 
              />
            </div>

            <div className="space-y-2">
              <Label>Pessoa de Contato (A/C)</Label>
              <Input 
                placeholder="Nome do responsável" 
                value={formData.contactName} 
                onChange={e => setFormData(prev => ({ ...prev, contactName: e.target.value }))} 
              />
            </div>
            
            <div className="space-y-2">
              <Label>Endereço Completo</Label>
              <Input 
                placeholder="Rua, Número, Bairro, Cidade - UF" 
                value={formData.address} 
                onChange={e => setFormData(prev => ({ ...prev, address: e.target.value }))} 
              />
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground mb-4">Confirme seus dados de vendedor:</p>
            <div className="space-y-2">
              <Label>Nome do Vendedor</Label>
              <Input value={formData.sellerName} onChange={e => setFormData(prev => ({ ...prev, sellerName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Cargo</Label>
              <Input value={formData.sellerRole} onChange={e => setFormData(prev => ({ ...prev, sellerRole: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input value={formData.sellerEmail} onChange={e => setFormData(prev => ({ ...prev, sellerEmail: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={formData.sellerPhone} onChange={e => setFormData(prev => ({ ...prev, sellerPhone: e.target.value }))} />
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Quantos usuários o sistema irá atender? *</Label>
              <Input type="number" placeholder="Ex: 500" value={formData.users} onChange={e => setFormData(prev => ({ ...prev, users: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Quantos dispositivos no total? (Opcional, calculado se pular)</Label>
              <Input type="number" value={formData.devices} onChange={e => setFormData(prev => ({ ...prev, devices: parseInt(e.target.value) || 0 }))} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">qtd</Label>
                <Input value={formData.qtd} onChange={e => setFormData(prev => ({ ...prev, qtd: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">qtd1</Label>
                <Input value={formData.qtd1} onChange={e => setFormData(prev => ({ ...prev, qtd1: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">qtd2</Label>
                <Input value={formData.qtd2} onChange={e => setFormData(prev => ({ ...prev, qtd2: e.target.value }))} />
              </div>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-6">
            <div className="max-h-60 overflow-y-auto border rounded p-2 space-y-1">
              {PRODUCT_LIST.map(p => (
                <div key={p} className="flex items-center space-x-2 p-1 hover:bg-gray-50 rounded">
                  <input 
                    type="checkbox" 
                    checked={formData.selectedProducts.some(sp => sp.name === p)}
                    onChange={() => handleProductToggle(p)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">{p}</span>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              {formData.selectedProducts.map(p => (
                <Card key={p.name} className="p-3 border-l-4 border-l-primary">
                  <div className="font-bold text-sm mb-2">{p.name}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Quantidade</Label>
                      <Input type="number" min="1" value={p.quantity} onChange={e => updateProductData(p.name, 'quantity', parseInt(e.target.value) || 1)} />
                    </div>
                    {DOOR_CONTROLLERS.includes(p.name) && (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs">Tecnologia Entrada</Label>
                          <select className="w-full border rounded text-xs p-1" value={p.entryTech} onChange={e => updateProductData(p.name, 'entryTech', e.target.value)}>
                            <option value="facial">Facial</option>
                            <option value="biometria">Biometria</option>
                            <option value="botoeira">Botoeira</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Tecnologia Saída</Label>
                          <select className="w-full border rounded text-xs p-1" value={p.exitTech} onChange={e => updateProductData(p.name, 'exitTech', e.target.value)}>
                            <option value="facial">Facial</option>
                            <option value="biometria">Biometria</option>
                            <option value="botoeira">Botoeira</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Tipo de Porta</Label>
                          <select className="w-full border rounded text-xs p-1" value={p.doorType} onChange={e => updateProductData(p.name, 'doorType', e.target.value)}>
                            <option value="madeira">Madeira</option>
                            <option value="ferro">Ferro</option>
                            <option value="vidro">Vidro</option>
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-4">
            <div className="p-4 bg-primary/5 rounded border border-primary/20">
              <p className="text-sm font-medium mb-1">Resumo do Orçamento:</p>
              <ul className="text-xs space-y-1 text-muted-foreground">
                <li>Cliente: {formData.companyName}</li>
                <li>Produtos: {formData.selectedProducts.length} tipos</li>
                <li>Usuários: {formData.users}</li>
              </ul>
            </div>
            <div className="space-y-2">
              <Label className="text-lg font-bold">Qual é o valor total da proposta? (R$)</Label>
              <Input 
                type="number" 
                step="0.01" 
                placeholder="0.00" 
                className="text-2xl h-14 font-bold"
                value={formData.totalPrice || ""} 
                onChange={e => setFormData(prev => ({ ...prev, totalPrice: parseFloat(e.target.value) || 0 }))} 
              />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const handleFinish = () => {
    if (!validateStep()) return;
    
    const payload = {
      ...formData,
      proposalNumber: `${formData.dealId} V${formData.version}`,
      items: formData.selectedProducts.map(p => ({
        product: { description: p.name, model: p.name, category: p.name.includes("Block") ? "Catraca" : "Controlador" },
        quantity: p.quantity,
        unitPrice: 0,
        installationData: {
          entryTech: p.entryTech,
          exitTech: p.exitTech,
          doorType: p.doorType
        }
      })),
      overrideTotal: formData.totalPrice
    };
    
    onComplete(payload);
  };

  const steps = [
    { id: 1, title: "Proposta", icon: Building },
    { id: 2, title: "Vendedor", icon: User },
    { id: 3, title: "Quantidades", icon: Layout },
    { id: 4, title: "Produtos", icon: Package },
    { id: 5, title: "Finalizar", icon: DollarSign },
  ];

  return (
    <Card className="max-w-2xl mx-auto shadow-lg border-2">
      <CardHeader className="bg-primary/5 border-b">
        <div className="flex items-center justify-between mb-2">
          {steps.map(s => (
            <div key={s.id} className={`flex flex-col items-center gap-1 ${currentStep === s.id ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`p-2 rounded-full ${currentStep === s.id ? 'bg-primary text-white' : 'bg-gray-200'}`}>
                <s.icon className="h-4 w-4" />
              </div>
              <span className="text-[10px] font-bold uppercase">{s.title}</span>
            </div>
          ))}
        </div>
        <CardTitle className="text-xl">Assistente de Proposta</CardTitle>
        <CardDescription>Preencha os dados passo a passo para gerar seu PPTX.</CardDescription>
      </CardHeader>
      
      <CardContent className="p-6">
        {renderStep()}
        
        <div className="flex justify-between mt-8 pt-4 border-t">
          <Button variant="ghost" onClick={currentStep === 1 ? onCancel : prevStep}>
            {currentStep === 1 ? "Cancelar" : "Voltar"}
          </Button>
          
          <Button onClick={currentStep === 5 ? handleFinish : nextStep} disabled={fetchingCnpj}>
            {currentStep === 5 ? "Gerar PPTX Final" : "Próximo"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}