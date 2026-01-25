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
  keyColumn?: string | null;
  comIdsColumn?: string | null;
  semIdsColumn?: string | null;
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
  };

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

/* --- Main component --- */
export default function Index() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

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

  const [catalogTab, setCatalogTab] = useState<"prices" | "products">("prices");
  const [currentFilters, setCurrentFilters] = useState<Partial<Record<string, any>> | undefined>(undefined);
  const [productBasesCount, setProductBasesCount] = useState<number>(0);

  useEffect(() => {
    try {
      localStorage.setItem("quote_items", JSON.stringify(quoteItems));
    } catch (err) {
      console.warn("Failed to persist quote_items", err);
    }
  }, [quoteItems]);

  const [bases, setBases] = useState<StoredBase[]>(() => {
    try {
      const raw = localStorage.getItem("product_bases");
      if (!raw) return [];
      return JSON.parse(raw) as StoredBase[];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("product_bases", JSON.stringify(bases));
    } catch (e) {
      console.warn("failed persist bases", e);
    }
  }, [bases]);

  // Build catalog products from saved 'catalog' bases and legacy importedProducts
  const getCatalogProductsFromBases = (): Product[] => {
    const out: Product[] = [];

    try {
      const raw = localStorage.getItem("importedProducts");
      if (raw) {
        const parsed = JSON.parse(raw) as any[];
        if (Array.isArray(parsed)) {
          parsed.forEach((p, idx) => {
            try {
              out.push(normalizeImportedRow(p, idx));
            } catch {}
          });
        }
      }
    } catch {}

    bases.filter(b => b.type === "catalog").forEach((b) => {
      b.rows.forEach((r, idx) => {
        try {
          const prod = productFromBaseRow(b.headers, r, idx);

          // Attach complement metadata exactly as headers -> raw cell (preserve header text)
          const complementMeta: Record<string, any> = {};
          b.headers.forEach((h, i) => {
            complementMeta[h] = r[i];
          });
          (prod as any).complementMeta = complementMeta;

          // Preserve base metadata references
          (prod as any)._baseId = b.id;
          (prod as any)._baseName = b.name;
          (prod as any)._baseKeyColumn = b.keyColumn ?? null;
          (prod as any)._baseComIdsColumn = b.comIdsColumn ?? null;
          (prod as any)._baseSemIdsColumn = b.semIdsColumn ?? null;

          // If the base specified columns for 'com' and 'sem' iDSecure prices, extract them as numeric hints
          if (b.comIdsColumn) {
            const i = b.headers.indexOf(b.comIdsColumn);
            if (i >= 0) {
              const rawVal = r[i];
              const parsed = parseSpreadsheetNumber(rawVal);
              if (parsed > 0) {
                (prod as any).price_com_iDSecure = parsed;
                if (!prod.value_12m || prod.value_12m === 0) prod.value_12m = parsed;
              }
            }
          }

          if (b.semIdsColumn) {
            const i = b.headers.indexOf(b.semIdsColumn);
            if (i >= 0) {
              const rawVal = r[i];
              const parsed = parseSpreadsheetNumber(rawVal);
              if (parsed > 0) {
                (prod as any).price_sem_iDSecure = parsed;
                if (!prod.value_24m || prod.value_24m === 0) prod.value_24m = parsed;
              }
            }
          }

          // If keyColumn provided, map sku/part_number
          if (b.keyColumn) {
            const i = b.headers.indexOf(b.keyColumn);
            if (i >= 0) {
              const rawKey = r[i];
              const keyVal = rawKey !== undefined && rawKey !== null ? String(rawKey) : "";
              if (keyVal) {
                prod.sku = keyVal;
                prod.part_number = keyVal;
              }
            }
          }

          out.push(prod);
        } catch {}
      });
    });

    return out;
  };

  const getProductsFromProductBases = (): Product[] => {
    const out: Product[] = [];
    bases.filter(b => b.type === "product").forEach((b) => {
      b.rows.forEach((r, idx) => {
        try {
          const prod = productFromBaseRow(b.headers, r, idx);
          (prod as any)._baseId = b.id;
          (prod as any)._baseName = b.name;
          out.push(prod);
        } catch {}
      });
    });
    return out;
  };

  useEffect(() => {
    try {
      const all = getProductsFromProductBases();
      const filtered = currentFilters && Object.keys(currentFilters).length > 0
        ? applyFiltersToProducts(all, currentFilters)
        : all.filter(p => p.status === "Ativo");
      setProductBasesCount(filtered.length);
    } catch {
      setProductBasesCount(0);
    }
  }, [bases, currentFilters]);

  const loadProducts = useCallback(async (filters?: Partial<Record<string, any>>) => {
    setLoading(true);
    try {
      const imported = getCatalogProductsFromBases();

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
  }, [bases]);

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

  useEffect(() => {
    loadProducts();
  }, [loadProducts, bases]);

  // Try to load product bases from the server on mount (and persist to localStorage for backward-compat)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const serverBases = await fetchBases();
        if (!mounted) return;
        if (Array.isArray(serverBases) && serverBases.length > 0) {
          setBases(serverBases as StoredBase[]);
          try {
            localStorage.setItem("product_bases", JSON.stringify(serverBases));
          } catch {}
          // refresh products after loading bases
          setTimeout(() => {
            try {
              loadProducts(currentFilters);
            } catch {}
          }, 0);
        }
      } catch (err) {
        // non-fatal; keep existing local bases if any
        console.warn("Failed to fetch bases from server on mount", err);
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for external changes to product_bases (e.g. deletion/save in Settings or ProductBasesTab)
  useEffect(() => {
    const handler = async () => {
      try {
        // Prefer fetching fresh list from server (keeps authoritative copy)
        const serverBases = await fetchBases();
        const toSet = Array.isArray(serverBases) ? serverBases : [];
        setBases(toSet as StoredBase[]);
        try {
          localStorage.setItem("product_bases", JSON.stringify(toSet));
        } catch {}
        // refresh products using current filters
        setTimeout(() => {
          try {
            loadProducts(currentFilters);
          } catch {}
        }, 0);
      } catch (err) {
        console.warn("Failed to reload product_bases from server", err);
        // Fallback: try to read from localStorage (legacy flow)
        try {
          const raw = localStorage.getItem("product_bases");
          const parsed = raw ? JSON.parse(raw) : [];
          setBases(Array.isArray(parsed) ? parsed : []);
          setTimeout(() => {
            try {
              loadProducts(currentFilters);
            } catch {}
          }, 0);
        } catch (err2) {
          console.warn("Failed to reload product_bases from storage after server fetch failed", err2);
        }
      }
    };

    window.addEventListener("product_bases_changed", handler);
    return () => {
      window.removeEventListener("product_bases_changed", handler);
    };
  }, [loadProducts, currentFilters]);

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

  const debouncedLoad = (filters?: any, delay = 250) => {
    setCurrentFilters(filters);

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    const search = (filters?.search ?? "").toString().trim();
    const otherFiltersExist = Object.keys(filters || {}).some((k) => k !== "search" && filters[k] !== undefined && filters[k] !== "");
    const imported = getCatalogProductsFromBases();

    if (!search && !otherFiltersExist) {
      if (imported.length === 0) {
        setProducts([]);
        setLoading(false);
        showNoBasesWarning();
        return;
      } else {
        setProducts(imported.filter(p => p.status === "Ativo"));
        setLoading(false);
        return;
      }
    }

    if (imported.length === 0) {
      setProducts([]);
      setLoading(false);
      showNoBasesWarning();
      return;
    }

    debounceRef.current = window.setTimeout(() => {
      loadProducts(filters);
      debounceRef.current = null;
    }, delay);
  };

  const reloadFromBases = () => {
    const imported = getCatalogProductsFromBases();
    if (imported.length === 0) {
      showNoBasesWarning();
      setProducts([]);
      return;
    }
    loadProducts();
    toast.success("Catálogo recarregado a partir das bases");
  };

  const handleAddToQuote = (product: Product, quantity: number, unitPrice?: number) => {
    const existing = quoteItems.find((it) => it.product.id === product.id);
    const defaultUnit = product.value_12m;
    const chosenUnit = unitPrice ?? defaultUnit;

    if (existing) {
      setQuoteItems((prev) =>
        [
          { ...existing, quantity: existing.quantity + quantity, unitPrice: unitPrice ?? existing.unitPrice },
          ...prev.filter((it) => it.product.id !== product.id)
        ]
      );
    } else {
      const newItem: QuoteItem = { id: `${product.id}-${Date.now()}`, product, quantity, priceModel: "12m", unitPrice: chosenUnit };
      setQuoteItems((prev) => [newItem, ...prev]);
    }
    toast.success(`${product.description} adicionado ao orçamento`);
  };

  const handleAddFromLookupRow = (headers: string[], row: any[], quantity = 1) => {
    const prod = productFromBaseRow(headers, row, Math.floor(Math.random() * 100000));
    const skuCandidates = [prod.sku, prod.part_number].filter(Boolean).map(String);
    let foundPrice: number | undefined = undefined;

    const catalogProducts = getCatalogProductsFromBases();
    for (const candidate of skuCandidates) {
      const found = catalogProducts.find(p => String(p.sku) === candidate || String(p.part_number) === candidate);
      if (found) {
        foundPrice = found.value_12m || found.value_24m;
        break;
      }
    }

    handleAddToQuote(prod, quantity, foundPrice);
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

  const productBasesProductsAll = getProductsFromProductBases();
  const productBasesProductsFiltered = currentFilters && Object.keys(currentFilters).length > 0
    ? applyFiltersToProducts(productBasesProductsAll, currentFilters)
    : productBasesProductsAll.filter(p => p.status === "Ativo");

  const productBasesList = bases.filter(b => b.type === "product");
  const [selectedProductBaseId, setSelectedProductBaseId] = useState<string | null>(productBasesList[0]?.id ?? null);
  const [baseRowQuantities, setBaseRowQuantities] = useState<Record<number, number>>({});

  useEffect(() => {
    const list = bases.filter(b => b.type === "product");
    if (list.length === 0) {
      setSelectedProductBaseId(null);
    } else {
      if (!selectedProductBaseId || !list.find((b) => b.id === selectedProductBaseId)) {
        setSelectedProductBaseId(list[0].id);
      }
    }
  }, [bases]);

  useEffect(() => setBaseRowQuantities({}), [selectedProductBaseId]);

  const setQuantityForRow = (rowIndex: number, qty: number) => {
    setBaseRowQuantities((prev) => ({ ...prev, [rowIndex]: Math.max(1, Math.min(999, Number(isNaN(qty) ? 1 : qty))) }));
  };

  const selectedBase: StoredBase | undefined = selectedProductBaseId ? bases.find(b => b.id === selectedProductBaseId) : undefined;

  // Determine first catalog base to display exactly as preview (most recent catalog)
  const firstCatalogBase = bases.find((b) => b.type === "catalog");

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8">
        <header className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Plataforma de Cotação Control iD</h1>
            <p className="text-gray-600 mt-1">Monte orçamentos rapidamente a partir das suas bases.</p>
          </div>

          <div className="flex gap-2">
            <Button variant={step === "catalog" ? "default" : "outline"} onClick={() => setStep("catalog")}>Catálogo</Button>
            <Button variant={step === "productBases" ? "default" : "outline"} onClick={() => setStep("productBases")}>Base de Produtos</Button>
            <Button variant={step === "productLookup" ? "default" : "outline"} onClick={() => setStep("productLookup")}>Pesquisar Código</Button>
            <Button variant="outline" onClick={() => navigate("/settings")}>Configurações / Bases</Button>
            <Button variant="outline" onClick={reloadFromBases}>Recarregar bases</Button>
            <Button onClick={openHistory}>Histórico</Button>
          </div>
        </header>

        {step === "catalog" && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <main className="lg:col-span-2 space-y-6">
                <section className="bg-white p-4 rounded-md shadow-sm">
                  <ProductFilter onFilterChange={(f) => debouncedLoad(f)} />
                </section>

                <section className="bg-white p-4 rounded-md shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <button
                        className={`px-3 py-1 rounded-md text-sm font-medium ${catalogTab === "prices" ? "bg-gray-100" : "hover:bg-gray-50"}`}
                        onClick={() => setCatalogTab("prices")}
                      >
                        Preços {loading ? "" : <span className="text-muted-foreground text-sm">({products.length})</span>}
                      </button>

                      <button
                        className={`px-3 py-1 rounded-md text-sm font-medium ${catalogTab === "products" ? "bg-gray-100" : "hover:bg-gray-50"}`}
                        onClick={() => setCatalogTab("products")}
                      >
                        Base de Produtos {<span className="text-muted-foreground text-sm">({productBasesCount})</span>}
                      </button>
                    </div>

                    <div className="text-sm text-muted-foreground">{loading ? "Carregando..." : `${catalogTab === "prices" ? `${products.length} produtos` : `${productBasesProductsFiltered.length} produtos`}`}</div>
                  </div>

                  <div>
                    {loading && catalogTab === "prices" ? (
                      <div className="p-8 text-center text-muted-foreground">Carregando produtos...</div>
                    ) : (
                      <>
                        {catalogTab === "prices" ? (
                          // If we have at least one catalog base, render it exactly as saved (preview fidelity).
                          firstCatalogBase ? (
                            <PriceBaseTable
                              base={firstCatalogBase}
                              onAddRow={(headers, row, qty) => handleAddFromLookupRow(headers, row, qty)}
                            />
                          ) : (
                            <ProductTable products={products} onAddToQuote={handleAddToQuote} />
                          )
                        ) : (
                          <>
                            {productBasesList.length === 0 ? (
                              <div className="p-6 text-sm text-muted-foreground">
                                Nenhuma base de produtos encontrada. Crie/importe uma base em <strong>Configurações</strong>.
                              </div>
                            ) : (
                              <div>
                                <div className="mb-4 flex items-center gap-3">
                                  <label className="text-sm text-muted-foreground">Base:</label>
                                  <select
                                    className="border rounded px-2 py-1"
                                    value={selectedProductBaseId ?? ""}
                                    onChange={(e) => setSelectedProductBaseId(e.target.value || null)}
                                  >
                                    {productBasesList.map((b) => (
                                      <option key={b.id} value={b.id}>
                                        {b.name} ({b.rows.length})
                                      </option>
                                    ))}
                                  </select>

                                  <Button variant="outline" onClick={() => {
                                    try {
                                      const raw = localStorage.getItem("product_bases");
                                      if (!raw) {
                                        setBases([]);
                                        toast.info("Bases recarregadas (nenhuma encontrada)");
                                        return;
                                      }
                                      const parsed = JSON.parse(raw) as StoredBase[];
                                      setBases(Array.isArray(parsed) ? parsed : []);
                                      toast.success("Bases recarregadas");
                                    } catch (err) {
                                      console.warn("failed reload bases", err);
                                      toast.error("Falha ao recarregar bases");
                                    }
                                  }}>Recarregar bases</Button>
                                </div>

                                {selectedBase ? (
                                  <div className="overflow-auto border rounded">
                                    <table className="w-full text-sm">
                                      <thead className="bg-gray-50">
                                        <tr>
                                          {selectedBase.headers.map((h, hi) => (
                                            <th key={hi} className="text-left px-2 py-2 align-top">{h || "(vazio)"}</th>
                                          ))}
                                          <th className="text-left px-2 py-2">Quantidade</th>
                                          <th className="text-left px-2 py-2">Ações</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {selectedBase.rows.length === 0 ? (
                                          <tr>
                                            <td colSpan={selectedBase.headers.length + 2} className="py-8 text-center text-muted-foreground">
                                              Esta base não contém linhas.
                                            </td>
                                          </tr>
                                        ) : (
                                          selectedBase.rows.map((row, ri) => (
                                            <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                                              {selectedBase.headers.map((_, ci) => (
                                                <td key={ci} className="px-2 py-2 align-top break-words">{String(row[ci] ?? "")}</td>
                                              ))}

                                              <td className="px-2 py-2">
                                                <Input
                                                  type="number"
                                                  min={1}
                                                  value={baseRowQuantities[ri] ?? 1}
                                                  onChange={(e) => setQuantityForRow(ri, parseInt(e.target.value || "1", 10))}
                                                  className="w-24"
                                                />
                                              </td>

                                              <td className="px-2 py-2">
                                                <div className="flex gap-2">
                                                  <Button onClick={() => handleAddFromLookupRow(selectedBase.headers, row, baseRowQuantities[ri] ?? 1)}>
                                                    Adicionar
                                                  </Button>

                                                  <Button variant="outline" onClick={() => {
                                                    try {
                                                      const payload = selectedBase.headers.reduce((acc: any, h, idx) => {
                                                        acc[h] = row[idx];
                                                        return acc;
                                                      }, {});
                                                      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
                                                      const url = URL.createObjectURL(blob);
                                                      const a = document.createElement("a");
                                                      a.href = url;
                                                      a.download = `row-${selectedBase.name.replace(/\s+/g, "-") || selectedBase.id}-${ri}.json`;
                                                      document.body.appendChild(a);
                                                      a.click();
                                                      document.body.removeChild(a);
                                                      URL.revokeObjectURL(url);
                                                      toast.success("Linha exportada");
                                                    } catch (err) {
                                                      console.error("export row failed", err);
                                                      toast.error("Falha ao exportar linha");
                                                    }
                                                  }}>Exportar</Button>
                                                </div>
                                              </td>
                                            </tr>
                                          ))
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <div className="p-6 text-sm text-muted-foreground">Selecione uma base para visualizar as colunas e linhas.</div>
                                )}
                              </div>
                            )}
                          </>
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
                            <div className="text-sm text-muted-foreground">Base criada em {new Date(r.base.createdAt).toLocaleDateString()}</div>
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
      </div>

      <ConfirmModal open={confirmClearOpen} title="Limpar orçamento?" description="Isso removerá todos os itens do orçamento atual. Deseja continuar?" confirmLabel="Sim, limpar" cancelLabel="Cancelar" onConfirm={handleConfirmClear} onCancel={handleCancelClear} />

      {quoteItems.length > 0 && (
        <div className="fixed left-0 right-0 bottom-4 z-50 px-4 pointer-events-none">
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