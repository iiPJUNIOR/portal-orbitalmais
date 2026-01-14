"use client";

import React, { useState, useEffect } from 'react';
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
import { Slider } from "@/components/ui/slider";
import { Search } from "lucide-react";
import { ProductFilters } from "@/types/product";
import { getCategories, getModels } from "@/services/productService";

interface ProductFilterProps {
  onFilterChange: (filters: ProductFilters) => void;
}

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
  
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 5000]);

  useEffect(() => {
    const loadFilters = async () => {
      const categories = getCategories();
      const models = getModels();
      setCategories(categories);
      setModels(models);
    };
    
    loadFilters();
  }, []);

  useEffect(() => {
    onFilterChange(filters);
  }, [filters, onFilterChange]);

  const handleInputChange = (field: keyof ProductFilters, value: string | boolean | undefined) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handlePriceChange = (values: number[]) => {
    setPriceRange([values[0], values[1]]);
    setFilters(prev => ({ 
      ...prev, 
      minPrice: values[0], 
      maxPrice: values[1] 
    }));
  };

  const resetFilters = () => {
    setFilters({
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
    setPriceRange([0, 5000]);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-2">
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
          <Label>Preço (R$)</Label>
          <div className="pt-1">
            <Slider
              min={0}
              max={5000}
              step={50}
              value={priceRange}
              onValueChange={handlePriceChange}
              className="w-full"
            />
            <div className="flex justify-between text-sm text-muted-foreground mt-1">
              <span>R$ {priceRange[0]}</span>
              <span>R$ {priceRange[1]}</span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
      
      <div className="flex justify-end">
        <Button variant="outline" onClick={resetFilters}>
          Limpar Filtros
        </Button>
      </div>
    </div>
  );
}