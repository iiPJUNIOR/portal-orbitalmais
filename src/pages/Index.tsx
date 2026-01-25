"use client";

import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ProductFilter } from "@/components/ProductFilter";
import { ProductTable } from "@/components/ProductTable";
import PriceBaseTable from "@/components/PriceBaseTable";
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
import ConfirmModal from "@/components/ConfirmModal";
import { QuoteBuilder } from "@/components/QuoteBuilder";
import ProductBasesTab from "@/components/ProductBasesTab";
import { Input } from "@/components/ui/input";
import { fetchBases } from "@/services/productBaseService";
import { getUserSettings } from "@/services/settingsService";
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
import { SortableTab } from "@/components/SortableTab";

/* --- Types & helpers --- */

type QuoteItem = {
  id: string;
  product: Product;
  quantity: number;
  priceModel: "12m" | "24m";
  unitPrice?: number;
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

const TAB_ORDER_STORAGE_KEY = "product_base_tab_order";

/* --- Product-from-base helper --- */
function productFromBaseRow(headers: string[], row: any[], idx: number): Product {
  const map: Record<string, any> = {};
  headers.forEach((h, i) => {
    map[h] = row[i];
  });

  const safe = (k: string[]) => {
    for (const key of k) {
      if (map[key] !== undefined && map[key] !== null && String(map[key]).trim() !== "") {
        return String(map[key]);
      }
    }
    return "";
  }
    
  const sku = safe(["sku", "SKU", "part_number", "part number", "partnumber", "id", "code"]);
  const description = safe(["description", "Description", "descrição", "Descrição", "product", "Produto", "nome"]) || sku || `item-${idx}`;
  const model = safe(["model", "Model", "modelo", "Modelo"]) || description;
  const value12 = parseSpreadsheetNumber(safe(["value_12m", "12m", "valor12", "valor_12m", "price12", "price_12"]));
  const value24 = parseSpreadsheetNumber(safe(["value_24m", "24m", "valor24", "valor_24m", "price24", "price_24"]));
  const part_number = sku || safe(["part_number", "part number", "partnumber"]) || `pn-${idx}`;

  return {
    id: `${sku || part_number || "base"}-${idx}-${Date.now()}`,
    sku: sku || part_number || `sku-${idx}`,
    category: "Controladores Porta" as Product["category"],
    model,
    colors: [],
    biometrics: false,
    facial: "None",
    proximity: "None",
    urn: false,
    qr: false,
    description,
    value_12m: Number(value12 || 0),
    value_24m: Number(value24 || 0),
    part_number,
    status: "Ativo",
  };
}

/* --- Filtering helper --- */
function applyFiltersToProducts(products: Product[], filters: Partial<Record<string, any>> = {}) {
  const filtered = products.filter((product) => {
    if (filters.category && product.category !== filters.category) return false;
    if (filters.tipo) {
      const t = String(filters.tipo).toLowerCase();
      if (!(product.model.toLowerCase().includes(t) || product.part_number.toLowerCase().includes(t))) return false;
    }
    if (filters.model && product.model !== filters.model) return false;
    if (filters.color) {
      const c = String(filters.color).toLowerCase();
      if (!product.colors.some((col) => col.toLowerCase() === c)) return false;
    }
    if (filters.biometrics !== undefined && product.biometrics !== filters.biometrics) return false;
    if (filters.facial && filters.facial !== "None" && product.facial !== filters.facial) return false;
    if (filters.proximity && filters.proximity !== "None" && product.proximity !== filters.proximity) return false;
    if (filters.urn !== undefined && product.urn !== filters.urn) return false;
    if (filters.qr !== undefined && product.qr !== filters.qr) return false;

    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      const minPriceFilter = filters.minPrice ?? Number.NEGATIVE_INFINITY;
      const maxPriceFilter = filters.maxPrice ?? Number.POSITIVE_INFINITY;
      const lowestPrice = Math.min(product.value_12m, product.value_24m);
      const highestPrice = Math.max(product.value_12m, product.value_24m);
      if (highestPrice < minPriceFilter) return false;
      if (lowestPrice > maxPriceFilter) return false;
    }

    if (filters.search) {
      const searchLower = String(filters.search).toLowerCase();
      if (
        !product.description.toLowerCase().includes(searchLower) &&
        !product.part_number.toLowerCase().includes(searchLower) &&
        !product.sku.toLowerCase().includes(searchLower)
      ) return false;
    }

    return product.status === "Ativo";
  });

  return filtered;
}

function filterBaseRows(base: StoredBase, filters: Partial<Record<string, any>>): any[][] {
  if (!filters || Object.keys(filters).length === 0) {
    return base.rows;
  }
  const products = base.rows.map((row, idx) => {
    const prod = productFromBaseRow(base.headers, row, idx);
    (prod as any)._originalRow = row;
    return prod;
  });
  const filteredProducts = applyFiltersToProducts(products, filters);
  return filteredProducts.map(p => (p as any)._originalRow);
}

export default function Index() {
  const navigate = useNavigate();
  const [baseLoading, setBaseLoading] = useState<boolean>(false);
  const [sellerInfo, setSellerInfo] = useState<{
    name: string;
    role: string;
    email: string;
    phone: string;
  } | null>(null);

  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>(() => {
    try {
      const raw = localStorage.getItem("quote_items");
      if (!raw) return [];
      const parsed = JSON.parse(raw) as QuoteItem[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [step, setStep] = useState<"catalog" | "review" | "form" | "summary" | "history" | "productLookup" | "productBases">("catalog");
  const [proposalData, setProposalData] = useState<ProposalFormData | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const [currentFilters, setCurrentFilters] = useState<Partial<Record<string, any>> | undefined>(undefined);

  const [bases, setBases] = useState<StoredBase[]>(() => {
    try {
      const raw = localStorage.getItem("product_bases");
      if (!raw) return [];
      return JSON.parse(raw) as StoredBase[];
    } catch {
      return [];
    }
  });

  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [filteredRows, setFilteredRows] = useState<any[][]>([]);
  const [tabOrder, setTabOrder] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(TAB_ORDER_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    try {
      localStorage.setItem("quote_items", JSON.stringify(quoteItems));
    } catch (err) {
      console.warn("Failed to persist quote_items", err);
    }
  }, [quoteItems]);

  useEffect(() => {
    try {
      localStorage.setItem("product_bases", JSON.stringify(bases));
    } catch (e) {
      console.warn("failed persist bases", e);
    }
  }, [bases]);

  // Load seller info on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const s = await getUserSettings();
        if (s) {
          const info = {
            name: s.seller_name || "",
            role: s.seller_role || "",
            email: s.seller_email || "",
            phone: s.seller_phone || "",
          };
          setSellerInfo(info);
          // Also sync to localStorage for proposalService fallback
          localStorage.setItem("seller_name", info.name);
          localStorage.setItem("seller_role", info.role);
          localStorage.setItem("seller_email", info.email);
          localStorage.setItem("seller_phone", info.phone);
        }
      } catch (err) {
        console.warn("Failed to load seller settings", err);
      }
    };
    loadSettings();
  }, []);

  const allBases = useMemo(() => {
    const list = bases.filter(b => b.type === "catalog" || b.type === "product");
    if (tabOrder.length > 0) {
      return [...list].sort((a, b) => {
        const idxA = tabOrder.indexOf(a.id);
        const idxB = tabOrder.indexOf(b.id);
        if (idxA === -1 && idxB === -1) return 0;
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });
    }
    return list;
  }, [bases, tabOrder]);

  const handleTabDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = allBases.findIndex((b) => b.id === active.id);
      const newIndex = allBases.findIndex((b) => b.id === over?.id);
      const newBases = arrayMove(allBases, oldIndex, newIndex);
      const newOrder = newBases.map(b => b.id);
      setTabOrder(newOrder);
      try { localStorage.setItem(TAB_ORDER_STORAGE_KEY, JSON.stringify(newOrder)); } catch {}
    }
  };

  const selectedBase = selectedBaseId ? bases.find(b => b.id === selectedBaseId) : undefined;

  useEffect(() => {
    if (allBases.length > 0) {
      if (!selectedBaseId || !allBases.find((b) => b.id === selectedBaseId)) {
        setSelectedBaseId(allBases[0].id);
      }
    } else {
      setSelectedBaseId(null);
    }
  }, [allBases, selectedBaseId]);

  useEffect(() => {
    if (selectedBase) {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        try {
          const rows = filterBaseRows(selectedBase, currentFilters);
          setFilteredRows(rows);
        } catch (err) {
          setFilteredRows(selectedBase.rows);
        }
      }, 250);
      return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
    } else {
      setFilteredRows([]);
    }
  }, [selectedBaseId, currentFilters, bases]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setBaseLoading(true);
      try {
        const serverBases = await fetchBases();
        if (!mounted) return;
        if (Array.isArray(serverBases) && serverBases.length > 0) {
          setBases(serverBases as StoredBase[]);
          try { localStorage.setItem("product_bases", JSON.stringify(serverBases)); } catch {}
        }
      } catch (err) {
        console.warn("Failed to fetch bases from server on mount", err);
      } finally {
        if (mounted) setBaseLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const handler = async () => {
      setBaseLoading(true);
      try {
        const serverBases = await fetchBases();
        const toSet = Array.isArray(serverBases) ? serverBases : [];
        setBases(toSet as StoredBase[]);
      } catch (err) {
        console.warn("Failed to reload product_bases", err);
      } finally {
        setBaseLoading(false);
      }
    };
    window.addEventListener("product_bases_changed", handler);
    return () => { window.removeEventListener("product_bases_changed", handler); };
  }, []);

  const debouncedLoad = (filters?: any) => {
    setCurrentFilters(filters);
  };

  const handleAddFromLookupRow = (headers: string[], row: any[], quantity = 1) => {
    const prod = productFromBaseRow(headers, row, Math.floor(Math.random() * 100000));
    let unitPrice: number | undefined = undefined;
    const sourceBase = bases.find(b => b.headers === headers && b.rows.some(r => r === row));
    if (sourceBase) {
        const comIdsCol = sourceBase.com_ids_column;
        const semIdsCol = sourceBase.sem_ids_column;
        if (comIdsCol) {
            const i = headers.indexOf(comIdsCol);
            if (i >= 0) unitPrice = parseSpreadsheetNumber(row[i]);
        } else if (semIdsCol) {
            const i = headers.indexOf(semIdsCol);
            if (i >= 0) unitPrice = parseSpreadsheetNumber(row[i]);
        }
    }
    if (unitPrice === undefined || unitPrice === 0) {
        unitPrice = prod.value_12m || prod.value_24m;
    }
    const productWithPrices: Product = {
        ...prod,
        value_12m: prod.value_12m || (unitPrice ?? 0),
        value_24m: prod.value_24m || (unitPrice ?? 0),
        complementMeta: headers.reduce((acc: any, h, i) => { acc[h] = row[i]; return acc; }, {}),
        price_com_iDSecure: unitPrice,
        price_sem_iDSecure: unitPrice,
    };
    handleAddToQuote(productWithPrices, quantity, unitPrice);
  };

  const handleAddToQuote = (product: Product, quantity: number, unitPrice?: number) => {
    const existing = quoteItems.find((it) => it.product.id === product.id);
    const defaultUnit = product.value_12m || product.value_24m || 0;
    const chosenUnit = unitPrice ?? defaultUnit;
    if (existing) {
      setQuoteItems((prev) =>
        [
          { ...existing, quantity: existing.quantity + quantity, unitPrice: unitPrice ?? existing.unitPrice },
          ...prev.filter((it) => it.product.id !== product.id)
        ]
      );
    } else {
      const newItem: QuoteItem = { id: `${product.id}-${Date.now()}`, product, quantity, priceModel: '12m', unitPrice: chosenUnit };
      setQuoteItems((prev) => [newItem, ...prev]);
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
    setQuoteItems((prev) => prev.map((it) => {
      if (it.id === id) {
        const currentUnit = it.unitPrice;
        const defaultUnit = model === "12m" ? it.product.value_12m : it.product.value_24m;
        return { ...it, priceModel: model, unitPrice: currentUnit === undefined ? defaultUnit : currentUnit };
      }
      return it;
    }));
  };

  const handleUpdateUnitPrice = (id: string, unitPrice: number) => {
    setQuoteItems((prev) => prev.map((it) => (it.id === id ? { ...it, unitPrice: Number(isNaN(unitPrice) ? 0 : unitPrice) } : it)));
  };

  const handleConfirmClear = () => {
    setQuoteItems([]);
    try { localStorage.removeItem("quote_items"); } catch {}
    setConfirmClearOpen(false);
    toast.success("Orçamento limpo");
  };

  const onProposalSubmit = (data: ProposalFormData) => {
    setProposalData(data);
    setStep("summary");
  };

  const onConfirmAndGenerate = async () => {
    if (!proposalData) return;
    setSaving(true);
    const proposalNumber = generateProposalNumber();
    const loadToastId = toast.loading("Gerando proposta...");
    try {
      // Include seller info in the payload
      const proposalPayload = { 
        ...proposalData, 
        items: quoteItems, 
        proposalNumber,
        sellerName: sellerInfo?.name,
        sellerRole: sellerInfo?.role,
        sellerEmail: sellerInfo?.email,
        sellerPhone: sellerInfo?.phone,
      } as any;
      
      const blob = await generateProposalPPTX(proposalPayload);
      const totalPrice = quoteItems.reduce((sum, item) => {
        const unit = item.unitPrice ?? (item.priceModel === "12m" ? item.product.value_12m : item.product.value_24m);
        return sum + unit * item.quantity;
      }, 0);

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
        const unit = it.unitPrice ?? (it.priceModel === "12m" ? it.product.value_12m : it.product.value_24m);
        return {
          sku: it.product.sku,
          productDescription: it.product.description,
          quantity: it.quantity,
          unitPrice: unit,
          priceModel: it.priceModel,
          subtotal: unit * it.quantity,
        };
      });

      await saveQuote(quotePayload, itemsToSave, blob, `proposta-${proposalNumber}.pptx`);
      toast.success("Proposta gerada e salva com sucesso");

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `proposta-${proposalNumber}.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setQuoteItems([]);
      try { localStorage.removeItem("quote_items"); } catch {}
      setProposalData(null);
      setStep("catalog");
    } catch (err) {
      console.error("Erro ao gerar proposta:", err);
      toast.error("Erro ao gerar proposta");
    } finally {
      toast.dismiss(loadToastId);
      setSaving(false);
    }
  };

  const totalItemsCount = quoteItems.reduce((s, it) => s + it.quantity, 0);
  const totalPrice = quoteItems.reduce((sum, item) => {
    const unit = item.unitPrice ?? (item.priceModel === "12m" ? item.product.value_12m : item.product.value_24m);
    return sum + unit * item.quantity;
  }, 0);

  const currentBaseForDisplay = selectedBase ? {
    ...selectedBase,
    rows: filteredRows,
  } : undefined;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <header className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gerador Acesso</h1>
          <p className="text-gray-600 mt-1">Monte orçamentos rapidamente a partir das suas bases.</p>
        </div>

        <div className="flex gap-2">
          <Button variant={step === "catalog" ? "default" : "outline"} onClick={() => setStep("catalog")}>Catálogo</Button>
          <Button variant={step === "productBases" ? "default" : "outline"} onClick={() => setStep("productBases")}>Gerenciar Bases</Button>
          <Button variant={step === "productLookup" ? "default" : "outline"} onClick={() => setStep("productLookup")}>Pesquisar Código</Button>
          <Button variant="outline" onClick={() => window.dispatchEvent(new Event("product_bases_changed"))}>Recarregar bases</Button>
          <Button onClick={() => setStep("history")}>Histórico</Button>
        </div>
      </header>

      {step === "catalog" && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <main className="lg:col-span-3 space-y-6">
            <section className="bg-white p-4 rounded-md shadow-sm">
              <ProductFilter onFilterChange={debouncedLoad} selectedBase={selectedBase as any} />
            </section>
            <section className="bg-white p-4 rounded-md shadow-sm min-h-[calc(100vh-320px)] flex flex-col">
              <div className="flex items-center justify-between mb-4 border-b pb-2">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTabDragEnd}>
                  <div className="flex items-center gap-3 overflow-x-auto pb-1">
                    {baseLoading ? (
                      <div className="text-sm text-muted-foreground">Carregando bases...</div>
                    ) : (
                      <SortableContext items={allBases.map(b => b.id)} strategy={horizontalListSortingStrategy}>
                        {allBases.map((b) => (
                          <SortableTab
                            key={b.id}
                            id={b.id}
                            isActive={selectedBaseId === b.id}
                            onClick={() => setSelectedBaseId(b.id)}
                            label={b.name}
                            count={b.rows.length}
                          />
                        ))}
                      </SortableContext>
                    )}
                  </div>
                </DndContext>
                <div className="text-sm text-muted-foreground ml-4">
                  {selectedBase ? `Exibindo ${filteredRows.length} de ${selectedBase.rows.length} produtos` : "Nenhuma base selecionada"}
                </div>
              </div>
              <div className="w-full flex-1">
                {currentBaseForDisplay ? (
                  <PriceBaseTable
                    base={currentBaseForDisplay as any}
                    onAddRow={handleAddFromLookupRow}
                  />
                ) : (
                  <div className="p-6 text-sm text-muted-foreground text-center">Selecione uma base acima.</div>
                )}
              </div>
            </section>
          </main>
          <aside className="lg:col-span-1">
            <div className="bg-white p-4 rounded-md shadow-sm sticky top-6 space-y-4">
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">Itens</div>
                        <div className="font-medium">{totalItemsCount}</div>
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">Total</div>
                        <div className="text-lg font-bold">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalPrice)}</div>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={() => setConfirmClearOpen(true)} variant="outline" className="flex-1">Limpar</Button>
                        <Button onClick={() => setStep("review")} className="flex-1">Revisar</Button>
                        <Button onClick={() => quoteItems.length > 0 ? setStep("form") : toast.error("Adicione itens")} className="flex-1" disabled={quoteItems.length === 0}>Gerar</Button>
                    </div>
                </div>
            </div>
          </aside>
        </div>
      )}

      {step === "productBases" && <ProductBasesTab onBack={() => setStep("catalog")} />}
      
      {step === "review" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Revisar Itens</h2>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("catalog")}>Voltar</Button>
              <Button onClick={() => setStep("form")}>Continuar</Button>
            </div>
          </div>
          <QuoteBuilder items={quoteItems as any} onRemoveItem={handleRemoveItem} onUpdateQuantity={handleUpdateQuantity} onUpdatePriceModel={handleUpdatePriceModel} onUpdateUnitPrice={handleUpdateUnitPrice} onGenerateProposal={() => setStep("form")} />
        </div>
      )}

      {step === "form" && (
        <div className="bg-white p-6 rounded shadow-sm">
          <ProposalForm onSubmit={onProposalSubmit} onCancel={() => setStep("catalog")} />
        </div>
      )}

      {step === "summary" && proposalData && (
        <div className="bg-white p-6 rounded shadow-sm">
          <ProposalSummary items={quoteItems as any} proposalData={proposalData} onConfirm={onConfirmAndGenerate} onBack={() => setStep("form")} />
        </div>
      )}

      {step === "history" && (
        <div className="bg-white p-6 rounded shadow-sm">
          <QuoteHistory onQuoteSelect={(q) => toast.info("Orçamento: " + q.proposalNumber)} />
          <Button className="mt-4" variant="outline" onClick={() => setStep("catalog")}>Voltar</Button>
        </div>
      )}

      <ConfirmModal open={confirmClearOpen} onConfirm={handleConfirmClear} onCancel={() => setConfirmClearOpen(false)} />
      <MadeWithDyad />
    </div>
  );
}