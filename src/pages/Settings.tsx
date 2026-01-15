"use client";

import React, { useEffect, useState } from "react";
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
const LS_COMPLEMENT_COM_IDS = "complement_com_ids_column";
const LS_COMPLEMENT_SEM_IDS = "complement_sem_ids_column";

// Stored bases key
const LS_PRODUCT_BASES = "product_bases";

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

type StoredBase = {
  id: string;
  name: string;
  type: "catalog" | "product"; // catalog = bases for pricing (appear in Catalog), product = lookup by code
  headers: string[];
  rows: any[][]; // raw rows (excluding header)
  createdAt: string;
  // optional columns to help identify SKUs/prices when importing/using the base
  keyColumn?: string | null; // SKU / part number column name (optional)
  comIdsColumn?: string | null; // column used for 'Com iDSecure' price (optional)
  semIdsColumn?: string | null; // column used for 'Sem iDSecure' price (optional)
};

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

  // --- Complement import states (used for catalog/values bases) ---
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

  // Complement import options
  const [complementCreateMissing, setComplementCreateMissing] = useState<boolean>(true);
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

  // Bases stored in localStorage (multiple)
  const [bases, setBases] = useState<StoredBase[]>(() => {
    try {
      const raw = localStorage.getItem(LS_PRODUCT_BASES);
      if (!raw) return [];
      return JSON.parse(raw) as StoredBase[];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(LS_PRODUCT_BASES, JSON.stringify(bases));
      // Notify other parts of the app that bases changed so they can reload
      try {
        window.dispatchEvent(new Event("product_bases_changed"));
      } catch {}
    } catch (e) {
      console.warn("Failed to persist product_bases", e);
    }
  }, [bases]);

  // --- Google auth error helpers ---
  function isGoogleAuthError(err: any) {
    const msg = String(err?.message ?? err ?? "").toLowerCase();
    return msg.includes("401") || msg.includes("unauthenticated") || msg.includes("invalid authentication") || msg.includes("invalid authentication credentials") || msg.includes("expected oauth 2 access token");
  }

  function clearGoogleSessionAndNotify() {
    try {
      localStorage.removeItem("google_access_token");
    } catch {}
    setAccessToken(null);
    setConnected(false);
    toast.error("Sessão do Google expirada ou inválida. Conecte novamente.");
  }

  // Initialize Google cached state
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
          if (isGoogleAuthError(err)) {
            clearGoogleSessionAndNotify();
          } else {
            console.error("Failed to restore Google session:", err);
            toast.error("Falha ao restaurar sessão do Google. Conecte novamente.");
          }
          localStorage.removeItem("google_access_token");
          setAccessToken(null);
          setConnected(false);
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

  // Persist mappings and small preferences
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

  useEffect(() => {
    try {
      localStorage.setItem(LS_COMPLEMENT_RANGE, complementRange || "");
      if (complementSheet) localStorage.setItem(LS_COMPLEMENT_SHEET, complementSheet);
      else localStorage.removeItem(LS_COMPLEMENT_SHEET);

      localStorage.setItem(LS_COMPLEMENT_KEY_COLUMN, complementKeyColumn || "");
      localStorage.setItem(LS_COMPLEMENT_COM_IDS, complementComIdsColumn || "");
      localStorage.setItem(LS_COMPLEMENT_SEM_IDS, complementSemIdsColumn || "");
    } catch (e) {
      console.warn("Failed to persist complement settings", e);
    }
  }, [complementRange, complementSheet, complementKeyColumn, complementComIdsColumn, complementSemIdsColumn]);

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
      if (isGoogleAuthError(err)) {
        clearGoogleSessionAndNotify();
      } else {
        console.error(err);
        toast.error("Erro ao conectar com Google: " + (err?.message || err));
      }
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
      if (isGoogleAuthError(err)) {
        clearGoogleSessionAndNotify();
        return;
      }
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
    } catch (err: any) {
      if (isGoogleAuthError(err)) {
        clearGoogleSessionAndNotify();
        return;
      }
      console.error("Erro ao obter abas:", err);
      toast.error("Erro ao obter abas da planilha: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleLoadHeaders = async () => {
    // This function is generic and will use `selectedSheet` + `spreadsheetId`
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
        if (saved && saved[f.key]) {
          const candidate = String(saved[f.key]);
          if (headerStrings.includes(candidate)) {
            initial[f.key] = candidate;
            continue;
          }
        }

        const targetNorms = [
          normalizeForMatch(f.label),
          normalizeForMatch(f.key),
          normalizeForMatch(f.key.replace(/_/g, "")),
        ];

        let foundHeader: string | undefined;
        for (let i = 0; i < headerStrings.length; i++) {
          const hnorm = headerNorms[i];
          if (targetNorms.includes(hnorm)) {
            foundHeader = headerStrings[i];
            break;
          }
        }

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

        if (foundHeader) initial[f.key] = foundHeader;
        else initial[f.key] = saved && saved[f.key] ? saved[f.key] : "";
      }

      setMappings(initial);
      setStage("headersLoaded");
      toast.success("Cabeçalhos carregados — ajuste mapeamentos se desejar.");
    } catch (err: any) {
      if (isGoogleAuthError(err)) {
        clearGoogleSessionAndNotify();
        return;
      }
      console.error(err);
      toast.error("Erro ao carregar cabeçalhos: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  // Read range preview (used for catalog/values base preview)
  const handleReadRange = async () => {
    if (!accessToken || !spreadsheetId || !complementSheet) {
      toast.error("Selecione planilha e aba antes de ler o intervalo.");
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

      toast.success(`Intervalo carregado: ${dataRows.length} linhas (pré-visualizando até 5).`);
    } catch (err: any) {
      if (isGoogleAuthError(err)) {
        clearGoogleSessionAndNotify();
        return;
      }
      console.error("Erro ao ler intervalo:", err);
      toast.error("Falha ao ler intervalo: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleSetMapping = (fieldKey: string, headerName: string) => {
    setMappings(prev => ({ ...prev, [fieldKey]: headerName }));
  };

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

        if (!complementCreateMissing) continue;

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

        // Try to detect numeric values in the row to pick prices (fallback)
        let value12 = 0;
        let value24 = 0;
        for (let c = 0; c < headerRow.length; c++) {
          if (c === keyIndex) continue;
          const parsed = parseSpreadsheetNumber(row[c]);
          if (parsed > 0) {
            if (!value12) value12 = parsed;
            else if (!value24) value24 = parsed;
            // keep scanning to find 1-2 numeric candidates
          }
        }

        const comIdsRaw = complementComIdsColumn ? getColValue(row, complementComIdsColumn) : "";
        const semIdsRaw = complementSemIdsColumn ? getColValue(row, complementSemIdsColumn) : "";
        const priceComIds = parseSpreadsheetNumber(comIdsRaw);
        const priceSemIds = parseSpreadsheetNumber(semIdsRaw);

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
          price_com_iDSecure: priceComIds > 0 ? priceComIds : undefined,
          price_sem_iDSecure: priceSemIds > 0 ? priceSemIds : undefined,
          complementMeta: headerRow.reduce((acc: any, h, idx) => {
            acc[h] = row[idx] ?? "";
            return acc;
          }, {} as Record<string, any>),
          _complementSource: true,
        };

        imported.push(newProd);
        createdCount++;
      }

      try {
        localStorage.setItem("importedProducts", JSON.stringify(imported));
      } catch (e) {
        console.warn("Failed to persist importedProducts after complement import", e);
      }

      toast.success(`Importação complementar concluída: ${createdCount} novos produtos criados (sem mesclagem).`);
      setComplementRowsCount(dataRows.length);
      setComplementPreviewRows(dataRows.slice(0, 5));
    } catch (err: any) {
      if (isGoogleAuthError(err)) {
        clearGoogleSessionAndNotify();
        setComplementImporting(false);
        return;
      }
      console.error("Erro ao importar complemento:", err);
      toast.error("Falha na importação complementar: " + (err?.message || err));
    } finally {
      setComplementImporting(false);
    }
  };

  // Read full range and return parsed header + rows (used when saving base)
  const fetchFullRange = async () => {
    if (!accessToken || !spreadsheetId || !complementSheet) {
      throw new Error("Selecione planilha e aba antes de salvar como base");
    }
    setLoading(true);
    try {
      const fullRange = `${complementSheet}!${complementRange}`;
      const res = await googleClient.getSpreadsheetValues(accessToken, spreadsheetId, fullRange);
      const values: any[][] = res.values || [];
      if (values.length === 0) throw new Error("Intervalo vazio");
      const headerRow: string[] = (values[0] || []).map((h: any) => String(h).trim());
      const dataRows = values.slice(1);
      return { headerRow, dataRows };
    } catch (err: any) {
      if (isGoogleAuthError(err)) {
        clearGoogleSessionAndNotify();
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBase = async (name: string, type: StoredBase["type"]) => {
    if (!name || name.trim().length === 0) {
      toast.error("Informe um nome para a base");
      return;
    }

    try {
      const { headerRow, dataRows } = await fetchFullRange();
      const base: StoredBase = {
        id: `base-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`,
        name: name.trim(),
        type,
        headers: headerRow,
        rows: dataRows,
        createdAt: new Date().toISOString(),
        // Save optional columns so downstream pages know which column is the SKU/key and price columns
        keyColumn: complementKeyColumn || null,
        comIdsColumn: complementComIdsColumn || null,
        semIdsColumn: complementSemIdsColumn || null,
      };
      setBases((prev) => [base, ...prev]);
      toast.success(`Base "${base.name}" salva (${base.type}) com ${dataRows.length} linhas`);
    } catch (err: any) {
      if (isGoogleAuthError(err)) {
        // already handled in fetchFullRange via clearGoogleSessionAndNotify
        return;
      }
      console.error("save base failed", err);
      toast.error("Falha ao salvar a base: " + (err?.message || err));
    }
  };

  // New helper: save selectedSheet as a product base (reads A1:Z1000)
  const handleSaveProductBase = async (name: string) => {
    if (!selectedSheet || !spreadsheetId || !accessToken) {
      toast.error("Selecione a planilha e a aba antes de salvar a base de produtos.");
      return;
    }
    if (!name || name.trim() === "") {
      toast.error("Informe um nome para a base de produtos.");
      return;
    }
    setLoading(true);
    try {
      const rangeToFetch = `${selectedSheet}!A1:Z1000`;
      const res = await googleClient.getSpreadsheetValues(accessToken, spreadsheetId, rangeToFetch);
      const values: any[][] = res.values || [];
      if (values.length === 0) {
        toast.error("A aba selecionada parece estar vazia.");
        return;
      }
      const headerRow = (values[0] || []).map((h: any) => String(h).trim());
      const dataRows = values.slice(1);
      const base: StoredBase = {
        id: `base-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`,
        name: name.trim(),
        type: "product",
        headers: headerRow,
        rows: dataRows,
        createdAt: new Date().toISOString(),
        // product-type bases might also benefit from a key column if user selected one previously
        keyColumn: complementKeyColumn || null,
      };
      setBases((prev) => [base, ...prev]);
      toast.success(`Base de produtos "${base.name}" salva com ${dataRows.length} linhas.`);
    } catch (err: any) {
      if (isGoogleAuthError(err)) {
        clearGoogleSessionAndNotify();
        return;
      }
      console.error("save product base failed", err);
      toast.error("Falha ao salvar a base de produtos: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Configurações</h1>
            <p className="text-gray-600">Gerencie conexões e suas bases — planilha de produtos e bases de valores para orçamentos.</p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/")}>Voltar ao Orçamento</Button>
            <Button variant="outline" onClick={() => navigate("/token-scan")}>Scanner de Tokens</Button>
          </div>
        </div>

        {/* Top section: two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Left column: Product Base (sheet link + discovered files + product bases list) */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Planilha de Produtos (base de produtos)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  Conecte a planilha que contém a lista mestre de produtos (SKU / partnumber). Essas bases serão usadas pela aba "Pesquisar Código".
                </p>

                <div className="space-y-3">
                  <div>
                    <Label>Link da planilha (Sheets) — base de produtos</Label>
                    <Input
                      placeholder="Cole o link da planilha de produtos (https://docs.google.com/spreadsheets/d/ID/...) ou cole o ID"
                      value={spreadsheetLink}
                      onChange={(e) => setSpreadsheetLink(e.target.value)}
                      className="mt-2"
                    />
                    <div className="flex gap-2 mt-2">
                      <Button onClick={handleLoadSheets} disabled={!connected || loading || !spreadsheetLink}>
                        {loading ? "Carregando..." : "Carregar abas"}
                      </Button>
                      <Button variant="outline" onClick={() => {
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
                      }}>Limpar</Button>
                    </div>
                  </div>

                  <div>
                    <div className="flex gap-2 items-center">
                      {!connected ? (
                        <Button onClick={handleConnect} disabled={loading || !isGoogleConfigured}>
                          {loading ? "Conectando..." : "Conectar ao Google"}
                        </Button>
                      ) : (
                        <Button variant="destructive" onClick={handleDisconnect} disabled={loading}>
                          Desconectar Google
                        </Button>
                      )}

                      <Button onClick={handleRefreshFiles} disabled={!connected || loading}>Atualizar lista do Drive</Button>
                    </div>

                    {files.length > 0 && (
                      <div className="mt-3">
                        <p className="text-sm text-muted-foreground">Arquivos encontrados no seu Drive:</p>
                        <div className="mt-2 space-y-2 max-h-40 overflow-auto">
                          {files.filter(f => {
                            const q = fileSearch.trim().toLowerCase();
                            return !q || f.name.toLowerCase().includes(q) || f.id.toLowerCase().includes(q);
                          }).map((f) => (
                            <div key={f.id} className="flex items-center justify-between border rounded px-3 py-2">
                              <div className="truncate pr-4">{f.name}</div>
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={() => { setSpreadsheetLink(`https://docs.google.com/spreadsheets/d/${f.id}`); toast.success("Link preenchido"); }}>
                                  Usar link
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* New: sheet selector and header preview for the Planilha de Produtos */}
                  {sheetTitles.length > 0 && (
                    <div className="mt-4 border rounded p-3 bg-gray-50">
                      <div className="flex items-center gap-2 mb-2">
                        <Label className="mb-0">Aba para base de produtos</Label>
                        <select
                          className="ml-2 border rounded px-2 py-1"
                          value={selectedSheet ?? ""}
                          onChange={(e) => setSelectedSheet(e.target.value)}
                        >
                          <option value="">-- selecione a aba --</option>
                          {sheetTitles.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>

                        <Button onClick={handleLoadHeaders} disabled={!selectedSheet || loading}>Carregar cabeçalhos</Button>
                      </div>

                      {headers.length > 0 && (
                        <div className="mt-2">
                          <div className="text-sm text-muted-foreground mb-1">Cabeçalhos detectados:</div>
                          <div className="flex flex-wrap gap-2">
                            {headers.map((h, i) => (
                              <div key={i} className="px-2 py-1 bg-white border rounded text-xs">{h || "(vazio)"}</div>
                            ))}
                          </div>

                          <div className="mt-3 flex items-center gap-2">
                            <Input id="new_product_base_name" placeholder="Nome da base de produtos (ex: Produtos Mestre 2025)" />
                            <Button onClick={() => {
                              const name = (document.getElementById("new_product_base_name") as HTMLInputElement | null)?.value || "";
                              handleSaveProductBase(name);
                            }} disabled={!headers.length || !selectedSheet || loading}>
                              Salvar como base de produtos
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Bases de Produtos Salvas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">Bases salvas (lista única para gerenciamento e exportação).</p>
                {bases.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">Nenhuma base salva.</div>
                ) : (
                  <div className="space-y-2">
                    {bases.map((b) => (
                      <div key={b.id} className="flex items-center justify-between border rounded p-3">
                        <div>
                          <div className="font-medium">{b.name} <span className="text-xs text-muted-foreground ml-2">[{b.type}]</span></div>
                          <div className="text-sm text-muted-foreground">{b.rows.length} linhas · {b.headers.length} colunas · criado em {new Date(b.createdAt).toLocaleDateString()}</div>
                          {b.keyColumn && <div className="text-sm text-muted-foreground mt-1">Coluna chave: <strong>{b.keyColumn}</strong></div>}
                          {b.comIdsColumn && <div className="text-sm text-muted-foreground mt-1">Coluna 'Com iDSecure': <strong>{b.comIdsColumn}</strong></div>}
                          {b.semIdsColumn && <div className="text-sm text-muted-foreground mt-1">Coluna 'Sem iDSecure': <strong>{b.semIdsColumn}</strong></div>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => {
                            const blob = new Blob([JSON.stringify(b, null, 2)], { type: "application/json" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `${b.name.replace(/\s+/g, "-") || b.id}.json`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                            toast.success("Base exportada");
                          }}>Exportar</Button>
                          <Button size="sm" variant="destructive" onClick={() => {
                            setBases(prev => prev.filter(x => x.id !== b.id));
                            toast.success("Base removida");
                          }}>Remover</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column: Base de Orçamentos (Valores) */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Base de Orçamentos (Valores)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  Escolha a aba e o intervalo que contém preços e condições utilizados para gerar orçamentos (ex.: colunas com valores 12m/24m, composições, etc.). Use "Ler intervalo" para pré-visualizar antes de salvar/importar.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label>Aba (sheet)</Label>
                    <select className="border rounded w-full px-2 py-1 mt-2" value={complementSheet ?? ""} onChange={(e) => setComplementSheet(e.target.value)}>
                      <option value="">-- selecione a aba --</option>
                      {sheetTitles.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div>
                    <Label>Intervalo (range)</Label>
                    <Input value={complementRange} onChange={(e) => setComplementRange(e.target.value)} className="mt-2" />
                    <div className="text-sm text-muted-foreground mt-1">Ex: A1:Z1000 — primeira linha será considerada cabeçalho</div>
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <Button onClick={handleReadRange} disabled={!connected || !spreadsheetId || !complementSheet}>
                    Ler intervalo (pré-visualizar)
                  </Button>
                  <Button onClick={() => {
                    setComplementHeaders([]);
                    setComplementPreviewRows([]);
                    setComplementKeyColumn("");
                    setComplementRowsCount(null);
                    setComplementComIdsColumn("");
                    setComplementSemIdsColumn("");
                    localStorage.removeItem(LS_COMPLEMENT_RANGE);
                  }} variant="outline">Limpar pré-visualização</Button>
                </div>

                {complementRowsCount !== null && (
                  <div className="text-sm text-muted-foreground mt-3">
                    Linhas no intervalo (excluindo cabeçalho): {complementRowsCount}
                  </div>
                )}

                {complementPreviewRows.length > 0 && (
                  <div className="overflow-auto border rounded mt-3">
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
                  <div className="space-y-3 mt-4">
                    <div>
                      <Label>Coluna chave (SKU / part number) — opcional</Label>
                      <select className="border rounded w-full px-2 py-1 mt-2" value={complementKeyColumn} onChange={(e) => setComplementKeyColumn(e.target.value)}>
                        <option value="">(gerar automaticamente)</option>
                        {complementHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <div className="text-sm text-muted-foreground mt-1">Se não houver coluna chave, será gerado um identificador único para cada linha (sem mesclagem).</div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label>Coluna "Com iDSecure" (opcional)</Label>
                        <select value={complementComIdsColumn} onChange={(e) => setComplementComIdsColumn(e.target.value)} className="border rounded px-2 py-1 w-full mt-2">
                          <option value="">(nenhuma)</option>
                          {complementHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>

                      <div>
                        <Label>Coluna "Sem iDSecure" (opcional)</Label>
                        <select value={complementSemIdsColumn} onChange={(e) => setComplementSemIdsColumn(e.target.value)} className="border rounded px-2 py-1 w-full mt-2">
                          <option value="">(nenhuma)</option>
                          {complementHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Input id="new_base_name" placeholder="Nome da base (ex: Preços Maio 2025)" />
                      <select id="new_base_type" defaultValue="catalog" className="border rounded px-2 py-1">
                        <option value="catalog">Salvar como: Base de Orçamentos (exibe no Catálogo)</option>
                        <option value="product">Salvar como: Base de Produtos (procura por código)</option>
                      </select>
                      <Button onClick={() => {
                        const nameInput = (document.getElementById("new_base_name") as HTMLInputElement | null)?.value || "";
                        const type = (document.getElementById("new_base_type") as HTMLSelectElement | null)?.value as any;
                        handleSaveBase(nameInput, type);
                      }} disabled={!complementHeaders.length || !complementSheet || loading}>Salvar base</Button>
                      <Button onClick={handleImportComplement} disabled={complementImporting} variant="outline">Importar e Criar Itens</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Seller configuration card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Dados do Vendedor (preenchidos no slide)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Nome do Vendedor</Label>
                  <Input value={sellerName} onChange={(e) => setSellerName(e.target.value)} />
                </div>

                <div>
                  <Label>Cargo</Label>
                  <Input value={sellerRole} onChange={(e) => setSellerRole(e.target.value)} />
                </div>

                <div>
                  <Label>E-mail</Label>
                  <Input value={sellerEmail} onChange={(e) => setSellerEmail(e.target.value)} />
                </div>

                <div>
                  <Label>Telefone</Label>
                  <Input value={sellerPhone} onChange={(e) => setSellerPhone(e.target.value)} />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <Button onClick={() => { localStorage.setItem("seller_name", sellerName); localStorage.setItem("seller_role", sellerRole); localStorage.setItem("seller_email", sellerEmail); localStorage.setItem("seller_phone", sellerPhone); toast.success("Dados do vendedor salvos."); }}>Salvar</Button>
                <Button variant="outline" onClick={() => { localStorage.removeItem("seller_name"); localStorage.removeItem("seller_role"); localStorage.removeItem("seller_email"); localStorage.removeItem("seller_phone"); setSellerName(""); setSellerRole(""); setSellerEmail(""); setSellerPhone(""); toast.success("Dados do vendedor removidos."); }}>Limpar</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ajuda rápida</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-2 list-disc list-inside text-muted-foreground">
                <li>Planilha de Produtos: conecte a planilha que contém SKUs e descrições (usada na busca por código).</li>
                <li>Base de Orçamentos: selecione aba + intervalo com preços (usar para salvar bases de valores que aparecem no Catálogo).</li>
                <li>Ao salvar uma base escolha o tipo: <strong>catalog</strong> (valores) ou <strong>product</strong> (busca por código).</li>
                <li>Você pode exportar ou remover bases a qualquer momento.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}