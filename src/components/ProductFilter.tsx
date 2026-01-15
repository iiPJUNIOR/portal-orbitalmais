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
import { getCategories, getModels } from "@/services/productService";

interface ProductFilterProps {
  onFilterChange: (filters: ProductFilters) => void;
}

const DEBOUNCE_MS = 300;

export function ProductFilter({ onFilterChange }: ProductFilterProps) {
  const [categories, setCategories] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  
  const [filters, setFilters] = useState<ProductFilters>({
    category: undefined,
    model: undefined,
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

  useEffect(() => {
    const loadFilters = async () => {
      const categories = getCategories();
      const models = getModels();
      setCategories(categories);
      setModels(models);
    };
    
    loadFilters();
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
        model: filters.model,
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
    const reset = {
      category: undefined,
      model: undefined,
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
      {/* Single responsive row: Search (wider) + Category + Model + Facial + Proximity */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="search">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="search"
              placeholder="Descrição, part number..."
              className="pl-8"
              value={filters.search || ""}
              onChange={(e) => handleInputChange("search", e.target.value)}
            />
          </div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="category">Categoria</Label>
          <Select 
            value={filters.category ?? "ALL"} 
            onValueChange={(value) => handleInputChange("category", value === "ALL" ? undefined : value)}
          >
            <SelectTrigger id="category">
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
          <Label htmlFor="model">Modelo</Label>
          <Select 
            value={filters.model ?? "ALL"} 
            onValueChange={(value) => handleInputChange("model", value === "ALL" ? undefined : value)}
          >
            <SelectTrigger id="model">
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
          <Label htmlFor="facial">Facial</Label>
          <Select 
            value={filters.facial ?? "ALL"} 
            onValueChange={(value) => handleInputChange("facial", value === "ALL" ? undefined : value)}
          >
            <SelectTrigger id="facial">
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

        <div className="space-y-2">
          <Label htmlFor="proximity">Proximidade</Label>
          <Select 
            value={filters.proximity ?? "ALL"} 
            onValueChange={(value) => handleInputChange("proximity", value === "ALL" ? undefined : value)}
          >
            <SelectTrigger id="proximity">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas</SelectItem>
              <SelectItem value="ASK">ASK</SelectItem>
              <SelectItem value="Mifare">Mifare</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Secondary row: checkboxes (Biometria, Urna, QR) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="biometrics" 
            checked={filters.biometrics === true}
            onCheckedChange={(checked) => 
              handleInputChange("biometrics", checked ? true : undefined)
            }
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
          />
          <Label htmlFor="qr">QR Code</Label>
        </div>
      </div>
      
      <div className="flex justify-end">
        <Button variant="outline" onClick={resetFilters}>
          Limpar Filtros
        </Button>
      </div>
    </div>
  );
}