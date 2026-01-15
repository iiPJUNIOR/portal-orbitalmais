"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ProductFilter } from "@/components/ProductFilter";
import { ProductTable } from "@/components/ProductTable";
import { QuoteBuilder } from "@/components/QuoteBuilder";
import { ProposalForm } from "@/components/ProposalForm";
import { ProposalSummary } from "@/components/ProposalSummary";
import { QuoteHistory } from "@/components/QuoteHistory";
import { generateProposalPPTX, generateProposalNumber } from "@/services/proposalService";
import { Product } from "@/types/product";
import { toast } from "sonner";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { saveQuote } from "@/services/supabaseService";
import { formatModelLabel } from "@/lib/formatters";
import { parseSpreadsheetNumber } from "@/lib/formatters";

type QuoteItem = {
  id: string;
  product: Product;
  quantity: number;
  priceModel: "12m" | "24m";
};

type ProposalFormData = {
  cnpj: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  proposalDate: string;
  observations: string;
  priceModel: "12m" | "24m";
};

function normalizeImportedRow(row: any, idx: number): Product {
  const id = row.id || row.ID || row.sku || row.SKU || `imported-${idx}-${Date.now()}`;
  const sku = row.sku || row.SKU || row.part_number || row["Part Number"] || id;
  const description = row.description || row.Description || row.Descrição || row["Product"] || sku;
  const modelRaw = row.model || row.Modelo || row.Model || "Importado";
  const model = formatModelLabel(String(modelRaw));
  const category = (row.category || row.Categoria || "Controladores Porta") as Product["category"];
  const colorsRaw = row.colors || row.Colors || row.Cor || "";
  const colors = typeof colorsRaw === "string"
    ? colorsRaw.split(",").map((c: string) => c.trim()).filter(Boolean)
    : Array.isArray(colorsRaw) ? colorsRaw : [];
  const biometrics = String(row.biometrics || row.Biometria || row.biometric || "").toLowerCase() === "true";
  const facialRaw = row.facial || row.Facial || "None";
  const facial = (facialRaw === "None" || facialRaw === "none" || facialRaw === "") ? "None" : String(facialRaw);
  const proximityRaw = row.proximity || row.Proximity || "None";
  const proximity = (proximityRaw === "None" || proximityRaw === "none" || proximityRaw === "") ? "None" : String(proximityRaw);
  const urn = String(row.urn || row.Urna || row.urna || "").toLowerCase() === "true";
  const qr = String(row.qr || row.QR || row.qrcode || "").toLowerCase() === "true";

  const parseNumber = (v: any) => {
    // Use the shared parser which handles both "1.368,81" and "1368,81" etc.
    return parseSpreadsheetNumber(v);
  };

  const value_12m = parseNumber(row.value_12m || row["value_12m"] || row["Valor12m"] || row["12m"]);
  const value_24m = parseNumber(row.value_24m || row["value_24m"] || row["Valor24m"] || row["24m"]);
  const part_number = row.part_number || row["Part Number"] || sku;
  const status = (row.status || row.Status || "Ativo") as "Ativo" | "Inativo";

  return {
    id: String(id),
    sku: String(sku),
    category,
    model,
    colors,
    biometrics,
    facial: facial as any,
    proximity: proximity as any,
    urn,
    qr,
    description: String(description),
    value_12m,
    value_24m,
    part_number: String(part_number),
    status,
  };
}

function applyFiltersToProducts(products: Product[], filters: Partial<Record<string, any>> = {}) {
  return products.filter((product) => {
    // Category filter
    if (filters.category && product.category !== filters.category) {
      return false;
    }

    // Tipo filter (matches model or part_number loosely)
    if (filters.tipo) {
      const t = String(filters.tipo).toLowerCase();
      if (!(product.model.toLowerCase().includes(t) || product.part_number.toLowerCase().includes(t))) {
        return false;
      }
    }

    // Model filter
    if (filters.model && product.model !== filters.model) {
      return false;
    }

    // Color filter (match any color)
    if (filters.color) {
      const c = String(filters.color).toLowerCase();
      if (!product.colors.some((col) => col.toLowerCase() === c)) {
        return false;
      }
    }

    // Biometrics filter
    if (filters.biometrics !== undefined && product.biometrics !== filters.biometrics) {
      return false;
    }

    // Facial filter
    if (filters.facial && filters.facial !== "None" && product.facial !== filters.facial) {
      return false;
    }

    // Proximity filter
    if (filters.proximity && filters.proximity !== "None" && product.proximity !== filters.proximity) {
      return false;
    }

    // Urn filter
    if (filters.urn !== undefined && product.urn !== filters.urn) {
      return false;
    }

    // QR filter
    if (filters.qr !== undefined && product.qr !== filters.qr) {
      return false;
    }

    // Price range filter
    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      const minPriceFilter = filters.minPrice ?? Number.NEGATIVE_INFINITY;
      const maxPriceFilter = filters.maxPrice ?? Number.POSITIVE_INFINITY;

      const lowestPrice = Math.min(product.value_12m, product.value_24m);
      const highestPrice = Math.max(product.value_12m, product.value_24m);

      if (highestPrice < minPriceFilter) {
        return false;
      }
      if (lowestPrice > maxPriceFilter) {
        return false;
      }
    }

    // Search filter
    if (filters.search) {
      const searchLower = String(filters.search).toLowerCase();
      if (
        !product.description.toLowerCase().includes(searchLower) &&
        !product.part_number.toLowerCase().includes(searchLower) &&
        !product.sku.toLowerCase().includes(searchLower)
      ) {
        return false;
      }
    }

    return product.status === "Ativo";
  });
}

export default function Index() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [step, setStep] = useState<"catalog" | "review" | "form" | "summary" | "history">("catalog");
  const [proposalData, setProposalData] = useState<ProposalFormData | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  const debounceRef = useRef<number | null>(null);

  const getImportedProducts = (): Product[] => {
    try {
      const raw = localStorage.getItem("importedProducts");
      if (!raw) return [];
      const rows = JSON.parse(raw) as any[];
      if (!Array.isArray(rows) || rows.length === 0) return [];
      return rows.map((r, idx) => normalizeImportedRow(r, idx));
    } catch (err) {
      console.warn("Failed to parse importedProducts", err);
      return [];
    }
  };

  const loadProducts = useCallback(async (filters?: Partial<Record<string, any>>) => {
    setLoading(true);
    try {
      // Use only importedProducts (no mock fallback)
      const imported = getImportedProducts();

      if (imported.length === 0) {
        setProducts([]);
        toast.error("Nenhuma planilha importada — importe sua planilha em Configurações");
        setLoading(false);
        return;
      }

      // If there are filters, apply them (full set)
      if (filters && Object.keys(filters).length > 0) {
        const filtered = applyFiltersToProducts(imported, filters);
        setProducts(filtered);
      } else {
        setProducts(imported.filter((p) => p.status === "Ativo"));
      }
    } catch (err) {
      console.error("Erro ao carregar produtos:", err);
      toast.error("Erro ao carregar produtos");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Do NOT auto-load products on mount — keep them hidden until user types in 'Buscar' or triggers reload.
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, []);

  const debouncedLoad = (filters?: any, delay = 250) => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    // If there's no search text and there are no other filters, hide products immediately
    const search = (filters?.search ?? "").toString().trim();
    const otherFiltersExist = Object.keys(filters || {}).some((k) => k !== "search" && filters[k] !== undefined && filters[k] !== "");
    if (!search && !otherFiltersExist) {
      setProducts([]);
      setLoading(false);
      return;
    }

    // Ensure an imported sheet exists
    const imported = getImportedProducts();
    if (imported.length === 0) {
      setProducts([]);
      setLoading(false);
      toast.error("Nenhuma planilha importada — importe a planilha em Configurações");
      return;
    }

    debounceRef.current = window.setTimeout(() => {
      loadProducts(filters);
      debounceRef.current = null;
    }, delay);
  };

  const reloadFromImported = () => {
    const imported = getImportedProducts();
    if (imported.length === 0) {
      toast.error("Nenhuma planilha importada — vá em Configurações para importar.");
      setProducts([]);
      return;
    }
    loadProducts();
    toast.success("Catálogo recarregado a partir da planilha (importedProducts)");
  };

  const handleAddToQuote = (product: Product, quantity: number) => {
    const existing = quoteItems.find((it) => it.product.id === product.id);
    if (existing) {
      setQuoteItems((prev) =>
        prev.map((it) =>
          it.product.id === product.id ? { ...it, quantity: it.quantity + quantity } : it
        )
      );
    } else {
      setQuoteItems((prev) => [
        ...prev,
        { id: `${product.id}-${Date.now()}`, product, quantity, priceModel: "12m" },
      ]);
    }
    toast.success(`${product.description} adicionado ao orçamento`);
  };

  const handleRemoveItem = (id: string) => {
    setQuoteItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleUpdateQuantity = (id: string, quantity: number) => {
    setQuoteItems((prev) => prev.map((it) => (it.id === id ? { ...it, quantity: Math.max(1, quantity) } : it)));
  };

  const handleUpdatePriceModel = (id: string, model: "12m" | "24m") => {
    setQuoteItems((prev) => prev.map((it) => (it.id === id ? { ...it, priceModel: model } : it)));
  };

  const openProposalForm = () => {
    if (quoteItems.length === 0) {
      toast.error("Adicione ao menos 1 item ao orçamento antes de gerar a proposta");
      return;
    }
    setStep("form");
  };

  const onProposalSubmit = (data: ProposalFormData) => {
    setProposalData(data);
    setStep("summary");
  };

  const onSummaryBack = () => {
    setStep("form");
  };

  const computeTotalPrice = () => {
    return quoteItems.reduce((sum, item) => {
      const unit = item.priceModel === "12m" ? item.product.value_12m : item.product.value_24m;
      return sum + unit * item.quantity;
    }, 0);
  };

  const onConfirmAndGenerate = async () => {
    if (!proposalData) return;
    setSaving(true);
    const proposalNumber = generateProposalNumber();

    try {
      // prepare payload for PPTX generator (service expects items in a certain shape)
      const proposalPayload = {
        ...proposalData,
        items: quoteItems,
        proposalNumber,
      } as any;

      // generate the PPTX blob
      const blob = await generateProposalPPTX(proposalPayload);

      // Prepare quote object and items for saving
      const totalPrice = computeTotalPrice();
      const quotePayload: any = {
        cnpj: proposalData.cnpj,
        companyName: proposalData.companyName,
        contactName: proposalData.contactName,
        email: proposalData.email,
        phone: proposalData.phone,
        address: proposalData.address,
        proposalDate: proposalData.proposalDate,
        proposalNumber,
        priceModel: proposalData.priceModel,
        totalPrice,
        status: "rascunho",
        observations: proposalData.observations || "",
      };

      const itemsToSave = quoteItems.map((it) => {
        const unit = it.priceModel === "12m" ? it.product.value_12m : it.product.value_24m;
        return {
          sku: it.product.sku,
          productDescription: it.product.description,
          quantity: it.quantity,
          unitPrice: unit,
          priceModel: it.priceModel,
          subtotal: unit * it.quantity,
        };
      });

      // Show saving toast
      const savingToastId = toast.loading("Salvando proposta...");

      try {
        // Call saveQuote which uploads PPTX and inserts DB records (or falls back)
        const savedQuoteId = await saveQuote(quotePayload, itemsToSave, blob, `proposta-${proposalNumber}.pptx`);
        toast.dismiss(savingToastId);
        toast.success("Proposta salva com sucesso (ID: " + savedQuoteId + ")");

        // Trigger download after successful save
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `proposta-${proposalNumber}.pptx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // reset state
        setQuoteItems([]);
        setProposalData(null);
        setStep("catalog");
      } catch (err: any) {
        toast.dismiss(savingToastId);
        console.error("Erro ao salvar proposta:", err);
        // Even if save failed, still offer the download of the generated file to the user
        try {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `proposta-${proposalNumber}.pptx`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          toast.error("Falha ao salvar no Supabase, mas o arquivo foi gerado para download localmente.");
        } catch (downloadErr) {
          console.error("Erro ao iniciar download:", downloadErr);
          toast.error("Falha ao salvar e ao gerar download.");
        }
      }
    } catch (err) {
      console.error("Erro ao gerar proposta:", err);
      toast.error("Erro ao gerar proposta");
    } finally {
      setSaving(false);
    }
  };

  const openHistory = () => {
    setStep("history");
  };

  const backToCatalog = () => {
    setStep("catalog");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8">
        <header className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Plataforma de Cotação Control iD</h1>
            <p className="text-gray-600 mt-1">Use a planilha importada para montar orçamentos rapidamente.</p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/settings")}>Importar Planilha</Button>
            <Button variant="outline" onClick={reloadFromImported}>Recarregar catálogo</Button>
            <Button onClick={openHistory}>Histórico</Button>
          </div>
        </header>

        {step === "catalog" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">Catálogo de Produtos</h2>
                  <div className="text-sm text-muted-foreground">
                    {loading ? "Carregando..." : `${products.length} produtos`}
                  </div>
                </div>

                <ProductFilter onFilterChange={(f) => debouncedLoad(f)} />

                <div className="mt-6">
                  {loading ? (
                    <div className="p-8 text-center text-muted-foreground">Carregando produtos...</div>
                  ) : (
                    <ProductTable products={products} onAddToQuote={handleAddToQuote} />
                  )}
                </div>
              </div>
            </div>

            <aside className="space-y-6">
              <div className="sticky top-8">
                <QuoteBuilder
                  items={quoteItems}
                  onRemoveItem={handleRemoveItem}
                  onUpdateQuantity={handleUpdateQuantity}
                  onUpdatePriceModel={handleUpdatePriceModel}
                  onGenerateProposal={() => setStep("review")}
                />
                <div className="mt-4 flex gap-2">
                  <Button onClick={openProposalForm} disabled={quoteItems.length === 0}>Gerar Proposta</Button>
                  <Button variant="outline" onClick={() => { setQuoteItems([]); toast.success("Orçamento limpo"); }}>Limpar</Button>
                </div>
              </div>
            </aside>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">Revisar Orçamento</h2>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("catalog")}>Voltar ao Catálogo</Button>
                <Button onClick={openProposalForm}>Continuar para Dados da Empresa</Button>
              </div>
            </div>

            <div className="bg-white p-6 rounded shadow-sm">
              <QuoteBuilder
                items={quoteItems}
                onRemoveItem={handleRemoveItem}
                onUpdateQuantity={handleUpdateQuantity}
                onUpdatePriceModel={handleUpdatePriceModel}
                onGenerateProposal={() => setStep("form")}
              />
            </div>
          </div>
        )}

        {step === "form" && (
          <div>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold">Dados da Empresa</h2>
                <p className="text-sm text-muted-foreground">Preencha os dados para gerar a proposta</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("catalog")}>Cancelar</Button>
              </div>
            </div>

            <div className="bg-white p-6 rounded shadow-sm">
              <ProposalForm
                onSubmit={(data) => onProposalSubmit(data)}
                onCancel={() => setStep("catalog")}
              />
            </div>
          </div>
        )}

        {step === "summary" && proposalData && (
          <div>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold">Resumo da Proposta</h2>
                <p className="text-sm text-muted-foreground">Confirme antes de gerar o arquivo</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded shadow-sm">
              <ProposalSummary
                items={quoteItems}
                proposalData={proposalData}
                onConfirm={onConfirmAndGenerate}
                onBack={onSummaryBack}
              />
              <div className="mt-4">
                <Button onClick={onConfirmAndGenerate} disabled={saving}>
                  {saving ? "Gerando e Salvando..." : "Confirmar e Salvar"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === "history" && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-semibold">Histórico de Orçamentos</h2>
              <Button variant="outline" onClick={backToCatalog}>Voltar</Button>
            </div>

            <div className="bg-white p-6 rounded shadow-sm">
              <QuoteHistory onQuoteSelect={(q) => toast.info("Abrir orçamento selecionado: " + q.proposalNumber)} />
            </div>
          </div>
        )}
      </div>

      <MadeWithDyad />
    </div>
  );
}