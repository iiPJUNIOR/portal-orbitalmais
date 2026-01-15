"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Search } from "lucide-react";
import { ProductFilters } from "@/types/product";

interface ProductFilterProps {
  onFilterChange: (filters: ProductFilters) => void;
}

const DEBOUNCE_MS = 300;

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr.filter(Boolean)));
}

export function ProductFilter({ onFilterChange }: ProductFilterProps) {
  const [categories, setCategories] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [tipos, setTipos] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [hasImported, setHasImported] = useState<boolean>(false);
  
  const [filters, setFilters] = useState<ProductFilters>({
    category: undefined,
    tipo: undefined,
    model: undefined,
    color: undefined,
    biometrics: undefined,
    facial: undefined,
    proximity: undefined,
    urn: undefined,
    qr: undefined,
    minPrice: undefined,
    maxPrice: undefined,
    search: ""
  });
  
  const debounceRef = useRef<number | null>(null);
  const mountedRef = useRef(false); // avoid triggering filter on initial mount

  // Load option lists only from importedProducts in localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("importedProducts");
      if (raw) {
        const rows = JSON.parse(raw) as any[];
        if (Array.isArray(rows) && rows.length > 0) {
          setHasImported(true);
          const products = rows;
          const c = uniq(products.map((p) => (p.category ? String(p.category) : "")).filter(Boolean));
          const m = uniq(products.map((p) => (p.model ? String(p.model) : "")).filter(Boolean));
          // tipo: derive from model and part_number if available
          const tset: string[] = [];
          products.forEach((p) => {
            if (p.model) tset.push(String(p.model));
            if (p.part_number) tset.push(String(p.part_number));
          });
          const types = uniq(tset);
          const cols = uniq(products.flatMap((p) => (Array.isArray(p.colors) ? p.colors : (p.colors ? String(p.colors).split(",") : []) ) ).map((c: any) => String(c).trim()).filter(Boolean));
          setCategories(c);
          setModels(m);
          setTipos(types);
          setColors(cols);
          return;
        }
      }
    } catch (err) {
      console.warn("Failed to parse importedProducts for filter lists", err);
    }

    // No imported products available
    setHasImported(false);
    setCategories([]);
    setModels([]);
    setTipos([]);
    setColors([]);
  }, []);

  // Debounced filter application: wait DEBOUNCE_MS after the last change
  useEffect(() => {
    // Skip applying filters on initial mount to avoid duplicate loads
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }

    // clear previous
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(() => {
      onFilterChange({
        // ensure we pass primitive values (avoid unexpected references)
        category: filters.category,
        tipo: filters.tipo,
        model: filters.model,
        color: filters.color,
        biometrics: filters.biometrics,
        facial: filters.facial,
        proximity: filters.proximity,
        urn: filters.urn,
        qr: filters.qr,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        search: (filters.search || "").trim()
      });
      debounceRef.current = null;
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [filters, onFilterChange]);

  // Helper to update filters state
  const handleInputChange = (field: keyof ProductFilters, value: string | boolean | undefined) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const resetFilters = () => {
    const reset: ProductFilters = {
      category: undefined,
      tipo: undefined,
      model: undefined,
      color: undefined,
      biometrics: undefined,
      facial: undefined,
      proximity: undefined,
      urn: undefined,
      qr: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      search: ""
    };
    setFilters(reset);

    // Apply immediately (don't wait for debounce)
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    onFilterChange(reset);
  };

  return (
    <div className="space-y-6">
      {!hasImported && (
        <div className="p-3 bg-yellow-50 border rounded text-yellow-900">
          Nenhuma planilha importada detectada. Importe a planilha em <strong>Configurações</strong> para habilitar busca e filtros.
          <div className="mt-2">
            <Button onClick={() => { window.location.href = "/settings"; }}>
              Ir para Configurações
            </Button>
          </div>
        </div>
      )}

      {/* Single responsive row: Search (wider) + Category + Tipo + Model + Cor/Material */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="search">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="search"
              placeholder={hasImported ? "Descrição, part number..." : "Importe a planilha para buscar"}
              className="pl-8"
              value={filters.search || ""}
              onChange={(e) => handleInputChange("search", e.target.value)}
              disabled={!hasImported}
            />
          </div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="category">Categoria</Label>
          <Select 
            value={filters.category ?? "ALL"} 
            onValueChange={(value) => handleInputChange("category", value === "ALL" ? undefined : value)}
          >
            <SelectTrigger id="category" disabled={!hasImported}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas</SelectItem>
              {categories.map(category => (
                <SelectItem key={category} value={category}>{category}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tipo">Tipo</Label>
          <Select 
            value={filters.tipo ?? "ALL"} 
            onValueChange={(value) => handleInputChange("tipo", value === "ALL" ? undefined : value)}
          >
            <SelectTrigger id="tipo" disabled={!hasImported}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              {tipos.map(t => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="model">Modelo</Label>
          <Select 
            value={filters.model ?? "ALL"} 
            onValueChange={(value) => handleInputChange("model", value === "ALL" ? undefined : value)}
          >
            <SelectTrigger id="model" disabled={!hasImported}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              {models.map(model => (
                <SelectItem key={model} value={model}>{model}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="color">Cor / Material</Label>
          <Select
            value={filters.color ?? "ALL"}
            onValueChange={(value) => handleInputChange("color", value === "ALL" ? undefined : value)}
          >
            <SelectTrigger id="color" disabled={!hasImported}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas</SelectItem>
              {colors.map(col => <SelectItem key={col} value={col}>{col}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Secondary row: Facial + Proximidade + checkboxes (Biometria, Urna, QR) */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
        <div className="space-y-2 md:col-span-1">
          <Label htmlFor="facial">Facial</Label>
          <Select 
            value={filters.facial ?? "ALL"} 
            onValueChange={(value) => handleInputChange("facial", value === "ALL" ? undefined : value)}
          >
            <SelectTrigger id="facial" disabled={!hasImported}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas</SelectItem>
              <SelectItem value="1">1</SelectItem>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="Lite">Lite</SelectItem>
              <SelectItem value="Max">Max</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 md:col-span-1">
          <Label htmlFor="proximity">Proximidade</Label>
          <Select 
            value={filters.proximity ?? "ALL"} 
            onValueChange={(value) => handleInputChange("proximity", value === "ALL" ? undefined : value)}
          >
            <SelectTrigger id="proximity" disabled={!hasImported}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas</SelectItem>
              <SelectItem value="ASK">ASK</SelectItem>
              <SelectItem value="Mifare">Mifare</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center space-x-2 md:col-span-4">
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="biometrics" 
              checked={filters.biometrics === true}
              onCheckedChange={(checked) => 
                handleInputChange("biometrics", checked ? true : undefined)
              }
              disabled={!hasImported}
            />
            <Label htmlFor="biometrics">Biometria</Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="urn" 
              checked={filters.urn === true}
              onCheckedChange={(checked) => 
                handleInputChange("urn", checked ? true : undefined)
              }
              disabled={!hasImported}
            />
            <Label htmlFor="urn">Urna</Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="qr" 
              checked={filters.qr === true}
              onCheckedChange={(checked) => 
                handleInputChange("qr", checked ? true : undefined)
              }
              disabled={!hasImported}
            />
            <Label htmlFor="qr">QR Code</Label>
          </div>
        </div>
      </div>
      
      <div className="flex justify-end">
        <Button variant="outline" onClick={resetFilters} disabled={!hasImported}>
          Limpar Filtros
        </Button>
      </div>
    </div>
  );
}