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
import { Badge } from "@/components/ui/badge";
import { Quote, QuoteItem } from "@/types/quote";

interface QuoteDetailsProps {
  quote: Quote;
  items: QuoteItem[];
  onBack: () => void;
  onRegenerate: () => void;
}

export function QuoteDetails({ quote, items, onBack, onRegenerate }: QuoteDetailsProps) {
  const getStatusBadge = (status: Quote['status']) => {
    switch (status) {
      case 'rascunho':
        return <Badge variant="secondary">Rascunho</Badge>;
      case 'enviada':
        return <Badge variant="default">Enviada</Badge>;
      case 'aceita':
        return <Badge variant="success">Aceita</Badge>;
      case 'recusada':
        return <Badge variant="destructive">Recusada</Badge>;
      default:
        return <Badge variant="secondary">Desconhecido</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Detalhes do Orçamento</CardTitle>
              <p className="text-muted-foreground">Número: {quote.proposalNumber}</p>
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" onClick={onBack}>
                Voltar
              </Button>
              <Button onClick={onRegenerate}>
                Regenerar Proposta
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <h3 className="font-semibold mb-2">Dados da Empresa</h3>
              <div className="space-y-1">
                <p><strong>Razão Social:</strong> {quote.companyName}</p>
                <p><strong>CNPJ:</strong> {quote.cnpj}</p>
                <p><strong>Responsável:</strong> {quote.contactName}</p>
                <p><strong>E-mail:</strong> {quote.email}</p>
                <p><strong>Telefone:</strong> {quote.phone || 'Não informado'}</p>
                <p><strong>Endereço:</strong> {quote.address || 'Não informado'}</p>
              </div>
            </div>
            
            <div>
              <h3 className="font-semibold mb-2">Dados do Orçamento</h3>
              <div className="space-y-1">
                <p><strong>Data:</strong> {new Date(quote.proposalDate).toLocaleDateString('pt-BR')}</p>
                <p><strong>Status:</strong> {getStatusBadge(quote.status)}</p>
                <p><strong>Modelo de Preço:</strong> {quote.priceModel === '12m' ? '12 meses' : '24 meses'}</p>
                <p><strong>Valor Total:</strong> R$ {quote.totalPrice.toFixed(2)}</p>
                <p><strong>Observações:</strong> {quote.observations || 'Nenhuma'}</p>
              </div>
            </div>
          </div>
          
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Valor Unitário</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.productDescription}</TableCell>
                    <TableCell>{item.sku}</TableCell>
                    <TableCell>{item.priceModel === '12m' ? '12 meses' : '24 meses'}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">R$ {item.unitPrice.toFixed(2)}</TableCell>
                    <TableCell className="text-right">R$ {item.subtotal.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}