"use client";

import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Minus } from "lucide-react";
import { Product } from "@/types/product";

interface QuoteItem {
  id: string;
  product: Product;
  quantity: number;
  priceModel: '12m' | '24m';
}

interface QuoteBuilderProps {
  items: QuoteItem[];
  onRemoveItem: (id: string) => void;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onUpdatePriceModel: (id: string, model: '12m' | '24m') => void;
  onGenerateProposal: () => void;
}

export function QuoteBuilder({ 
  items, 
  onRemoveItem, 
  onUpdateQuantity, 
  onUpdatePriceModel,
  onGenerateProposal
}: QuoteBuilderProps) {
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  
  const total12m = items.reduce((sum, item) => {
    const price = item.priceModel === '12m' ? item.product.value_12m : item.product.value_24m;
    return sum + (price * item.quantity);
  }, 0);
  
  const total24m = items.reduce((sum, item) => {
    const price = item.priceModel === '12m' ? item.product.value_12m * 2 : item.product.value_24m;
    return sum + (price * item.quantity);
  }, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Itens Selecionados</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Modelo de Preço</TableHead>
                <TableHead>Valor Unitário</TableHead>
                <TableHead>Quantidade</TableHead>
                <TableHead>Subtotal</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const unitPrice = item.priceModel === '12m' 
                  ? item.product.value_12m 
                  : item.product.value_24m;
                
                const subtotal = unitPrice * item.quantity;
                
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      <div>{item.product.description}</div>
                      <div className="text-sm text-muted-foreground">
                        {item.product.part_number}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select 
                        value={item.priceModel}
                        onValueChange={(value: '12m' | '24m') => 
                          onUpdatePriceModel(item.id, value)
                        }
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="12m">12 meses</SelectItem>
                          <SelectItem value="24m">24 meses</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>R$ {unitPrice.toFixed(2)}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => 
                          onUpdateQuantity(item.id, parseInt(e.target.value) || 1)
                        }
                        className="w-20"
                      />
                    </TableCell>
                    <TableCell>R$ {subtotal.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => onRemoveItem(item.id)}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          
          {items.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              Nenhum item adicionado ao orçamento
            </div>
          )}
        </CardContent>
      </Card>
      
      <Card className="bg-muted">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Total de Itens</div>
              <div className="text-2xl font-bold">{totalItems}</div>
            </div>
            
            <div>
              <div className="text-sm text-muted-foreground">Valor Total 12m</div>
              <div className="text-2xl font-bold">R$ {total12m.toFixed(2)}</div>
            </div>
            
            <div>
              <div className="text-sm text-muted-foreground">Valor Total 24m</div>
              <div className="text-2xl font-bold">R$ {total24m.toFixed(2)}</div>
            </div>
            
            <div className="flex items-end justify-end">
              <Button 
                size="lg"
                onClick={onGenerateProposal}
                disabled={items.length === 0}
              >
                Gerar Proposta
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}