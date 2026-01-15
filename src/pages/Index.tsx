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
import { fetchProducts } from "@/services/productService";
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

export default function Index() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [step, setStep] = useState<"catalog" | "review" | "form" | "summary" | "history">("catalog");
  const [proposalData, setProposalData] = useState<ProposalFormData | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  const debounceRef = useRef<number | null>(null);

  const loadProducts = useCallback(async (filters?: Partial<Record<string, any>>) => {
    setLoading(true);
    try {
      // Priority: importedProducts from localStorage (created via Settings import)
      const raw = localStorage.getItem("importedProducts");
      if (raw) {
        try {
          const rows = JSON.parse(raw) as any[];
          const imported = rows.map((r, idx) => normalizeImportedRow(r, idx));
          // If filters provided try to filter imported products
          if (filters && filters.search) {
            const searchLower = String(filters.search).toLowerCase();
            const filtered = imported.filter((p) =>
              p.description.toLowerCase().includes(searchLower) ||
              p.part_number.toLowerCase().includes(searchLower) ||
              p.sku.toLowerCase().includes(searchLower)
            );
            setProducts(filtered);
          } else {
            setProducts(imported.filter((p) => p.status === "Ativo"));
          }
          setLoading(false);
          return;
        } catch (err) {
          console.warn("Falha ao parsear importedProducts:", err);
        }
      }

      // Fallback to mock fetch
      const data = await fetchProducts(filters);
      setProducts(data);
    } catch (err) {
      console.error("Erro ao carregar produtos:", err);
      toast.error("Erro ao carregar produtos");
    } finally {
      setLoading(false);
    }
  }, []);

  // Do NOT auto-load products on mount — keep them hidden until user types in 'Buscar'.
  useEffect(() => {
    // intentionally empty: products remain hidden until search input triggers load via ProductFilter
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

    // If there's no search text, hide products immediately
    const search = (filters?.search ?? "").toString().trim();
    if (!search) {
      // Clear products and avoid fetching
      setProducts([]);
      setLoading(false);
      return;
    }

    debounceRef.current = window.setTimeout(() => {
      loadProducts(filters);
      debounceRef.current = null;
    }, delay);
  };

  const reloadFromImported = () => {
    // keep existing behavior: reload catalog from importedProducts (manual action)
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