"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { format } from "date-fns";
import { toast } from "sonner";
import { fetchCnpjData, CnpjData } from "@/services/cnpjService";

export interface ProposalFormData {
  cnpj: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  proposalDate: string;
  observations: string;
  priceModel: '12m' | '24m';
  proposalNumber?: string;
  // global flags for conditional slides (option B)
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

interface ProposalFormProps {
  onSubmit: (data: ProposalFormData) => void;
  onCancel: () => void;
}

export function ProposalForm({ onSubmit, onCancel }: ProposalFormProps) {
  const [formData, setFormData] = useState<ProposalFormData>({
    cnpj: "",
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    address: "",
    proposalDate: format(new Date(), "yyyy-MM-dd"),
    observations: "",
    priceModel: '12m',
    proposalNumber: "",
    flags: {
      botoeira: false,
      idfaceEntry: false,
      idfaceExit: false,
      idAccessNanoEntry: false,
      idFlexProEntry: false,
      idFlexProGlass: false,
      hasCatraca: false,
      systemIncluded: false,
    },
    overrideTotal: null,
  });

  const [isProposalNumberEdited, setIsProposalNumberEdited] = useState(false);

  useEffect(() => {
    if (!isProposalNumberEdited && formData.companyName) {
      const dateStr = (formData.proposalDate || "").replace(/\D/g, "");
      setFormData(prev => ({
        ...prev,
        proposalNumber: `${prev.companyName} - ${dateStr}-001`
      }));
    }
  }, [formData.companyName, formData.proposalDate, isProposalNumberEdited]);

  const [fetchingCnpj, setFetchingCnpj] = useState(false);
  const [lastFetchedCnpj, setLastFetchedCnpj] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  const handleChange = (field: keyof ProposalFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFlagChange = (flag: keyof NonNullable<ProposalFormData["flags"]>, value: boolean) => {
    setFormData(prev => ({ ...prev, flags: { ...(prev.flags || {}), [flag]: value } }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  // Format CNPJ as user types
  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 14) value = value.substring(0, 14);
    
    let formatted = '';
    for (let i = 0; i < value.length; i++) {
      if (i === 2 || i === 5) formatted += '.';
      if (i === 8) formatted += '/';
      if (i === 12) formatted += '-';
      formatted += value[i];
    }
    
    setFormData(prev => ({ ...prev, cnpj: formatted }));
  };

  // Format phone as user types
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.substring(0, 11);
    
    let formatted = '';
    for (let i = 0; i < value.length; i++) {
      if (i === 0) formatted += '(';
      if (i === 2) formatted += ') ';
      if (i === 7) formatted += '-';
      formatted += value[i];
    }
    
    setFormData(prev => ({ ...prev, phone: formatted }));
  };

  // Fetch CNPJ data using multiple API providers with fallback
  async function handleCnpjLookup(rawDigits: string) {
    if (!rawDigits || rawDigits.length !== 14) return;
    // Avoid refetching the same CNPJ repeatedly
    if (lastFetchedCnpj === rawDigits) {
      return;
    }

    setFetchingCnpj(true);
    setLastFetchedCnpj(rawDigits);
    const toastId = toast.loading("Buscando dados do CNPJ...");

    try {
      const data = await fetchCnpjData(rawDigits);

      setFormData(prev => ({
        ...prev,
        companyName: data.companyName || prev.companyName,
        email: data.email || prev.email,
        phone: data.phone || prev.phone,
        address: data.address || prev.address,
      }));

      toast.dismiss(toastId);
      toast.success("Dados do CNPJ preenchidos automaticamente");
    } catch (err: any) {
      console.error("fetchCnpjData error", err);
      toast.dismiss(toastId);
      toast.error("Não foi possível obter dados para o CNPJ informado. Tente novamente.");
      setLastFetchedCnpj(null); // allow retry later
    } finally {
      setFetchingCnpj(false);
    }
  }

  // Auto-trigger fetch when CNPJ reaches 14 digits or after user stops typing
  useEffect(() => {
    const digits = (formData.cnpj || "").replace(/\D/g, "");
    // Clear any pending debounce timer
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    // If user typed full CNPJ, wait a short delay and then fetch
    if (digits.length === 14) {
      debounceRef.current = window.setTimeout(() => {
        handleCnpjLookup(digits);
        debounceRef.current = null;
      }, 600);
    } else {
      // If not full length, avoid auto-fetching; but clear lastFetchedCnpj so user can re-trigger later
      // Do not clear lastFetchedCnpj immediately to prevent spamming; only when user clears input completely
      if (digits.length === 0) {
        setLastFetchedCnpj(null);
      }
    }

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.cnpj]);

  const handleManualCnpjLookup = () => {
    const digits = (formData.cnpj || "").replace(/\D/g, "");
    if (digits.length !== 14) {
      toast.error("Informe um CNPJ válido (14 dígitos) para buscar");
      return;
    }
    handleCnpjLookup(digits);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados da Empresa</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cnpj">CNPJ *</Label>
              <div className="flex gap-2">
                <Input
                  id="cnpj"
                  placeholder="00.000.000/0000-00"
                  value={formData.cnpj}
                  onChange={handleCnpjChange}
                  required
                />
                <Button type="button" onClick={handleManualCnpjLookup} disabled={fetchingCnpj}>
                  {fetchingCnpj ? "Buscando..." : "Buscar"}
                </Button>
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Ao digitar o CNPJ completo o sistema tentará preencher automaticamente os dados.
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="companyName">Razão Social *</Label>
              <Input
                id="companyName"
                placeholder="Nome da empresa"
                value={formData.companyName}
                onChange={(e) => handleChange('companyName', e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="contactName">Nome do Responsável *</Label>
              <Input
                id="contactName"
                placeholder="Nome completo"
                value={formData.contactName}
                onChange={(e) => handleChange('contactName', e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">E-mail *</Label>
              <Input
                id="email"
                type="email"
                placeholder="email@empresa.com"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                placeholder="(00) 00000-0000"
                value={formData.phone}
                onChange={handlePhoneChange}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="address">Endereço</Label>
              <Input
                id="address"
                placeholder="Endereço completo"
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="proposalDate">Data da Proposta</Label>
              <Input
                id="proposalDate"
                type="date"
                value={formData.proposalDate}
                onChange={(e) => handleChange('proposalDate', e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="priceModel">Modelo de Preço</Label>
              <Select 
                value={formData.priceModel} 
                onValueChange={(value: '12m' | '24m') => 
                  handleChange('priceModel', value)
                }
              >
                <SelectTrigger id="priceModel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="12m">12 meses</SelectItem>
                  <SelectItem value="24m">24 meses</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="observations">Observações Adicionais</Label>
            <Textarea
              id="observations"
              placeholder="Informações adicionais sobre a proposta"
              value={formData.observations}
              onChange={(e) => handleChange('observations', e.target.value)}
              rows={4}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="proposalNumber">Número do Orçamento</Label>
              <Input
                id="proposalNumber"
                placeholder="Ex: Razão Social - 20260605-001"
                value={formData.proposalNumber}
                onChange={(e) => {
                  setIsProposalNumberEdited(true);
                  handleChange('proposalNumber', e.target.value);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="overrideTotal">Valor Total (sobrescrever)</Label>
              <Input
                id="overrideTotal"
                type="number"
                step="0.01"
                placeholder="Deixe vazio para calcular automaticamente"
                value={formData.overrideTotal === null || formData.overrideTotal === undefined ? "" : String(formData.overrideTotal)}
                onChange={(e) => handleChange('overrideTotal', e.target.value ? parseFloat(e.target.value) : null)}
              />
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Opções da Proposta (flags)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <label className="flex items-center space-x-2">
                <input type="checkbox" checked={!!formData.flags?.botoeira} onChange={(e) => handleFlagChange('botoeira', e.target.checked)} />
                <span>Botoeira incluída</span>
              </label>

              <label className="flex items-center space-x-2">
                <input type="checkbox" checked={!!formData.flags?.idfaceEntry} onChange={(e) => handleFlagChange('idfaceEntry', e.target.checked)} />
                <span>IdFace para entrada</span>
              </label>

              <label className="flex items-center space-x-2">
                <input type="checkbox" checked={!!formData.flags?.idfaceExit} onChange={(e) => handleFlagChange('idfaceExit', e.target.checked)} />
                <span>IdFace para saída</span>
              </label>

              <label className="flex items-center space-x-2">
                <input type="checkbox" checked={!!formData.flags?.idAccessNanoEntry} onChange={(e) => handleFlagChange('idAccessNanoEntry', e.target.checked)} />
                <span>iDAccess Nano para entrada</span>
              </label>

              <label className="flex items-center space-x-2">
                <input type="checkbox" checked={!!formData.flags?.idFlexProEntry} onChange={(e) => handleFlagChange('idFlexProEntry', e.target.checked)} />
                <span>iDFlex PRO IP65 para entrada</span>
              </label>

              <label className="flex items-center space-x-2">
                <input type="checkbox" checked={!!formData.flags?.idFlexProGlass} onChange={(e) => handleFlagChange('idFlexProGlass', e.target.checked)} />
                <span>iDFlex PRO em portas de vidro</span>
              </label>

              <label className="flex items-center space-x-2">
                <input type="checkbox" checked={!!formData.flags?.hasCatraca} onChange={(e) => handleFlagChange('hasCatraca', e.target.checked)} />
                <span>Contém catraca</span>
              </label>

              <label className="flex items-center space-x-2">
                <input type="checkbox" checked={!!formData.flags?.systemIncluded} onChange={(e) => handleFlagChange('systemIncluded', e.target.checked)} />
                <span>Sistema considerado no projeto (usuários obrigatórios)</span>
              </label>
            </div>
          </div>
          
          <div className="flex justify-end space-x-4">
            <Button type="button" variant="outline" onClick={onCancel}>
              Voltar
            </Button>
            <Button type="submit">
              Gerar Proposta
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}