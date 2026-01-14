"use client";

import React, { useState } from 'react';
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
import { ptBR } from "date-fns/locale";

interface ProposalFormData {
  cnpj: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  proposalDate: string;
  observations: string;
  priceModel: '12m' | '24m';
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
    priceModel: '12m'
  });

  const handleChange = (field: keyof ProposalFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
              <Input
                id="cnpj"
                placeholder="00.000.000/0000-00"
                value={formData.cnpj}
                onChange={handleCnpjChange}
                required
              />
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