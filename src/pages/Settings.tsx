"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import * as googleClient from "@/integrations/google/client";
import { parseSpreadsheetNumber } from "@/lib/formatters";

const ENV_GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const LOCAL_STORAGE_KEY = "google_client_id_override";

// Local storage keys for complement settings
const LS_COMPLEMENT_RANGE = "complement_range";
const LS_COMPLEMENT_SHEET = "complement_sheet";
const LS_COMPLEMENT_KEY_COLUMN = "complement_key_column";
const LS_COMPLEMENT_PRICE_12 = "complement_price_12_column";
const LS_COMPLEMENT_PRICE_24 = "complement_price_24_column";
const LS_COMPLEMENT_COM_IDS = "complement_com_ids_column";
const LS_COMPLEMENT_SEM_IDS = "complement_sem_ids_column";

// Fields expected from the user mapping
const MAPPING_FIELDS = [
  { key: "category", label: "Categoria" },
  { key: "tipo", label: "Tipo" },
  { key: "model", label: "Modelo" },
  { key: "colors", label: "Cor / Material" },
  { key: "biometrics", label: "Biometria" },
  { key: "facial", label: "Facial" },
  { key: "proximity", label: "Proximidade" },
  { key: "urn", label: "Urna" },
  { key: "qr", label: "QR Code" },
  { key: "part_number", label: "Partnumber" },
  { key: "description", label: "Descrição" },
  { key: "value_12m", label: "Valor mensal 12 meses" },
  { key: "value_24m", label: "Valor mensal 24 meses" },
];

export default function Settings() {
  const navigate = useNavigate();
  const [connected, setConnected] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<Array<{ id: string; name: string }>>([]);
  const [fileSearch, setFileSearch] = useState<string>("");
  const [spreadsheetLink, setSpreadsheetLink] = useState<string>(() => {
    try {
      return localStorage.getItem("spreadsheet_link") || "";
    } catch {
      return "";
    }
  });
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [sheetTitles, setSheetTitles] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<"idle" | "sheetsLoaded" | "headersLoaded" | "mapped">("idle");
  const [range, setRange] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_COMPLEMENT_RANGE) || "A1:Z1000";
    } catch {
      return "A1:Z1000";
    }
  });
  const [overrideClientId, setOverrideClientId] = useState<string>(() => {
    try {
      return (localStorage.getItem(LOCAL_STORAGE_KEY) || "");
    } catch {
      return "";
    }
  });

  const effectiveClientId = ENV_GOOGLE_CLIENT_ID || (overrideClientId || undefined);
  const isGoogleConfigured = !!effectiveClientId;

  // Seller fields (persisted to localStorage)
  const [sellerName, setSellerName] = useState<string>(() => localStorage.getItem("seller_name") || "");
  const [sellerRole, setSellerRole] = useState<string>(() => localStorage.getItem("seller_role") || "");
  const [sellerEmail, setSellerEmail] = useState<string>(() => localStorage.getItem("seller_email") || "");
  const [sellerPhone, setSellerPhone] = useState<string>(() => localStorage.getItem("seller_phone") || "");

  // --- Complement import states ---
  const [complementSheet, setComplementSheet] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LS_COMPLEMENT_SHEET) || null;
    } catch {
      return null;
    }
  });
  const [complementRange, setComplementRange] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_COMPLEMENT_RANGE) || "A1:Z1000";
    } catch {
      return "A1:Z1000";
    }
  });
  const [complementHeaders, setComplementHeaders] = useState<string[]>([]);
  const [complementPreviewRows, setComplementPreviewRows] = useState<any[][]>([]);
  const [complementKeyColumn, setComplementKeyColumn] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_COMPLEMENT_KEY_COLUMN) || "";
    } catch {
      return "";
    }
  });
  const [complementImporting, setComplementImporting] = useState(false);
  const [complementRowsCount, setComplementRowsCount] = useState<number | null>(null);

  // New: allow creating missing products from complement rows and choose price columns
  const [complementCreateMissing, setComplementCreateMissing] = useState<boolean>(true);
  const [complementPrice12Column, setComplementPrice12Column] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_COMPLEMENT_PRICE_12) || "";
    } catch {
      return "";
    }
  });
  const [complementPrice24Column, setComplementPrice24Column] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_COMPLEMENT_PRICE_24) || "";
    } catch {
      return "";
    }
  });
  // New columns for Com iDSecure / Sem iDSecure
  const [complementComIdsColumn, setComplementComIdsColumn] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_COMPLEMENT_COM_IDS) || "";
    } catch {
      return "";
    }
  });
  const [complementSemIdsColumn, setComplementSemIdsColumn] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_COMPLEMENT_SEM_IDS) || "";
    } catch {
      return "";
    }
  });
  // ---------------------------------

  useEffect(() => {
    const storedToken = localStorage.getItem("google_access_token");
    if (storedToken) {
      setAccessToken(storedToken);
      setConnected(true);
      (async () => {
        setLoading(true);
        try {
          const driveFiles = await googleClient.listDriveSpreadsheets(storedToken);
          setFiles(driveFiles.map((f: any) => ({ id: f.id, name: f.name })));
        } catch (err: any) {
          console.error("Failed to restore Google session:", err);
          localStorage.removeItem("google_access_token");
          setAccessToken(null);
          setConnected(false);
          toast.error("Sessão do Google expirada. Conecte novamente.");
        } finally {
          setLoading(false);
        }
      })();
    } else {
      const cached = localStorage.getItem("google_drive_files");
      if (cached) {
        try {
          setFiles(JSON.parse(cached));
        } catch {}
      }
    }
  }, []);

  // Persist mappings automatically when they change (per-spreadsheet if available, else global)
  useEffect(() => {
    try {
      if (spreadsheetId) {
        localStorage.setItem(`import_column_map_${spreadsheetId}`, JSON.stringify(mappings));
      } else {
        localStorage.setItem(`import_column_map`, JSON.stringify(mappings));
      }
    } catch (e) {
      console.warn("Failed to persist import mapping", e);
    }
  }, [mappings, spreadsheetId]);

  // Persist spreadsheet link to localStorage whenever it changes
  useEffect(() => {
    try {
      if (spreadsheetLink) {
        localStorage.setItem("spreadsheet_link", spreadsheetLink);
      } else {
        localStorage.removeItem("spreadsheet_link");
      }
    } catch (e) {
      console.warn("Failed to persist spreadsheet link", e);
    }
  }, [spreadsheetLink]);

  // Persist complement settings to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem(LS_COMPLEMENT_RANGE, complementRange || "");
      if (complementSheet) localStorage.setItem(LS_COMPLEMENT_SHEET, complementSheet);
      else localStorage.removeItem(LS_COMPLEMENT_SHEET);

      localStorage.setItem(LS_COMPLEMENT_KEY_COLUMN, complementKeyColumn || "");
      localStorage.setItem(LS_COMPLEMENT_PRICE_12, complementPrice12Column || "");
      localStorage.setItem(LS_COMPLEMENT_PRICE_24, complementPrice24Column || "");
      localStorage.setItem(LS_COMPLEMENT_COM_IDS, complementComIdsColumn || "");
      localStorage.setItem(LS_COMPLEMENT_SEM_IDS, complementSemIdsColumn || "");
    } catch (e) {
      console.warn("Failed to persist complement settings", e);
    }
  }, [complementRange, complementSheet, complementKeyColumn, complementPrice12Column, complementPrice24Column, complementComIdsColumn, complementSemIdsColumn]);

  // Auto-save seller fields as the user types (also keep Save button for manual control)
  useEffect(() => {
    try {
      localStorage.setItem("seller_name", sellerName);
      localStorage.setItem("seller_role", sellerRole);
      localStorage.setItem("seller_email", sellerEmail);
      localStorage.setItem("seller_phone", sellerPhone);
    } catch (e) {
      console.warn("Failed to auto-save seller fields", e);
    }
  }, [sellerName, sellerRole, sellerEmail, sellerPhone]);

  useEffect(() => {
    // If sheetTitles change and complementSheet not set, default it
    if (sheetTitles.length > 0 && !complementSheet) {
      setComplementSheet(sheetTitles[0]);
    }
  }, [sheetTitles, complementSheet]);

  function extractSpreadsheetId(input: string): string | null {
    if (!input) return null;
    const trimmed = input.trim();
    const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) return match[1];
    const rawMatch = trimmed.match(/[a-zA-Z0-9-_]{20,}/);
    if (rawMatch) return rawMatch[0];
    return null;
  }

  // Normalize header/field names for robust matching
  function normalizeForMatch(s?: string) {
    if (!s) return "";
    return String(s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .trim();
  }

  function loadSavedMappingForSpreadsheet(id?: string) {
    try {
      if (id) {
        const raw = localStorage.getItem(`import_column_map_${id}`);
        if (raw) return JSON.parse(raw);
      }
      const rawGlobal = localStorage.getItem("import_column_map");
      if (rawGlobal) return JSON.parse(rawGlobal);
    } catch (e) {
      console.warn("Failed to load saved mapping", e);
    }
    return null;
  }

  const handleConnect = async () => {
    if (!isGoogleConfigured) {
      toast.error("VITE_GOOGLE_CLIENT_ID não está definido. Defina via variável de ambiente ou cole um Client ID abaixo.");
      return;
    }

    setLoading(true);
    try {
      await googleClient.init();
      const tokenResp = await googleClient.requestAccessToken();
      if (tokenResp && tokenResp.access_token) {
        const token = tokenResp.access_token;
        setAccessToken(token);
        setConnected(true);
        localStorage.setItem("google_access_token", token);

        toast.success("Conectado ao Google com sucesso");

        const driveFiles = await googleClient.listDriveSpreadsheets(token);
        const mapped = driveFiles.map((f: any) => ({ id: f.id, name: f.name }));
        setFiles(mapped);
        try {
          localStorage.setItem("google_drive_files", JSON.stringify(mapped));
        } catch (e) {}
      } else {
        toast.error("Não foi possível obter token");
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao conectar com Google: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (accessToken) {
      try {
        await googleClient.revokeToken(accessToken);
      } catch (err) {
        console.warn("revoke failed", err);
      }
    }
    setAccessToken(null);
    setConnected(false);
    setFiles([]);
    setSpreadsheetId(null);
    setSheetTitles([]);
    setSelectedSheet(null);
    setHeaders([]);
    setMappings({});
    setStage("idle");
    localStorage.removeItem("google_access_token");
    localStorage.removeItem("google_drive_files");
    toast.success("Desconectado do Google");
  };

  const handleRefreshFiles = async () => {
    if (!accessToken) {
      toast.error("Você precisa conectar ao Google primeiro.");
      return;
    }
    setLoading(true);
    try {
      const driveFiles = await googleClient.listDriveSpreadsheets(accessToken);
      const mapped = driveFiles.map((f: any) => ({ id: f.id, name: f.name }));
      setFiles(mapped);
      try {
        localStorage.setItem("google_drive_files", JSON.stringify(mapped));
      } catch (e) {}
      toast.success("Arquivos atualizados");
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao listar arquivos: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSheets = async () => {
    const id = extractSpreadsheetId(spreadsheetLink);
    if (!id) {
      toast.error("Não foi possível extrair o ID da planilha. Cole o link completo ou ID.");
      return;
    }
    if (!accessToken) {
      toast.error("Você precisa conectar ao Google primeiro.");
      return;
    }

    setLoading(true);
    try {
      const titles = await googleClient.getSpreadsheetSheets(accessToken, id);
      setSpreadsheetId(id);
      setSheetTitles(titles);
      setSelectedSheet(titles[0] ?? null);
      setStage("sheetsLoaded");
      toast.success(`Encontradas ${titles.length} abas`);

      // If there's a saved mapping for this spreadsheet, automatically attempt to load headers and apply it.
      const saved = loadSavedMappingForSpreadsheet(id);
      if (saved) {
        // Auto-load headers which will apply saved mapping when headers are available
        await handleLoadHeaders(); // handleLoadHeaders will read saved mapping from storage
      }
    } catch (err: any) {
      console.error("Erro ao obter abas:", err);
      toast.error("Erro ao obter abas da planilha: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleLoadHeaders = async () => {
    if (!accessToken || !spreadsheetId || !selectedSheet) {
      toast.error("Selecione a planilha e a aba primeiro.");
      return;
    }
    setLoading(true);
    try {
      const res = await googleClient.getSpreadsheetValues(accessToken, spreadsheetId, `${selectedSheet}!1:1`);
      const values: any[] = res.values || [];
      const row = values[0] || [];
      const headerStrings = row.map((h: any) => String(h).trim());
      setHeaders(headerStrings);

      // Attempt to load saved mapping for this spreadsheet or global
      const saved = loadSavedMappingForSpreadsheet(spreadsheetId) || {};

      // Build an initial mapping: prefer saved values that exist in headers,
      // else try to auto-match by normalizing header vs field labels/keys.
      const initial: Record<string, string> = {};
      const headerNorms = headerStrings.map((h) => normalizeForMatch(h));

      for (const f of MAPPING_FIELDS) {
        // If saved explicit and header exists, use it
        if (saved && saved[f.key]) {
          const candidate = String(saved[f.key]);
          if (headerStrings.includes(candidate)) {
            initial[f.key] = candidate;
            continue;
          }
        }

        // Auto-match heuristics:
        const targetNorms = [
          normalizeForMatch(f.label),
          normalizeForMatch(f.key),
          normalizeForMatch(f.key.replace(/_/g, "")),
        ];

        // direct header with same normalized string
        let foundHeader: string | undefined;
        for (let i = 0; i < headerStrings.length; i++) {
          const hnorm = headerNorms[i];
          if (targetNorms.includes(hnorm)) {
            foundHeader = headerStrings[i];
            break;
          }
        }

        // substring heuristics (header includes label words)
        if (!foundHeader) {
          for (let i = 0; i < headerStrings.length; i++) {
            const hnorm = headerNorms[i];
            for (const t of targetNorms) {
              if (!t) continue;
              if (hnorm.includes(t) || t.includes(hnorm)) {
                foundHeader = headerStrings[i];
                break;
              }
            }
            if (foundHeader) break;
          }
        }

        // Some helpful synonyms
        if (!foundHeader) {
          if (f.key === "description") {
            const idx = headerStrings.findIndex(h => normalizeForMatch(h).includes("descr") || normalizeForMatch(h).includes("description") || normalizeForMatch(h).includes("product"));
            if (idx >= 0) foundHeader = headerStrings[idx];
          }
          if (f.key === "part_number") {
            const idx = headerStrings.findIndex(h => normalizeForMatch(h).includes("part") || normalizeForMatch(h).includes("partnumber") || normalizeForMatch(h).includes("part_number"));
            if (idx >= 0) foundHeader = headerStrings[idx];
          }
          if (f.key === "value_12m" || f.key === "value_24m") {
            const idx = headerStrings.findIndex(h => normalizeForMatch(h).includes("valor") || normalizeForMatch(h).includes("12") || normalizeForMatch(h).includes("24"));
            if (idx >= 0) foundHeader = headerStrings[idx];
          }
        }

        if (foundHeader) {
          initial[f.key] = foundHeader;
        } else {
          initial[f.key] = saved && saved[f.key] ? saved[f.key] : "";
        }
      }

      setMappings(initial);

      // Auto-detect reasonable default price columns for complement import
      const detectPriceCol = (candidates: string[], prefer12 = true) => {
        if (!candidates || candidates.length === 0) return "";
        // prefer header names that include '12' or '12m' / '24' or '24m' or 'valor'
        const norm = candidates.map((h) => h.toLowerCase());
        if (prefer12) {
          const idx12 = norm.findIndex((h) => h.includes("12") || h.includes("12m") || (h.includes("valor") && h.includes("12")));
          if (idx12 >= 0) return candidates[idx12];
          const idxVal = norm.findIndex((h) => h.includes("valor") || h.includes("price") || h.includes("preco"));
          if (idxVal >= 0) return candidates[idxVal];
        } else {
          const idx24 = norm.findIndex((h) => h.includes("24") || h.includes("24m"));
          if (idx24 >= 0) return candidates[idx24];
          const idxVal = norm.findIndex((h) => h.includes("valor") || h.includes("price") || h.includes("preco"));
          if (idxVal >= 0) return candidates[idxVal];
        }
        return "";
      };

      const default12 = detectPriceCol(headerStrings, true);
      const default24 = detectPriceCol(headerStrings, false);
      setComplementPrice12Column((prev) => prev || default12);
      setComplementPrice24Column((prev) => prev || default24);

      // Try to auto-detect "Com iDSecure" / "Sem iDSecure" columns (common naming variations)
      const lower = headerStrings.map((h) => h.toLowerCase());
      const findByCandidates = (cands: string[]) => {
        for (const cand of cands) {
          const idx = lower.findIndex((h) => h.includes(cand));
          if (idx >= 0) return headerStrings[idx];
        }
        return "";
      };
      const comCandidates = ["com idsecure", "com id secure", "com ids", "com id", "com idsecure", "comids", "com_idsecure", "com", "com ids e", "comidsvalor"];
      const semCandidates = ["sem idsecure", "sem id secure", "sem ids", "sem id", "semid", "sem", "semidsvalor"];
      const foundCom = findByCandidates(comCandidates);
      const foundSem = findByCandidates(semCandidates);
      setComplementComIdsColumn((prev) => prev || foundCom);
      setComplementSemIdsColumn((prev) => prev || foundSem);

      setStage("headersLoaded");
      toast.success("Cabeçalhos carregados e mapeamento inicial aplicado (pode ser ajustado).");
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao carregar cabeçalhos: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  // New: read the actual range (sheet!range) and populate complementHeaders + preview rows.
  const handleReadRange = async () => {
    if (!accessToken || !spreadsheetId || !complementSheet) {
      toast.error("Selecione planilha e aba complementar antes de ler o intervalo.");
      return;
    }

    setLoading(true);
    try {
      const fullRange = `${complementSheet}!${complementRange}`;
      const res = await googleClient.getSpreadsheetValues(accessToken, spreadsheetId, fullRange);
      const values: any[][] = res.values || [];
      if (values.length === 0) {
        toast.error("Intervalo vazio ou inválido.");
        setLoading(false);
        return;
      }

      const headerRow: string[] = (values[0] || []).map((h: any) => String(h).trim());
      const dataRows = values.slice(1);

      setComplementHeaders(headerRow);
      setComplementPreviewRows(dataRows.slice(0, 5));
      setComplementRowsCount(dataRows.length);

      // Do not alter mapping state (mappings) here — this action is only a preview of the selected range.
      toast.success(`Intervalo carregado: ${dataRows.length} linhas (pré-visualizando até 5).`);
    } catch (err: any) {
      console.error("Erro ao ler intervalo:", err);
      toast.error("Falha ao ler intervalo: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleSetMapping = (fieldKey: string, headerName: string) => {
    setMappings(prev => ({ ...prev, [fieldKey]: headerName }));
  };

  /**
   * Complement import changed: no merging.
   * Behavior:
   * - For every data row in the complement range, create a NEW product entry (if complementCreateMissing is true).
   * - The new product will include:
   *    - sku generated if key column is not provided or not found
   *    - description built from row columns
   *    - value_12m / value_24m extracted from selected complement price columns (or auto-detected)
   *    - additional fields price_com_iDSecure and price_sem_iDSecure extracted from the two new selects (if provided)
   * - Do not modify or merge with existing importedProducts entries.
   */
  const handleImportComplement = async () => {
    if (!accessToken || !spreadsheetId || !complementSheet) {
      toast.error("Selecione planilha e aba complementar antes de importar.");
      return;
    }

    setComplementImporting(true);
    try {
      const fullRange = `${complementSheet}!${complementRange}`;
      const res = await googleClient.getSpreadsheetValues(accessToken, spreadsheetId, fullRange);
      const values: any[][] = res.values || [];
      if (values.length <= 1) {
        toast.error("Intervalo complementar não contém dados (além do cabeçalho).");
        setComplementImporting(false);
        return;
      }

      const headerRow: string[] = (values[0] || []).map((h: any) => String(h).trim());
      const keyIndex = complementKeyColumn ? headerRow.findIndex(h => String(h).trim() === complementKeyColumn) : -1;

      const dataRows = values.slice(1);

      // Load existing importedProducts (we will append new items, not merge)
      const raw = localStorage.getItem("importedProducts");
      let imported: any[] = [];
      if (raw) {
        try {
          imported = JSON.parse(raw);
        } catch {
          imported = [];
        }
      }
      if (!Array.isArray(imported)) imported = [];

      let createdCount = 0;

      // helper to get column value by header name
      const getColValue = (row: any[], colName: string) => {
        if (!colName) return "";
        const idx = headerRow.findIndex(h => h === colName);
        if (idx === -1) return "";
        return row[idx] ?? "";
      };

      for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
        const row = dataRows[rowIdx];
        const keyRaw = keyIndex >= 0 ? row[keyIndex] : undefined;
        const keyVal = keyRaw ? String(keyRaw ?? "").trim() : "";

        // If not creating missing, skip (user opted out)
        if (!complementCreateMissing) continue;

        // Build description from several non-empty columns (excluding key)
        const descParts: string[] = [];
        for (let c = 0; c < headerRow.length; c++) {
          if (c === keyIndex) continue;
          const val = row[c];
          if (val !== undefined && val !== null && String(val).trim() !== "") {
            const header = headerRow[c];
            descParts.push(`${header}: ${String(val).trim()}`);
            if (descParts.length >= 4) break;
          }
        }
        const description = descParts.join(" · ") || (keyVal || `complement-${Math.random().toString(36).slice(2,8)}`);

        // Determine prices using selected complement price columns, falling back to auto-detection
        const findPriceFromColumn = (colName: string) => {
          if (!colName) return 0;
          const v = getColValue(row, colName);
          return parseSpreadsheetNumber(v ?? 0);
        };

        let value12 = findPriceFromColumn(complementPrice12Column);
        let value24 = findPriceFromColumn(complementPrice24Column);

        // If not provided, try auto-detect: look for any numeric-looking column in the row
        if ((!value12 || value12 === 0) && (!value24 || value24 === 0)) {
          for (let c = 0; c < headerRow.length; c++) {
            if (c === keyIndex) continue;
            const n = parseSpreadsheetNumber(row[c]);
            if (n > 0) {
              if (!value12 || value12 === 0) value12 = n;
              else if (!value24 || value24 === 0) value24 = n;
            }
          }
        }

        // Extract Com/Sem iDSecure values if columns selected
        const comIdsRaw = complementComIdsColumn ? getColValue(row, complementComIdsColumn) : "";
        const semIdsRaw = complementSemIdsColumn ? getColValue(row, complementSemIdsColumn) : "";
        const priceComIds = parseSpreadsheetNumber(comIdsRaw);
        const priceSemIds = parseSpreadsheetNumber(semIdsRaw);

        // If no key provided or not found, generate a unique SKU/part_number
        const generatedKey = keyVal || `comp-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString().slice(-6)}`;

        const newProd: any = {
          id: `comp-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`,
          sku: generatedKey,
          category: "Controladores Porta",
          model: String(keyVal || generatedKey),
          colors: [],
          biometrics: false,
          facial: "None",
          proximity: "None",
          urn: false,
          qr: false,
          description,
          value_12m: Number(value12 || 0),
          value_24m: Number(value24 || 0),
          part_number: String(generatedKey),
          status: "Ativo",
          // Keep complement-specific pricing fields
          price_com_iDSecure: priceComIds > 0 ? priceComIds : undefined,
          price_sem_iDSecure: priceSemIds > 0 ? priceSemIds : undefined,
          // store raw complement fields for later usage
          complementMeta: headerRow.reduce((acc: any, h, idx) => {
            acc[h] = row[idx] ?? "";
            return acc;
          }, {} as Record<string, any>),
          _complementSource: true,
        };

        imported.push(newProd);
        createdCount++;
      }

      // Save appended importedProducts back to localStorage
      try {
        localStorage.setItem("importedProducts", JSON.stringify(imported));
      } catch (e) {
        console.warn("Failed to persist importedProducts after complement import", e);
      }

      toast.success(`Importação complementar concluída: ${createdCount} novos produtos criados (sem mesclagem).`);
      setComplementRowsCount(dataRows.length);
      setComplementPreviewRows(dataRows.slice(0, 5));
    } catch (err: any) {
      console.error("Erro ao importar complemento:", err);
      toast.error("Falha na importação complementar: " + (err?.message || err));
    } finally {
      setComplementImporting(false);
    }
  };

  // ----------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Configurações</h1>
            <p className="text-gray-600">Conecte sua conta Google para importar uma tabela de produtos (Drive / Sheets)</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/")}>
              Voltar ao Orçamento
            </Button>
          </div>
        </div>

        {!isGoogleConfigured && (
          <div className="mb-6 p-4 border rounded bg-yellow-50 text-yellow-900">
            <strong>Variável ausente:</strong> VITE_GOOGLE_CLIENT_ID não está definida.
            <div className="text-sm mt-2">
              Você pode definir a variável de ambiente VITE_GOOGLE_CLIENT_ID na sua máquina/host, ou colar um Client ID abaixo para uso local (salvo em localStorage).
              <div className="mt-2">
                <Label>Client ID (opcional, para desenvolvimento)</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    placeholder="Cole aqui o Client ID do Google (ex: 1234-abcdefg.apps.googleusercontent.com)"
                    value={overrideClientId}
                    onChange={(e) => setOverrideClientId(e.target.value)}
                  />
                  <Button onClick={() => { try { localStorage.setItem(LOCAL_STORAGE_KEY, overrideClientId); toast.success("Client ID salvo"); } catch {} }}>Salvar</Button>
                  <Button variant="outline" onClick={() => { localStorage.removeItem(LOCAL_STORAGE_KEY); setOverrideClientId(""); toast.success("Client ID removido"); }}>Limpar</Button>
                </div>
                <div className="mt-2 text-sm">
                  Depois de salvar, tente clicar em "Conectar ao Google". O Client ID será lido do armazenamento local.
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Integração Google</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Para conectar, clique em "Conectar ao Google" e conceda permissão de leitura ao Google Drive / Sheets.
                </p>

                <div className="flex gap-2">
                  {!connected ? (
                    <Button onClick={handleConnect} disabled={loading || !isGoogleConfigured}>
                      {loading ? "Conectando..." : "Conectar ao Google"}
                    </Button>
                  ) : (
                    <Button variant="destructive" onClick={handleDisconnect} disabled={loading}>
                      Desconectar
                    </Button>
                  )}

                  <Button onClick={handleRefreshFiles} disabled={!connected || loading}>
                    Atualizar arquivos
                  </Button>
                </div>

                <div className="pt-4">
                  <Label>Link da planilha (Sheets)</Label>
                  <Input
                    placeholder="Cole o link da planilha (https://docs.google.com/spreadsheets/d/ID/...) ou cole o ID"
                    value={spreadsheetLink}
                    onChange={(e) => setSpreadsheetLink(e.target.value)}
                    className="mt-2"
                  />
                  <div className="flex gap-2 mt-2">
                    <Button onClick={handleLoadSheets} disabled={!connected || loading || !spreadsheetLink}>
                      Carregar Abas da Planilha
                    </Button>
                    <Button onClick={() => {
                      setSpreadsheetLink("");
                      setSpreadsheetId(null);
                      setSheetTitles([]);
                      setSelectedSheet(null);
                      setHeaders([]);
                      setMappings({});
                      setStage("idle");
                      try {
                        localStorage.removeItem("spreadsheet_link");
                      } catch {}
                    }} variant="outline">
                      Limpar
                    </Button>
                  </div>

                  {files.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm text-muted-foreground">Ou escolha uma planilha encontrada no seu Drive:</p>

                      <div className="flex items-center gap-2 mt-2">
                        <Input
                          placeholder="Pesquisar por nome ou ID do arquivo"
                          value={fileSearch}
                          onChange={(e) => setFileSearch(e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setFileSearch("")}
                        >
                          Limpar
                        </Button>
                      </div>

                      <div className="space-y-2 mt-2 max-h-40 overflow-auto">
                        {files.filter(f => {
                          const q = fileSearch.trim().toLowerCase();
                          return !q || f.name.toLowerCase().includes(q) || f.id.toLowerCase().includes(q);
                        }).map((f) => (
                          <div key={f.id} className="flex items-center justify-between border rounded px-3 py-2">
                            <div className="truncate pr-4">{f.name}</div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => { setSpreadsheetLink(`https://docs.google.com/spreadsheets/d/${f.id}`); toast.success("Link preenchido"); }}
                              >
                                Usar link
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {stage === "sheetsLoaded" && (
                  <div className="space-y-2 pt-4 border-t">
                    <Label>Selecione a aba (sheet)</Label>
                    <div className="flex gap-2 items-center">
                      <select
                        className="border rounded px-2 py-1"
                        value={selectedSheet ?? ""}
                        onChange={(e) => setSelectedSheet(e.target.value)}
                      >
                        {sheetTitles.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <Button onClick={handleLoadHeaders} disabled={!selectedSheet || loading}>
                        Carregar Cabeçalhos (1ª linha)
                      </Button>
                      <Button variant="outline" onClick={() => {
                        if (spreadsheetId) {
                          localStorage.removeItem(`import_column_map_${spreadsheetId}`);
                        }
                        localStorage.removeItem("import_column_map");
                        setMappings({});
                        toast.success("Mapeamento salvo removido");
                      }}>Limpar Mapeamento Salvo</Button>
                    </div>
                  </div>
                )}

                {stage === "headersLoaded" && (
                  <div className="space-y-4 pt-4 border-t">
                    <Label>Range de importação dentro da aba</Label>
                    <Input value={complementRange} onChange={(e) => setComplementRange(e.target.value)} />
                    <p className="text-sm text-muted-foreground">Exemplo: A1:Z1000 (será prefixado com a aba ao buscar)</p>

                    <div>
                      <h3 className="font-semibold mb-2">Mapeie as colunas</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {MAPPING_FIELDS.map((field) => (
                          <div key={field.key} className="space-y-1">
                            <Label>{field.label}</Label>
                            <select
                              className="border rounded w-full px-2 py-1"
                              value={mappings[field.key] ?? ""}
                              onChange={(e) => handleSetMapping(field.key, e.target.value)}
                            >
                              <option value="">-- selecionar coluna --</option>
                              {headers.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between items-center mt-4 gap-2">
                        <div className="flex items-center gap-3">
                          <Button onClick={() => {
                            const initial: Record<string,string> = {};
                            MAPPING_FIELDS.forEach(f => initial[f.key] = "");
                            setMappings(initial);
                          }} variant="outline">
                            Resetar Mapeamento
                          </Button>

                          <div className="flex items-center space-x-2">
                            <input type="checkbox" id="createMissing" checked={complementCreateMissing} onChange={(e) => setComplementCreateMissing(e.target.checked)} />
                            <label htmlFor="createMissing" className="text-sm">Criar produtos a partir do intervalo complementar</label>
                          </div>
                        </div>

                        <div className="flex gap-2 items-center">
                          <div className="flex items-center">
                            <Label className="mr-2">Coluna preço 12m</Label>
                            <select value={complementPrice12Column} onChange={(e) => setComplementPrice12Column(e.target.value)} className="border rounded px-2 py-1">
                              <option value="">(auto)</option>
                              {headers.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                          </div>

                          <div className="flex items-center">
                            <Label className="mr-2">Coluna preço 24m</Label>
                            <select value={complementPrice24Column} onChange={(e) => setComplementPrice24Column(e.target.value)} className="border rounded px-2 py-1">
                              <option value="">(auto)</option>
                              {headers.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                          </div>

                          <Button onClick={handleImportComplement} disabled={loading}>
                            Importar com Mapeamento
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {stage === "mapped" && (
                  <div className="p-3 bg-green-50 border rounded text-green-900">
                    Importação concluída e salva em localStorage como <strong>importedProducts</strong>. Vá para a página inicial para ver o catálogo atualizado.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Complement import card */}
          <Card>
            <CardHeader>
              <CardTitle>Importação Complementar (outra aba)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Use esta seção para trazer colunas adicionais de outra aba da mesma planilha e criar novos produtos (sem mesclar com os já importados). Se uma linha complementar não tiver correspondência, será criado um novo produto com base nas colunas da linha. A coluna chave (SKU/part_number) é opcional — se não informada, será gerado um identificador interno para cada linha.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Aba (sheet)</Label>
                    <select
                      className="border rounded w-full px-2 py-1"
                      value={complementSheet ?? ""}
                      onChange={(e) => setComplementSheet(e.target.value)}
                    >
                      <option value="">-- selecione a aba --</option>
                      {sheetTitles.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label>Intervalo (range)</Label>
                    <Input value={complementRange} onChange={(e) => setComplementRange(e.target.value)} />
                    <div className="text-sm text-muted-foreground">Ex: A1:Z1000 (use a 1ª linha como cabeçalho)</div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={async () => {
                    await handleReadRange();
                  }} disabled={!connected || !spreadsheetId || !complementSheet}>
                    Ler intervalo (range)
                  </Button>
                  <Button onClick={() => {
                    setComplementHeaders([]);
                    setComplementPreviewRows([]);
                    setComplementKeyColumn("");
                    setComplementRowsCount(null);
                    setComplementPrice12Column("");
                    setComplementPrice24Column("");
                    setComplementComIdsColumn("");
                    setComplementSemIdsColumn("");
                    localStorage.removeItem(LS_COMPLEMENT_RANGE);
                    localStorage.removeItem(LS_COMPLEMENT_KEY_COLUMN);
                    localStorage.removeItem(LS_COMPLEMENT_PRICE_12);
                    localStorage.removeItem(LS_COMPLEMENT_PRICE_24);
                    localStorage.removeItem(LS_COMPLEMENT_COM_IDS);
                    localStorage.removeItem(LS_COMPLEMENT_SEM_IDS);
                  }} variant="outline">Limpar Prévia</Button>
                </div>

                {complementRowsCount !== null && (
                  <div className="text-sm text-muted-foreground">
                    Linhas no intervalo (excluindo cabeçalho): {complementRowsCount}
                  </div>
                )}

                {complementPreviewRows.length > 0 && (
                  <div className="overflow-auto border rounded">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          {complementHeaders.map((h, i) => (
                            <th key={i} className="text-left px-2 py-1">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {complementPreviewRows.map((r, ri) => (
                          <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                            {complementHeaders.map((_, ci) => (
                              <td key={ci} className="px-2 py-1">{String(r[ci] ?? "")}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {complementHeaders.length > 0 && (
                  <div className="space-y-2">
                    <Label>Coluna chave (SKU / part number) — opcional</Label>
                    <select className="border rounded w-full px-2 py-1" value={complementKeyColumn} onChange={(e) => setComplementKeyColumn(e.target.value)}>
                      <option value="">(gerar automaticamente)</option>
                      {complementHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label>Coluna preço 12m (opcional)</Label>
                        <select value={complementPrice12Column} onChange={(e) => setComplementPrice12Column(e.target.value)} className="border rounded px-2 py-1 w-full">
                          <option value="">(auto)</option>
                          {complementHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>

                      <div>
                        <Label>Coluna preço 24m (opcional)</Label>
                        <select value={complementPrice24Column} onChange={(e) => setComplementPrice24Column(e.target.value)} className="border rounded px-2 py-1 w-full">
                          <option value="">(auto)</option>
                          {complementHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                      <div>
                        <Label>Coluna "Com iDSecure" (opcional)</Label>
                        <select value={complementComIdsColumn} onChange={(e) => setComplementComIdsColumn(e.target.value)} className="border rounded px-2 py-1 w-full">
                          <option value="">(nenhuma)</option>
                          {complementHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                        <div className="text-sm text-muted-foreground mt-1">Selecione a coluna que contém o preço/composição para clientes com iDSecure.</div>
                      </div>

                      <div>
                        <Label>Coluna "Sem iDSecure" (opcional)</Label>
                        <select value={complementSemIdsColumn} onChange={(e) => setComplementSemIdsColumn(e.target.value)} className="border rounded px-2 py-1 w-full">
                          <option value="">(nenhuma)</option>
                          {complementHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                        <div className="text-sm text-muted-foreground mt-1">Selecione a coluna que contém o preço/composição para clientes sem iDSecure.</div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 mt-3">
                      <Button onClick={handleImportComplement} disabled={complementImporting}>
                        {complementImporting ? "Importando..." : "Importar e Criar Novos Itens"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Seller configuration card */}
          <Card>
            <CardHeader>
              <CardTitle>Dados do Vendedor (preenchidos no slide 4)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome do Vendedor</Label>
                  <Input value={sellerName} onChange={(e) => setSellerName(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>Cargo</Label>
                  <Input value={sellerRole} onChange={(e) => setSellerRole(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input value={sellerEmail} onChange={(e) => setSellerEmail(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={sellerPhone} onChange={(e) => setSellerPhone(e.target.value)} />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <Button onClick={() => { localStorage.setItem("seller_name", sellerName); localStorage.setItem("seller_role", sellerRole); localStorage.setItem("seller_email", sellerEmail); localStorage.setItem("seller_phone", sellerPhone); toast.success("Dados do vendedor salvos."); }}>Salvar Dados do Vendedor</Button>
                <Button variant="outline" onClick={() => { localStorage.removeItem("seller_name"); localStorage.removeItem("seller_role"); localStorage.removeItem("seller_email"); localStorage.removeItem("seller_phone"); setSellerName(""); setSellerRole(""); setSellerEmail(""); setSellerPhone(""); toast.success("Dados do vendedor removidos."); }}>Limpar Dados</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}