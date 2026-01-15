"use client";

import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { calculateProposalSummary, generateProposalNumber, formatDateForProposal } from "@/services/proposalService";
import { QuoteItem } from "@/types/quote";
import { formatCurrencyBRL } from "@/lib/formatters";

interface ProposalSummaryProps {
  items: QuoteItem[];
  proposalData: {
    cnpj: string;
    companyName: string;
    contactName: string;
    email: string;
    phone: string;
    address: string;
    proposalDate: string;
    observations: string;
    priceModel: '12m' | '24m';
  };
  onConfirm: () => void;
  onBack: () => void;
}

export function ProposalSummary({ 
  items, 
  proposalData, 
  onConfirm, 
  onBack 
}: ProposalSummaryProps) {
  const summary = calculateProposalSummary(items);
  const proposalNumber = generateProposalNumber();
  const formattedDate = formatDateForProposal(proposalData.proposalDate);
  
  const totalPrice = items.reduce((sum, item) => {
    // Prefer stored unitPrice if present (this covers edited values in review)
    const unitPrice = (item as any).unitPrice ?? (item.priceModel === '12m' ? item.product.value_12m : item.product.value_24m);
    return sum + (unitPrice * item.quantity);
  }, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Resumo da Proposta</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <h3 className="font-semibold">Dados da Empresa</h3>
              <p><strong>Razão Social:</strong> {proposalData.companyName}</p>
              <p><strong>CNPJ:</strong> {proposalData.cnpj}</p>
              <p><strong>Responsável:</strong> {proposalData.contactName}</p>
              <p><strong>E-mail:</strong> {proposalData.email}</p>
              <p><strong>Telefone:</strong> {proposalData.phone || 'Não informado'}</p>
              <p><strong>Endereço:</strong> {proposalData.address || 'Não informado'}</p>
            </div>
            
            <div>
              <h3 className="font-semibold">Dados da Proposta</h3>
              <p><strong>Data:</strong> {formattedDate}</p>
              <p><strong>Número:</strong> {proposalNumber}</p>
              <p><strong>Modelo de Preço:</strong> {proposalData.priceModel === '12m' ? '12 meses' : '24 meses'}</p>
              <p><strong>Observações:</strong> {proposalData.observations || 'Nenhuma'}</p>
            </div>
          </div>
          
          <div className="border rounded-md mb-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Quantidade</TableHead>
                  <TableHead className="text-right">Valor Unitário</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const unitPrice = (item as any).unitPrice ?? (item.priceModel === '12m' ? item.product.value_12m : item.product.value_24m);
                  const subtotal = unitPrice * item.quantity;
                  
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div>{item.product.description}</div>
                        <div className="text-sm text-muted-foreground">
                          {item.product.part_number}
                        </div>
                      </TableCell>
                      <TableCell>
                        {item.priceModel === '12m' ? '12 meses' : '24 meses'}
                      </TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell className="text-right">{formatCurrencyBRL(unitPrice)}</TableCell>
                      <TableCell className="text-right">{formatCurrencyBRL(subtotal)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Total de Usuários</div>
                <div className="text-2xl font-bold">{summary.totalUsers}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Total de Dispositivos</div>
                <div className="text-2xl font-bold">{summary.totalDevices}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Valor Total</div>
                <div className="text-2xl font-bold">{formatCurrencyBRL(totalPrice)}</div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
      
      <div className="flex justify-end space-x-4">
        <Button variant="outline" onClick={onBack}>
          Voltar
        </Button>
        <Button onClick={onConfirm}>
          Confirmar e Gerar Proposta
        </Button>
      </div>
    </div>
  );
}