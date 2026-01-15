"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseSpreadsheetNumber } from "@/lib/formatters";

type StoredBase = {
  id: string;
  name: string;
  type: "catalog" | "product";
  headers: string[];
  rows: any[][];
  createdAt: string;
  keyColumn?: string | null;
  comIdsColumn?: string | null;
  semIdsColumn?: string | null;
};

interface PriceBaseTableProps {
  base: StoredBase;
  // called when user clicks "Adicionar" for a row
  onAddRow: (headers: string[], row: any[], quantity: number) => void;
  maxRows?: number;
}

/**
 * PriceBaseTable
 * - Renders the base.headers and base.rows exactly as saved (same order).
 * - Adds a per-row quantity control and an "Adicionar" action that calls onAddRow(headers, row, qty).
 * - Does not attempt to normalize or drop columns; it preserves header names (so visual output matches preview).
 */
export default function PriceBaseTable({ base, onAddRow, maxRows = 1000 }: PriceBaseTableProps) {
  const [quantities, setQuantities] = useState<Record<number, number>>({});

  const visibleRows = base.rows.slice(0, maxRows);

  const handleQtyChange = (idx: number, raw: string) => {
    const n = parseInt(raw || "1", 10);
    setQuantities((prev) => ({ ...prev, [idx]: Math.max(1, Math.min(999, Number.isNaN(n) ? 1 : n)) }));
  };

  const getQty = (idx: number) => {
    return quantities[idx] ?? 1;
  };

  // Helper to render a cell value nicely (numbers preserved)
  const renderCell = (v: any) => {
    if (v === undefined || v === null) return "";
    // If numeric-like, try to format as number; otherwise show string
    const str = String(v);
    // detect simple numeric patterns (with comma or dot)
    if (/^[\d\.,\s]+$/.test(str.trim())) {
      const n = parseSpreadsheetNumber(str);
      if (n !== 0) {
        // keep raw format if it's an integer-ish small number; otherwise format currency if large
        return String(str);
      }
    }
    return str;
  };

  return (
    <div className="border rounded-md overflow-x-auto">
      <div className="mb-2 px-2 py-2 flex items-center justify-between">
        <div>
          <div className="font-medium">{base.name}</div>
          <div className="text-sm text-muted-foreground">{base.rows.length} linhas · criado em {new Date(base.createdAt).toLocaleDateString()}</div>
        </div>
        <div className="text-sm text-muted-foreground">Visualização fiel — colunas preservadas</div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50">
            {base.headers.map((h, i) => (
              <th key={i} className="text-left px-2 py-2 align-top">{h || "(vazio)"}</th>
            ))}
            <th className="text-left px-2 py-2">Quantidade</th>
            <th className="text-left px-2 py-2">Ações</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.length === 0 ? (
            <tr>
              <td colSpan={base.headers.length + 2} className="py-8 text-center text-muted-foreground">
                Esta base não contém linhas.
              </td>
            </tr>
          ) : (
            visibleRows.map((row, ri) => (
              <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                {base.headers.map((_, ci) => (
                  <td key={ci} className="px-2 py-2 align-top break-words">
                    {renderCell(row[ci])}
                  </td>
                ))}

                <td className="px-2 py-2">
                  <Input
                    type="number"
                    min={1}
                    value={getQty(ri)}
                    onChange={(e) => handleQtyChange(ri, e.target.value)}
                    className="w-24"
                  />
                </td>

                <td className="px-2 py-2">
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => onAddRow(base.headers, row, getQty(ri))}>
                      Adicionar
                    </Button>

                    <Button size="sm" variant="outline" onClick={() => {
                      // quick export of this row as JSON
                      try {
                        const payload = base.headers.reduce((acc: any, h, idx) => {
                          acc[h] = row[idx];
                          return acc;
                        }, {});
                        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${base.name.replace(/\s+/g, "-") || base.id}-row-${ri}.json`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      } catch (err) {
                        console.error("export row failed", err);
                      }
                    }}>
                      Exportar
                    </Button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}