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
import { Badge } from "@/components/ui/badge";
import { Plus, Minus } from "lucide-react";
import { Product } from "@/types/product";
import { formatModelLabel } from "@/lib/formatters";

interface ProductTableProps {
  products: Product[];
  onAddToQuote: (product: Product, quantity: number) => void;
}

export function ProductTable({ products, onAddToQuote }: ProductTableProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const handleQuantityChange = (productId: string, value: number) => {
    setQuantities(prev => ({
      ...prev,
      [productId]: Math.max(1, Math.min(99, value))
    }));
  };

  const incrementQuantity = (productId: string) => {
    const current = quantities[productId] || 1;
    handleQuantityChange(productId, current + 1);
  };

  const decrementQuantity = (productId: string) => {
    const current = quantities[productId] || 1;
    handleQuantityChange(productId, current - 1);
  };

  const getCharacteristics = (product: Product) => {
    const characteristics = [];
    
    if (product.biometrics) characteristics.push("Biometria");
    if (product.facial !== "None") characteristics.push(`Facial ${product.facial}`);
    if (product.proximity !== "None") characteristics.push(`Prox ${product.proximity}`);
    if (product.urn) characteristics.push("Urna");
    if (product.qr) characteristics.push("QR");
    
    return characteristics.join(", ");
  };

  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Descrição</TableHead>
            <TableHead>Características</TableHead>
            <TableHead>Valor 12m</TableHead>
            <TableHead>Valor 24m</TableHead>
            <TableHead className="text-right">Quantidade</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product, idx) => (
            <TableRow key={`${product.sku ?? product.id}-${idx}`}>
              <TableCell className="font-medium">
                <div>{product.description}</div>
                <div className="text-sm text-muted-foreground">
                  {product.part_number} | {formatModelLabel(product.model)}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{getCharacteristics(product)}</Badge>
              </TableCell>
              <TableCell>R$ {product.value_12m.toFixed(2)}</TableCell>
              <TableCell>R$ {product.value_24m.toFixed(2)}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end space-x-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => decrementQuantity(product.id)}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="number"
                    min="1"
                    max="99"
                    value={quantities[product.id] || 1}
                    onChange={(e) => 
                      handleQuantityChange(product.id, parseInt(e.target.value) || 1)
                    }
                    className="w-16 text-center"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => incrementQuantity(product.id)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Button 
                  onClick={() => onAddToQuote(product, quantities[product.id] || 1)}
                  size="sm"
                >
                  Adicionar
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      
      {products.length === 0 && (
        <div className="p-8 text-center text-muted-foreground">
          Nenhum produto encontrado
        </div>
      )}
    </div>
  );
}