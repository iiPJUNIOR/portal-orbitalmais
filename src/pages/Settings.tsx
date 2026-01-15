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
import { fetchBases, saveBase, type StoredBase } from "@/services/productBaseService";

const ENV_GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const LOCAL_STORAGE_KEY = "google_client_id_override";

// Local storage keys for complement settings
const LS_COMPLEMENT_RANGE = "complement_range";
const LS_COMPLEMENT_SHEET = "complement_sheet";
const LS_COMPLEMENT_KEY_COLUMN = "complement_key_column";
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

  // Bases loaded from Supabase
  const [bases, setBases] = useState<StoredBase[]>([]);
  useEffect(() => {
    // load bases from Supabase
    (async () => {
      try {
        setLoading(true);
        const data = await fetchBases();
        setBases(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to load bases from supabase", err);
        toast.error("Falha ao carregar bases do servidor");
        setBases([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Persist small preferences used by UI
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
      console.error(err);
      toast.error("Erro ao conectar com Google: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
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

      const saved = loadSavedMappingForSpreadsheet(spreadsheetId) || {};

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

      // For backward compatibility we still write created products to localStorage importedProducts.
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

        let value12 = 0;
        let value24 = 0;
        for (let c = 0; c < headerRow.length; c++) {
          if (c === keyIndex) continue;
          const parsed = parseSpreadsheetNumber(row[c]);
          if (parsed > 0) {
            if (!value12) value12 = parsed;
            else if (!value24) value24 = parsed;
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
      console.error("Erro ao importar complemento:", err);
      toast.error("Falha na importação complementar: " + (err?.message || err));
    } finally {
      setComplementImporting(false);
    }
  };

  // Read full range and save as a base to Supabase via service
  const handleSaveBase = async (name: string, type: StoredBase["type"]) => {
    if (!name || name.trim().length === 0) {
      toast.error("Informe um nome para a base");
      return;
    }

    try {
      // reuse existing read range function
      const rangeToFetch = `${complementSheet || selectedSheet}!${complementRange}`;
      const id = extractSpreadsheetId(spreadsheetLink) || spreadsheetId;
      if (!id) {
        toast.error("Id da planilha não encontrado. Carregue a planilha/aba primeiro.");
        return;
      }

      setLoading(true);
      const res = await googleClient.getSpreadsheetValues(accessToken!, id, rangeToFetch);
      const values: any[][] = res.values || [];
      if (values.length === 0) {
        toast.error("Intervalo vazio");
        setLoading(false);
        return;
      }
      const headerRow = (values[0] || []).map((h: any) => String(h).trim());
      const dataRows = values.slice(1);

      const base: StoredBase = {
        name: name.trim(),
        type,
        headers: headerRow,
        rows: dataRows,
        key_column: complementKeyColumn || null,
        com_ids_column: complementComIdsColumn || null,
        sem_ids_column: complementSemIdsColumn || null,
      };

      // Save to Supabase
      const saved = await saveBase(base);
      toast.success(`Base "${saved.name}" salva no servidor.`);
      // refresh list locally
      try {
        const list = await fetchBases();
        setBases(Array.isArray(list) ? list : []);
      } catch {}
    } catch (err: any) {
      console.error("save base failed", err);
      toast.error("Falha ao salvar a base: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  // Save selectedSheet as a product base
  const handleSaveProductBase = async (name: string) => {
    if (!selectedSheet && !complementSheet) {
      toast.error("Selecione a aba antes de salvar a base de produtos.");
      return;
    }
    if (!name || name.trim() === "") {
      toast.error("Informe um nome para a base de produtos.");
      return;
    }
    setLoading(true);
    try {
      const sheetToUse = selectedSheet || complementSheet!;
      const id = extractSpreadsheetId(spreadsheetLink) || spreadsheetId;
      if (!id) {
        toast.error("Id da planilha não encontrado. Carregue a planilha/aba primeiro.");
        setLoading(false);
        return;
      }
      const rangeToFetch = `${sheetToUse}!A1:Z1000`;
      const res = await googleClient.getSpreadsheetValues(accessToken!, id, rangeToFetch);
      const values: any[][] = res.values || [];
      if (values.length === 0) {
        toast.error("A aba selecionada parece estar vazia.");
        setLoading(false);
        return;
      }
      const headerRow = (values[0] || []).map((h: any) => String(h).trim());
      const dataRows = values.slice(1);
      const base: StoredBase = {
        name: name.trim(),
        type: "product",
        headers: headerRow,
        rows: dataRows,
        key_column: complementKeyColumn || null,
      };

      const saved = await saveBase(base);
      toast.success(`Base de produtos "${saved.name}" salva no servidor.`);
      const list = await fetchBases();
      setBases(Array.isArray(list) ? list : []);
    } catch (err: any) {
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
            <p className="text-gray-600">Gerencie conexões e suas bases — agora persistidas no Supabase.</p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/")}>Voltar ao Orçamento</Button>
            <Button variant="outline" onClick={() => navigate("/token-scan")}>Scanner de Tokens</Button>
          </div>
        </div>

        {/* UI omitted for brevity — keep the rest unchanged (we only changed bases persistence) */}
        <div className="mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Bases salvas no servidor</CardTitle>
            </CardHeader>
            <CardContent>
              {bases.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nenhuma base salva no servidor.</div>
              ) : (
                <div className="space-y-2">
                  {bases.map((b) => (
                    <div key={String(b.id)} className="flex items-center justify-between border rounded px-3 py-2">
                      <div>
                        <div className="font-medium">{b.name}</div>
                        <div className="text-sm text-muted-foreground">{Array.isArray(b.rows) ? b.rows.length : 0} linhas · {Array.isArray(b.headers) ? b.headers.length : 0} colunas</div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => {
                          const blob = new Blob([JSON.stringify(b, null, 2)], { type: "application/json" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `${(b.name || b.id).replace(/\s+/g, "-") || b.id}.json`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                          toast.success("Base exportada");
                        }}>Exportar</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}