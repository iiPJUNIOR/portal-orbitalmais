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
import { Product } from "@/types/product";
import { formatModelLabel, formatCurrencyBRL } from "@/lib/formatters";

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

  const getCharacteristics = (product: Product) => {
    const characteristics = [];

    if (product.biometrics) characteristics.push("Biometria");
    if (product.facial !== "None") characteristics.push(`Facial ${product.facial}`);
    if (product.proximity !== "None") characteristics.push(`Prox ${product.proximity}`);
    if ((product as any).urn) characteristics.push("Urna");
    if ((product as any).qr) characteristics.push("QR");

    return characteristics.join(", ");
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
            <TableHead>Material porta</TableHead>
            <TableHead>Controle</TableHead>
            <TableHead>Com iDSecure</TableHead>
            <TableHead>Sem iDSecure</TableHead>
            <TableHead>Lite / outro sistema</TableHead>
            <TableHead>Valor total (com iDSecure)</TableHead>
            <TableHead>Valor total (sem iDSecure)</TableHead>
            <TableHead className="text-right">Quantidade</TableHead>
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

                <TableCell>{priceCom ? formatCurrencyBRL(priceCom) : "-"}</TableCell>
                <TableCell>{priceSem ? formatCurrencyBRL(priceSem) : "-"}</TableCell>

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
                      className="w-20 text-center"
                    />
                  </div>
                </TableCell>

                <TableCell className="text-right">
                  <Button
                    onClick={() => onAddToQuote(product, qty)}
                    size="sm"
                  >
                    Adicionar
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