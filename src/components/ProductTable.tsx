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
import { Product } from "@/types/product";
import { formatModelLabel, formatCurrencyBRL } from "@/lib/formatters";

interface ProductTableProps {
  products: Product[];
  // onAddToQuote accepts optional unitPrice to override product default when adding
  onAddToQuote: (product: Product, quantity: number, unitPrice?: number) => void;
}

export function ProductTable({ products, onAddToQuote }: ProductTableProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const handleQuantityChange = (productId: string, value: number) => {
    setQuantities(prev => ({
      ...prev,
      [productId]: Math.max(1, Math.min(99, value))
    }));
  };

  function getComplementMeta(product: Product, candidateKeys: string[]) {
    const meta = (product as any).complementMeta || {};
    if (!meta || typeof meta !== "object") return "";
    // case-insensitive match for header keys
    const lowerMap: Record<string, string> = {};
    Object.keys(meta).forEach(k => {
      lowerMap[k.toLowerCase()] = String(meta[k] ?? "");
    });
    for (const key of candidateKeys) {
      const low = key.toLowerCase();
      if (lowerMap[low] !== undefined) return lowerMap[low];
      // try substring match
      const found = Object.keys(lowerMap).find(k => k.includes(low) || low.includes(k));
      if (found) return lowerMap[found];
    }
    return "";
  }

  return (
    <div className="border rounded-md overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dispositivo</TableHead>
            <TableHead>Instalação</TableHead>
            <TableHead>Mat. Porta</TableHead>
            <TableHead>Controle</TableHead>
            <TableHead>Com iDS</TableHead>
            <TableHead>Sem iDS</TableHead>
            <TableHead>Sistema/Lite</TableHead>
            <TableHead>Total (c/ iDS)</TableHead>
            <TableHead>Total (s/ iDS)</TableHead>
            <TableHead className="text-right">Qtd</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product, idx) => {
            const productId = product.id ?? `${product.sku}-${idx}`;
            const qty = quantities[productId] || 1;

            // try to read specific complement fields (many possible header names)
            const dispositivo = product.model || product.description;
            const instalacao = getComplementMeta(product, ["instalacao", "instalação", "inst", "installation", "local"]);
            const materialPorta = getComplementMeta(product, ["material porta", "material", "portamaterial", "door material", "material_porta"]);
            const controle = getComplementMeta(product, ["controle", "control", "controle tipo", "tipo controle"]);

            // prices may be stored on product as price_com_iDSecure / price_sem_iDSecure or inside complementMeta columns
            const priceCom = (product as any).price_com_iDSecure ?? parseFloat(getComplementMeta(product, ["com idsecure", "com ids", "com id", "com_idsecure", "comids", "com"] as string[])) || 0;
            const priceSem = (product as any).price_sem_iDSecure ?? parseFloat(getComplementMeta(product, ["sem idsecure", "sem ids", "sem id", "semid", "sem"] as string[])) || 0;

            // Additional system field (lite or other)
            const liteOrSystem = getComplementMeta(product, ["lite", "sistema", "system", "software", "outro sistema"]);

            const totalCom = (priceCom && qty) ? priceCom * qty : 0;
            const totalSem = (priceSem && qty) ? priceSem * qty : 0;

            return (
              <TableRow key={`${productId}`}>
                <TableCell className="font-medium">
                  <div>{dispositivo}</div>
                  <div className="text-sm text-muted-foreground">
                    {product.part_number} | {formatModelLabel(product.model)}
                  </div>
                </TableCell>

                <TableCell>{instalacao || "-"}</TableCell>
                <TableCell>{materialPorta || "-"}</TableCell>
                <TableCell>{controle || "-"}</TableCell>

                <TableCell>
                  {priceCom ? (
                    <button
                      className="text-left text-blue-600 hover:underline cursor-pointer"
                      onClick={() => onAddToQuote(product, qty, priceCom)}
                      title="Clique para adicionar este item com o preço 'Com iDSecure'"
                    >
                      {formatCurrencyBRL(priceCom)}
                    </button>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>

                <TableCell>
                  {priceSem ? (
                    <button
                      className="text-left text-blue-600 hover:underline cursor-pointer"
                      onClick={() => onAddToQuote(product, qty, priceSem)}
                      title="Clique para adicionar este item com o preço 'Sem iDSecure'"
                    >
                      {formatCurrencyBRL(priceSem)}
                    </button>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>

                <TableCell>{liteOrSystem || "-"}</TableCell>

                <TableCell>{totalCom ? formatCurrencyBRL(totalCom) : "-"}</TableCell>
                <TableCell>{totalSem ? formatCurrencyBRL(totalSem) : "-"}</TableCell>

                <TableCell className="text-right">
                  <div className="flex items-center justify-end">
                    <Input
                      type="number"
                      min="1"
                      max="99"
                      value={qty}
                      onChange={(e) => handleQuantityChange(productId, parseInt(e.target.value) || 1)}
                      className="w-16 text-center"
                    />
                  </div>
                </TableCell>

                <TableCell className="text-right">
                  <Button
                    onClick={() => onAddToQuote(product, qty)}
                    size="sm"
                  >
                    Add
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
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