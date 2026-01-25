"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
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

/* --- Types & helpers (kept local for this page) --- */

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

const NO_BASES_WARN_KEY = "no_bases_warning_shown";

function normalizeImportedRow(row: any, idx: number): Product {
  const id = row.id || row.ID || row.sku || row.SKU || row.part_number || `imported-${idx}-${Date.now()}`;
  const sku = row.sku || row.SKU || row.part_number || row["Part Number"] || id;
  const description = row.description || row.Description || row.Descrição || row["Product"] || sku || String(sku);
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
    return parseSpreadsheetNumber(v);
  };

  const value_12m = parseNumber(row.value_12m || row["value_12m"] || row["Valor12m"] || row["12m"] || row.value_12m);
  const value_24m = parseNumber(row.value_24m || row["value_24m"] || row["Valor24m"] || row["24m"] || row.value_24m);
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

/* --- Product-from-base helper (keeps complementMeta) --- */
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

  // If user is searching, ensure complementary items appear first (legacy behavior).
  const searchTerm = String(filters.search ?? "").trim();
  if (searchTerm.length > 0) {
    filtered.sort((a, b) => {
      const aIsComplement = !!((a as any)._complementSource || (a as any).complementMeta);
      const bIsComplement = !!((b as any)._complementSource || (b as any).complementMeta);
      if (aIsComplement === bIsComplement) return 0;
      return aIsComplement ? -1 : 1;
    });
  }

  return filtered;
}

// New helper to filter raw rows based on ProductFilters
function filterBaseRows(base: StoredBase, filters: Partial<Record<string, any>>): any[][] {
  if (!filters || Object.keys(filters).length === 0) {
    return base.rows;
  }

  const products = base.rows.map((row, idx) => {
    // Convert raw row to Product structure for filtering compatibility
    const prod = productFromBaseRow(base.headers, row, idx);
    // Attach original row data for later reconstruction
    (prod as any)._originalRow = row;
    return prod;
  });

  const filteredProducts = applyFiltersToProducts(products, filters);

  // Return the original rows corresponding to the filtered products
  return filteredProducts.map(p => (p as any)._originalRow);
}


/* --- Main component --- */
export default function Index() {
  const navigate = useNavigate();
  // Use a single state for network loading (fetching bases)
  const [baseLoading, setBaseLoading] = useState<boolean>(false);
  // Removed filterLoading state

  // persisted quote items
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>(() => {
    try {
      const raw = localStorage.getItem("quote_items");
      if (!raw) return [];
      const parsed = JSON.parse(raw) as QuoteItem[];
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch {
      return [];
    }
  });

  const prevQuoteRef = useRef<QuoteItem[] | null>(null);
  const undoTimeoutRef = useRef<number | null>(null);

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

  // New state for selected base ID and filtered rows
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [filteredRows, setFilteredRows] = useState<any[][]>([]);

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

  // Helper to find the currently selected base object
  const selectedBase = selectedBaseId ? bases.find(b => b.id === selectedBaseId) : undefined;

  // Effect to initialize selectedBaseId when bases change
  useEffect(() => {
    const list = bases.filter(b => b.type === "catalog" || b.type === "product");
    if (list.length > 0) {
      if (!selectedBaseId || !list.find((b) => b.id === selectedBaseId)) {
        setSelectedBaseId(list[0].id);
      }
    } else {
      setSelectedBaseId(null);
    }
  }, [bases, selectedBaseId]);

  // Effect to apply filtering whenever selectedBaseId or currentFilters change
  useEffect(() => {
    if (selectedBase) {
      // Debounce filtering logic
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
      
      debounceRef.current = window.setTimeout(() => {
        try {
          const rows = filterBaseRows(selectedBase, currentFilters);
          setFilteredRows(rows);
        } catch (err) {
          console.error("Error filtering base rows:", err);
          setFilteredRows(selectedBase.rows);
        }
      }, 250); // Use a short debounce for filtering

      return () => {
        if (debounceRef.current) {
          window.clearTimeout(debounceRef.current);
        }
      };
    } else {
      setFilteredRows([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBaseId, currentFilters, bases]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (undoTimeoutRef.current) {
        window.clearTimeout(undoTimeoutRef.current);
        undoTimeoutRef.current = null;
      }
    };
  }, []);

  // Try to load product bases from the server on mount (and persist to localStorage for backward-compat)
  useEffect(() => {
    let mounted = true;
    (async () => {
      setBaseLoading(true); // Set loading state for network fetch
      try {
        const serverBases = await fetchBases();
        if (!mounted) return;
        if (Array.isArray(serverBases) && serverBases.length > 0) {
          setBases(serverBases as StoredBase[]);
          try {
            localStorage.setItem("product_bases", JSON.stringify(serverBases));
          } catch {}
        }
      } catch (err) {
        // non-fatal; keep existing local bases if any
        console.warn("Failed to fetch bases from server on mount", err);
      } finally {
        if (mounted) setBaseLoading(false); // Clear loading state after network fetch
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for external changes to product_bases (e.g. deletion/save in Settings or ProductBasesTab)
  useEffect(() => {
    const handler = async () => {
      setBaseLoading(true);
      try {
        // Prefer fetching fresh list from server (keeps authoritative copy)
        const serverBases = await fetchBases();
        const toSet = Array.isArray(serverBases) ? serverBases : [];
        setBases(toSet as StoredBase[]);
        try {
          localStorage.setItem("product_bases", JSON.stringify(toSet));
        } catch {}
      } catch (err) {
        console.warn("Failed to reload product_bases from server", err);
        // Fallback: try to read from localStorage (legacy flow)
        try {
          const raw = localStorage.getItem("product_bases");
          const parsed = raw ? JSON.parse(raw) : [];
          setBases(Array.isArray(parsed) ? parsed : []);
        } catch (err2) {
          console.warn("Failed to reload product_bases from storage after server fetch failed", err2);
        }
      } finally {
        setBaseLoading(false);
      }
    };

    window.addEventListener("product_bases_changed", handler);
    return () => {
      window.removeEventListener("product_bases_changed", handler);
    };
  }, []);

  // Helper to show the no-bases warning only once per login/session
  function showNoBasesWarning() {
    try {
      if (!sessionStorage.getItem(NO_BASES_WARN_KEY)) {
        toast.error("Nenhuma base de orçamentos detectada — crie uma base em Configurações");
        sessionStorage.setItem(NO_BASES_WARN_KEY, "1");
      }
    } catch (err) {
      // fallback: still show toast if storage fails
      toast.error("Nenhuma base de orçamentos detectada — crie uma base em Configurações");
    }
  }

  const debouncedLoad = (filters?: any) => {
    setCurrentFilters(filters);
    // Filtering is handled by the useEffect hook based on selectedBaseId and currentFilters
  };

  const reloadFromBases = () => {
    toast.success("Recarregando bases...");
    window.dispatchEvent(new Event("product_bases_changed"));
  };

  const handleAddFromLookupRow = (headers: string[], row: any[], quantity = 1) => {
    const prod = productFromBaseRow(headers, row, Math.floor(Math.random() * 100000));
    
    let unitPrice: number | undefined = undefined;
    
    // Find the base that provided this row (if possible, though this function is usually called from PriceBaseTable which uses the current base)
    const sourceBase = bases.find(b => b.headers === headers && b.rows.some(r => r === row));
    
    if (sourceBase) {
        const comIdsCol = sourceBase.com_ids_column;
        const semIdsCol = sourceBase.sem_ids_column;
        
        if (comIdsCol) {
            const i = headers.indexOf(comIdsCol);
            if (i >= 0) {
                unitPrice = parseSpreadsheetNumber(row[i]);
            }
        } else if (semIdsCol) {
            const i = headers.indexOf(semIdsCol);
            if (i >= 0) {
                unitPrice = parseSpreadsheetNumber(row[i]);
            }
        }
    }

    if (unitPrice === undefined || unitPrice === 0) {
        unitPrice = prod.value_12m || prod.value_24m;
    }

    const productWithPrices: Product = {
        ...prod,
        value_12m: prod.value_12m || (unitPrice ?? 0),
        value_24m: prod.value_24m || (unitPrice ?? 0),
        // Attach complement metadata for ProductTable compatibility (although we are not using ProductTable anymore)
        complementMeta: headers.reduce((acc: any, h, i) => { acc[h] = row[i]; return acc; }, {}),
        price_com_iDSecure: unitPrice, // Use unitPrice as a hint for the selected price
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
      const priceModel: '12m' | '24m' = (product as any).priceModel || '12m';
      const newItem: QuoteItem = { id: `${product.id}-${Date.now()}`, product, quantity, priceModel, unitPrice: chosenUnit };
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

  const handleRequestClear = () => setConfirmClearOpen(true);

  const handleConfirmClear = () => {
    prevQuoteRef.current = quoteItems.length > 0 ? [...quoteItems] : null;
    setQuoteItems([]);
    try { localStorage.removeItem("quote_items"); } catch {}
    setConfirmClearOpen(false);

    toast("Orçamento limpo", {
      action: {
        label: "Desfazer",
        onClick: () => {
          if (prevQuoteRef.current) {
            setQuoteItems(prevQuoteRef.current);
            try { localStorage.setItem("quote_items", JSON.stringify(prevQuoteRef.current)); } catch {}
            prevQuoteRef.current = null;
            if (undoTimeoutRef.current) {
              window.clearTimeout(undoTimeoutRef.current);
              undoTimeoutRef.current = null;
            }
            toast.success("Orçamento restaurado");
          } else {
            toast.error("Nada para restaurar");
          }
        },
      },
    });

    if (undoTimeoutRef.current) {
      window.clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
    undoTimeoutRef.current = window.setTimeout(() => {
      prevQuoteRef.current = null;
      undoTimeoutRef.current = null;
    }, 10000) as unknown as number;
  };

  const handleCancelClear = () => setConfirmClearOpen(false);

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

  const onSummaryBack = () => setStep("form");

  const computeTotalPrice = () => quoteItems.reduce((sum, item) => {
    const unit = item.unitPrice ?? (item.priceModel === "12m" ? item.product.value_12m : item.product.value_24m);
    return sum + unit * item.quantity;
  }, 0);

  const onConfirmAndGenerate = async () => {
    if (!proposalData) return;
    setSaving(true);
    const proposalNumber = generateProposalNumber();

    const loadToastId = toast.loading("Gerando proposta...");
    try {
      const proposalPayload = { ...proposalData, items: quoteItems, proposalNumber } as any;
      const blob = await generateProposalPPTX(proposalPayload);
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

      try {
        const savingToastId = toast.loading("Salvando proposta no servidor...");
        const savedQuoteId = await saveQuote(quotePayload, itemsToSave, blob, `proposta-${proposalNumber}.pptx`);
        toast.dismiss(savingToastId);
        toast.success("Proposta salva com sucesso (ID: " + savedQuoteId + ")");

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
      } catch (err: any) {
        toast.dismiss(loadToastId);
        console.error("Erro ao salvar proposta:", err);

        try {
          const url = URL.createObjectURL((await generateProposalPPTX(proposalPayload)) as any);
          const a = document.createElement("a");
          a.href = url;
          a.download = `proposta-${proposalNumber}.pptx`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          toast.error("Falha ao salvar no servidor; proposta gerada localmente.");
        } catch (downloadErr) {
          console.error("Erro ao iniciar download:", downloadErr);
          toast.error("Falha ao salvar e ao gerar download.");
        }
      } finally {
        toast.dismiss(loadToastId);
      }
    } catch (err) {
      console.error("Erro ao gerar proposta:", err);
      toast.error("Erro ao gerar proposta");
    } finally {
      setSaving(false);
    }
  };

  const openHistory = () => setStep("history");
  const backToCatalog = () => setStep("catalog");

  const totalItemsCount = quoteItems.reduce((s, it) => s + it.quantity, 0);
  const totalPrice = computeTotalPrice();

  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResults, setLookupResults] = useState<Array<{ base: StoredBase; headers: string[]; row: any[] }>>([]);
  const [lookupLoading, setLookupLoading] = useState(false);

  const runLookup = () => {
    const q = String(lookupQuery || "").trim().toLowerCase();
    if (!q) {
      setLookupResults([]);
      return;
    }
    setLookupLoading(true);
    try {
      const productBases = bases.filter(b => b.type === "product");
      const results: Array<{ base: StoredBase; headers: string[]; row: any[] }> = [];
      productBases.forEach((b) => {
        b.rows.forEach((r) => {
          const rowStr = r.map((c) => String(c ?? "").toLowerCase()).join(" ");
          const headersStr = b.headers.join(" ").toLowerCase();
          if (rowStr.includes(q) || headersStr.includes(q)) {
            results.push({ base: b, headers: b.headers, row: r });
          } else {
            const candidate = b.headers.find(h => /sku|part|code|id/i.test(h));
            if (candidate) {
              const idx = b.headers.indexOf(candidate);
              const val = String(r[idx] ?? "").toLowerCase();
              if (val.includes(q)) {
                results.push({ base: b, headers: b.headers, row: r });
              }
            }
          }
        });
      });
      setLookupResults(results.slice(0, 200));
    } catch (err) {
      console.error("lookup failed", err);
      toast.error("Erro na busca de código");
    } finally {
      setLookupLoading(false);
    }
  };

  const allBases = bases.filter(b => b.type === "catalog" || b.type === "product");
  const currentBaseForDisplay = selectedBase ? {
    ...selectedBase,
    rows: filteredRows,
  } : undefined;

  const filteredProductsCount = filteredRows.length;
  const totalProductsCount = selectedBase ? selectedBase.rows.length : 0;


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
          <Button variant="outline" onClick={reloadFromBases}>Recarregar bases</Button>
          <Button onClick={openHistory}>Histórico</Button>
        </div>
      </header>

      {step === "catalog" && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <main className="lg:col-span-2 space-y-6">
              <section className="bg-white p-4 rounded-md shadow-sm">
                <ProductFilter onFilterChange={(f) => debouncedLoad(f)} selectedBase={selectedBase} />
              </section>

              <section className="bg-white p-4 rounded-md shadow-sm">
                <div className="flex items-center justify-between mb-4 border-b pb-2">
                  <div className="flex items-center gap-3 overflow-x-auto">
                    {baseLoading ? (
                      <div className="text-sm text-muted-foreground">Carregando bases...</div>
                    ) : allBases.length === 0 ? (
                      <div className="text-sm text-muted-foreground">Nenhuma base salva.</div>
                    ) : (
                      allBases.map((b) => (
                        <button
                          key={b.id}
                          className={`px-3 py-1 rounded-md text-sm font-medium whitespace-nowrap ${selectedBaseId === b.id ? "bg-primary text-primary-foreground" : "hover:bg-gray-100 bg-gray-50 text-gray-700"}`}
                          onClick={() => setSelectedBaseId(b.id)}
                        >
                          {b.name} <span className="text-xs opacity-70">({b.rows.length})</span>
                        </button>
                      ))
                    )}
                  </div>

                  <div className="text-sm text-muted-foreground whitespace-nowrap">
                    {baseLoading ? "Carregando..." : `Exibindo ${filteredProductsCount} de ${totalProductsCount} produtos`}
                  </div>
                </div>

                <div>
                  {baseLoading && !currentBaseForDisplay ? (
                    <div className="p-8 text-center text-muted-foreground">Carregando base...</div>
                  ) : (
                    <>
                      {currentBaseForDisplay ? (
                        <PriceBaseTable
                          base={currentBaseForDisplay as StoredBase}
                          onAddRow={(headers, row, qty) => handleAddFromLookupRow(headers, row, qty)}
                        />
                      ) : (
                        <div className="p-6 text-sm text-muted-foreground text-center">
                          Selecione ou importe uma base em Configurações.
                        </div>
                      )}
                    </>
                  )}
                </div>
              </section>
            </main>

            <aside className="lg:col-span-1">
              <div className="sticky top-6 space-y-4 max-h-[72vh] overflow-auto">
                <div className="bg-white p-4 rounded-md shadow-sm">
                  <h3 className="font-semibold mb-3">Itens adicionados</h3>
                  <div className="space-y-2 max-h-56 overflow-auto">
                    {quoteItems.length === 0 ? (
                      <div className="text-sm text-muted-foreground">Nenhum item adicionado</div>
                    ) : (
                      quoteItems.map((it) => (
                        <div key={it.id} className="flex items-center justify-between border rounded px-3 py-2">
                          <div className="text-left">
                            <div className="font-medium text-sm truncate">{it.product.description}</div>
                            <div className="text-xs text-muted-foreground">Qtd: {it.quantity} · {it.product.part_number}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleRemoveItem(it.id)}>Remover</Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-md shadow-sm">
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
                      <Button onClick={handleRequestClear} variant="outline" className="flex-1">Limpar</Button>
                      <Button variant="outline" onClick={() => setStep("review")} className="flex-1">Revisar Itens</Button>
                      <Button onClick={openProposalForm} className="flex-1" disabled={quoteItems.length === 0}>Gerar Proposta</Button>
                    </div>

                    <div className="text-xs text-muted-foreground text-center mt-1">
                      A proposta será gerada com os valores editados nos itens.
                    </div>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-md text-sm text-muted-foreground">
                  Dica: Edite o valor unitário e a quantidade nos itens para ajustar sua proposta antes de gerar.
                </div>
              </div>
            </aside>
          </div>
        </>
      )}

      {step === "productBases" && (
        <div className="bg-white p-6 rounded-md shadow-sm">
          <ProductBasesTab onBack={() => setStep("catalog")} />
        </div>
      )}

      {step === "productLookup" && (
        <div className="bg-white p-6 rounded-md shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-semibold">Pesquisar Código (Bases de Produtos)</h2>
              <p className="text-sm text-muted-foreground">Pesquise em todas as bases do tipo "Base de Produtos" e adicione itens ao orçamento.</p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("catalog")}>Voltar ao Catálogo</Button>
            </div>
          </div>

          <div className="flex gap-2 mb-4">
            <Input placeholder="Digite SKU / código / parte do nome..." value={lookupQuery} onChange={(e) => setLookupQuery(e.target.value)} />
            <Button onClick={runLookup} disabled={lookupLoading || !lookupQuery}>Buscar</Button>
          </div>

          <div>
            {lookupLoading ? (
              <div>Buscando...</div>
            ) : (
              <div className="space-y-3">
                {lookupResults.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Nenhum resultado. Verifique se você possui bases do tipo 'Base de Produtos' em Configurações.</div>
                ) : (
                  lookupResults.map((r, idx) => (
                    <div key={idx} className="border rounded p-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium">{r.base.name} — {r.base.headers.join(", ")}</div>
                          <div className="text-sm text-muted-foreground">Base criada em {new Date(r.base.created_at).toLocaleDateString()}</div>
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={() => handleAddFromLookupRow(r.headers, r.row)}>Adicionar</Button>
                        </div>
                      </div>

                      <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        {r.base.headers.map((h, i) => (
                          <div key={i} className="flex flex-col">
                            <div className="text-xs text-muted-foreground">{h}</div>
                            <div className="font-medium">{String(r.row[i] ?? "")}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Revisar Itens do Orçamento</h2>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("catalog")}>Voltar ao Catálogo</Button>
              <Button onClick={openProposalForm}>Continuar</Button>
            </div>
          </div>

          <div className="bg-white p-6 rounded shadow-sm">
            <QuoteBuilder items={quoteItems.map(q => ({ id: q.id, product: q.product, quantity: q.quantity, priceModel: q.priceModel, unitPrice: q.unitPrice }))} onRemoveItem={(id) => handleRemoveItem(id)} onUpdateQuantity={(id, quantity) => handleUpdateQuantity(id, quantity)} onUpdatePriceModel={(id, model) => handleUpdatePriceModel(id, model)} onUpdateUnitPrice={(id, unitPrice) => handleUpdateUnitPrice(id, unitPrice)} onGenerateProposal={() => { if (quoteItems.length === 0) { toast.error("Adicione ao menos 1 item ao orçamento antes de gerar a proposta"); return; } setStep("form"); }} />
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
            <ProposalForm onSubmit={(data) => onProposalSubmit(data)} onCancel={() => setStep("catalog")} />
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
            <ProposalSummary items={quoteItems} proposalData={proposalData} onConfirm={onConfirmAndGenerate} onBack={onSummaryBack} />
            <div className="mt-4">
              <Button onClick={onConfirmAndGenerate} disabled={saving}>{saving ? "Gerando e Salvando..." : "Confirmar e Salvar"}</Button>
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

      <ConfirmModal open={confirmClearOpen} title="Limpar orçamento?" description="Isso removerá todos os itens do orçamento atual. Deseja continuar?" confirmLabel="Sim, limpar" cancelLabel="Cancelar" onConfirm={handleConfirmClear} onCancel={handleCancelClear} />

      {quoteItems.length > 0 && (
        <div className="fixed left-0 right-0 bottom-4 z-50 px-4 pointer-events-none ml-[var(--sidebar-width)]">
          <div className="w-full max-w-3xl mx-auto bg-white/95 backdrop-blur-sm border rounded-md shadow-lg p-3 flex flex-col md:flex-row items-stretch md:items-center gap-3 pointer-events-auto">
            <div className="flex-1">
              <div className="text-sm text-muted-foreground">Itens: <span className="font-medium">{totalItemsCount}</span></div>
              <div className="text-lg font-bold">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalPrice)}</div>
            </div>

            <div className="flex md:flex-row flex-col gap-2 w-full md:w-auto">
              <Button variant="outline" onClick={handleRequestClear} className="w-full md:w-auto">Limpar</Button>
              <Button variant="outline" onClick={() => setStep("review")} className="w-full md:w-auto">Revisar</Button>
              <Button onClick={openProposalForm} className="w-full md:w-auto">Gerar Proposta</Button>
            </div>
          </div>
        </div>
      )}

      <MadeWithDyad />
    </div>
  );
}