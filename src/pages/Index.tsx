"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { ProductFilter } from "@/components/ProductFilter";
import { ProductTable } from "@/components/ProductTable";
import { QuoteBuilder } from "@/components/QuoteBuilder";
import { ProposalForm } from "@/components/ProposalForm";
import { ProposalSummary } from "@/components/ProposalSummary";
import { QuoteHistory } from "@/components/QuoteHistory";
import { fetchProducts } from "@/services/productService";
import { generateProposalPPTX, generateProposalNumber } from "@/services/proposalService";
import { Product } from "@/types/product";
import { ProductFilters } from "@/types/product";
import { Quote } from "@/types/quote";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface QuoteItem {
  id: string;
  product: Product;
  quantity: number;
  priceModel: '12m' | '24m';
}

interface ProposalFormData {
  cnpj: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  proposalDate: string;
  observations: string;
  priceModel: '12m' | '24m';
}

function normalizeImportedRow(row: any, idx: number): Product {
  // Attempt to map common headers; fall back to reasonable defaults
  const id = row.id || row.ID || row.sku || row.SKU || `imported-${idx}-${Date.now()}`;
  const sku = row.sku || row.SKU || row.part_number || row["Part Number"] || id;
  const description = row.description || row.Description || row.Descrição || row["Product"] || sku;
  const model = row.model || row.Modelo || row.Model || "Importado";
  const category = row.category || row.Categoria || "Controladores Porta";
  const colorsRaw = row.colors || row.Colors || row.Cor || "";
  const colors = typeof colorsRaw === "string" ? colorsRaw.split(",").map((c: string) => c.trim()).filter(Boolean) : Array.isArray(colorsRaw) ? colorsRaw : [];
  const biometrics = (String(row.biometrics || row.Biometria || row.biometric) || "").toLowerCase() === "true";
  const facial = (row.facial || row.Facial || "None").toString();
  const proximity = (row.proximity || row.Proximity || "None").toString();
  const urn = (String(row.urn || row.Urna || row.urna) || "").toLowerCase() === "true";
  const qr = (String(row.qr || row.QR || row.qrcode) || "").toLowerCase() === "true";
  const value_12m = parseFloat(row.value_12m || row["value_12m"] || row["Valor12m"] || row["12m"] || 0) || 0;
  const value_24m = parseFloat(row.value_24m || row["value_24m"] || row["Valor24m"] || row["24m"] || 0) || 0;
  const part_number = row.part_number || row["Part Number"] || sku;
  const status = (row.status || row.Status || "Ativo").toString() as 'Ativo' | 'Inativo';

  return {
    id: String(id),
    sku: String(sku),
    category: category as Product["category"],
    model: String(model),
    colors,
    biometrics,
    facial: (facial === "None" || facial === "none" || facial === "") ? "None" : (facial as any),
    proximity: (proximity === "None" || proximity === "none" || proximity === "") ? "None" : (proximity as any),
    urn,
    qr,
    description: String(description),
    value_12m,
    value_24m,
    part_number: String(part_number),
    status,
  };
}

export default function Index() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [showProposalSummary, setShowProposalSummary] = useState(false);
  const [showQuoteHistory, setShowQuoteHistory] = useState(false);
  const [proposalData, setProposalData] = useState<ProposalFormData | null>(null);
  const navigate = useNavigate();
  
  // Memoize loadProducts so its reference doesn't change across renders.
  const loadProducts = useCallback(async (filters: ProductFilters = {}) => {
    setLoading(true);
    try {
      // If there's an importedProducts list in localStorage, use it as the catalog
      const raw = localStorage.getItem("importedProducts");
      if (raw) {
        try {
          const rows = JSON.parse(raw) as any[];
          const imported = rows.map((r, idx) => normalizeImportedRow(r, idx));
          setProducts(imported.filter(p => p.status === "Ativo"));
          return;
        } catch (err) {
          console.warn("Failed to parse importedProducts from localStorage:", err);
          // fallback to fetchProducts
        }
      }

      const data = await fetchProducts(filters);
      setProducts(data);
    } catch (error) {
      toast.error("Erro ao carregar produtos");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleAddToQuote = (product: Product, quantity: number) => {
    // Check if product is already in quote
    const existingItem = quoteItems.find(item => item.product.id === product.id);
    
    if (existingItem) {
      // Update quantity if already exists
      setQuoteItems(prev => prev.map(item => 
        item.product.id === product.id 
          ? { ...item, quantity: item.quantity + quantity } 
          : item
      ));
      toast.success(`Quantidade atualizada para ${product.description}`);
    } else {
      // Add new item
      const newItem: QuoteItem = {
        id: `${product.id}-${Date.now()}`,
        product,
        quantity,
        priceModel: '12m'
      };
      setQuoteItems(prev => [...prev, newItem]);
      toast.success(`${product.description} adicionado ao orçamento`);
    }
  };

  const handleRemoveItem = (id: string) => {
    setQuoteItems(prev => prev.filter(item => item.id !== id));
  };

  const handleUpdateQuantity = (id: string, quantity: number) => {
    setQuoteItems(prev => 
      prev.map(item => 
        item.id === id ? { ...item, quantity: Math.max(1, quantity) } : item
      )
    );
  };

  const handleUpdatePriceModel = (id: string, model: '12m' | '24m') => {
    setQuoteItems(prev => 
      prev.map(item => 
        item.id === id ? { ...item, priceModel: model } : item
      )
    );
  };

  const handleGenerateProposal = () => {
    setShowProposalForm(true);
  };

  const handleProposalSubmit = (data: ProposalFormData) => {
    setProposalData(data);
    setShowProposalForm(false);
    setShowProposalSummary(true);
  };

  const handleConfirmProposal = async () => {
    if (!proposalData) return;
    
    setShowProposalSummary(false);
    
    try {
      // Generate proposal number
      const proposalNumber = generateProposalNumber();
      
      // Prepare data for proposal generation
      const proposalDataWithItems = {
        ...proposalData,
        items: quoteItems,
        proposalNumber
      };
      
      // Generate the proposal file
      const blob = await generateProposalPPTX(proposalDataWithItems);
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `proposta-${proposalNumber}.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      // Reset quote after successful generation
      setQuoteItems([]);
      
      toast.success("Proposta gerada com sucesso! Download iniciado.");
    } catch (error) {
      toast.error("Erro ao gerar proposta");
      console.error(error);
    }
  };

  const handleCancelProposal = () => {
    setShowProposalForm(false);
  };

  const handleBackToForm = () => {
    setShowProposalSummary(false);
    setShowProposalForm(true);
  };

  const handleViewQuoteHistory = () => {
    setShowQuoteHistory(true);
  };

  const handleBackToQuoteBuilder = () => {
    setShowQuoteHistory(false);
  };

  const handleQuoteSelect = (quote: Quote) => {
    // In a real implementation, this would load the quote details
    toast.info("Funcionalidade de carregar orçamento será implementada");
    console.log("Selected quote:", quote);
  };

  if (showProposalForm) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Gerar Proposta</h1>
            <p className="text-gray-600">Preencha os dados da empresa para gerar a proposta</p>
          </div>
          
          <ProposalForm 
            onSubmit={handleProposalSubmit} 
            onCancel={handleCancelProposal} 
          />
        </div>
        <MadeWithDyad />
      </div>
    );
  }

  if (showProposalSummary && proposalData) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Resumo da Proposta</h1>
            <p className="text-gray-600">Verifique as informações antes de gerar a proposta</p>
          </div>
          
          <ProposalSummary 
            items={quoteItems}
            proposalData={proposalData}
            onConfirm={handleConfirmProposal}
            onBack={handleBackToForm}
          />
        </div>
        <MadeWithDyad />
      </div>
    );
  }

  if (showQuoteHistory) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Histórico de Orçamentos</h1>
            <p className="text-gray-600">Consulte orçamentos anteriores</p>
          </div>
          
          <div className="mb-6">
            <Button variant="outline" onClick={handleBackToQuoteBuilder}>
              Voltar ao Orçamento
            </Button>
          </div>
          
          <QuoteHistory onQuoteSelect={handleQuoteSelect} />
        </div>
        <MadeWithDyad />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Plataforma de Cotação Control iD</h1>
              <p className="text-gray-600">Selecione produtos e gere propostas personalizadas</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate("/settings")}>
                Configurações
              </Button>
              <Button variant="outline" onClick={handleViewQuoteHistory}>
                Ver Histórico de Orçamentos
              </Button>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h2 className="text-xl font-semibold mb-4">Catálogo de Produtos</h2>
              <ProductFilter onFilterChange={loadProducts} />
              
              <div className="mt-6">
                {loading ? (
                  <div className="p-8 text-center">
                    <div className="animate-pulse">Carregando produtos...</div>
                  </div>
                ) : (
                  <ProductTable 
                    products={products} 
                    onAddToQuote={handleAddToQuote} 
                  />
                )}
              </div>
            </div>
          </div>
          
          <div>
            <div className="sticky top-8">
              <QuoteBuilder 
                items={quoteItems}
                onRemoveItem={handleRemoveItem}
                onUpdateQuantity={handleUpdateQuantity}
                onUpdatePriceModel={handleUpdatePriceModel}
                onGenerateProposal={handleGenerateProposal}
              />
            </div>
          </div>
        </div>
      </div>
      <MadeWithDyad />
    </div>
  );
}