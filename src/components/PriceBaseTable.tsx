"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseSpreadsheetNumber } from "@/lib/formatters";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableHeader } from "./SortableHeader";
import { toast } from "sonner";

type StoredBase = {
  id: string;
  name: string;
  type: "catalog" | "product";
  headers: string[];
  rows: any[][];
  createdAt: string;
  key_column?: string | null;
  com_ids_column?: string | null;
  sem_ids_column?: string | null;
};

interface PriceBaseTableProps {
  base: StoredBase;
  // called when user clicks "Adicionar" for a row
  onAddRow: (headers: string[], row: any[], quantity: number) => void;
  maxRows?: number;
}

const COLUMN_ORDER_STORAGE_KEY = "price_base_column_order_";

export default function PriceBaseTable({ base, onAddRow, maxRows = 1000 }: PriceBaseTableProps) {
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [columnOrder, setColumnOrder] = useState<string[]>(base.headers);

  // Load column order from localStorage on mount
  useEffect(() => {
    const storedOrder = localStorage.getItem(COLUMN_ORDER_STORAGE_KEY + base.id);
    if (storedOrder) {
      try {
        const parsedOrder = JSON.parse(storedOrder) as string[];
        // Ensure all current headers are present, maintaining stored order for existing ones
        const newOrder = parsedOrder.filter(h => base.headers.includes(h));
        const missingHeaders = base.headers.filter(h => !parsedOrder.includes(h));
        setColumnOrder([...newOrder, ...missingHeaders]);
        return;
      } catch (e) {
        console.warn("Failed to parse stored column order", e);
      }
    }
    setColumnOrder(base.headers);
  }, [base.id, base.headers]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setColumnOrder((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over?.id as string);

        const newOrder = arrayMove(items, oldIndex, newIndex);
        
        // Persist new order
        try {
          localStorage.setItem(COLUMN_ORDER_STORAGE_KEY + base.id, JSON.stringify(newOrder));
          toast.success("Ordem das colunas salva.");
        } catch (e) {
          console.error("Failed to save column order", e);
          toast.error("Falha ao salvar ordem das colunas.");
        }
        
        return newOrder;
      });
    }
  };

  const visibleRows = base.rows.slice(0, maxRows);

  // Map header name to its original index in base.headers
  const headerIndexMap = useMemo(() => {
    return base.headers.reduce((acc, header, index) => {
      acc[header] = index;
      return acc;
    }, {} as Record<string, number>);
  }, [base.headers]);

  const getQty = (idx: number) => {
    return quantities[idx] ?? 1;
  };

  const handleQtyChange = (idx: number, raw: string) => {
    const n = parseInt(raw || "1", 10);
    setQuantities((prev) => ({ ...prev, [idx]: Math.max(1, Math.min(999, Number.isNaN(n) ? 1 : n)) }));
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
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                {columnOrder.map((headerName) => (
                  <SortableHeader key={headerName} id={headerName}>
                    {headerName || "(vazio)"}
                  </SortableHeader>
                ))}
              </SortableContext>
              <th className="text-left px-2 py-2">Quantidade</th>
              <th className="text-left px-2 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={columnOrder.length + 2} className="py-8 text-center text-muted-foreground">
                  Esta base não contém linhas.
                </td>
              </tr>
            ) : (
              visibleRows.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  {columnOrder.map((headerName, ci) => {
                    const originalIndex = headerIndexMap[headerName];
                    return (
                      <td key={ci} className="px-2 py-2 align-top break-words">
                        {renderCell(row[originalIndex])}
                      </td>
                    );
                  })}

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
      </DndContext>
    </div>
  );
}