"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import * as googleClient from "@/integrations/google/client";

const ENV_GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const LOCAL_STORAGE_KEY = "google_client_id_override";

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
  const [spreadsheetLink, setSpreadsheetLink] = useState<string>("");
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [sheetTitles, setSheetTitles] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<"idle" | "sheetsLoaded" | "headersLoaded" | "mapped">("idle");
  const [range, setRange] = useState<string>("A1:Z1000");
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
      setStage("headersLoaded");
      toast.success("Cabeçalhos carregados e mapeamento inicial aplicado (pode ser ajustado).");
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao carregar cabeçalhos: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleSetMapping = (fieldKey: string, headerName: string) => {
    setMappings(prev => ({ ...prev, [fieldKey]: headerName }));
  };

  const handleImportWithMapping = async () => {
    if (!accessToken || !spreadsheetId || !selectedSheet) {
      toast.error("Selecione a planilha e a aba primeiro.");
      return;
    }

    // Validate that at least description and price are mapped
    if (!mappings.description || (!mappings.value_12m && !mappings.value_24m)) {
      toast.error("Mapeie pelo menos Descrição e um dos valores (12 meses ou 24 meses).");
      return;
    }

    setLoading(true);
    try {
      const fullRange = `${selectedSheet}!${range}`;
      const res = await googleClient.getSpreadsheetValues(accessToken, spreadsheetId, fullRange);
      const values: any[][] = res.values || [];
      if (values.length <= 1) {
        toast.error("Planilha não contém linhas de dados além do cabeçalho.");
        setLoading(false);
        return;
      }
      const headerRow = values[0].map((h: any) => String(h).trim());
      const rows = values.slice(1);

      const mappedRows = rows.map((row) => {
        const obj: any = {};
        headerRow.forEach((h: string, idx: number) => {
          obj[h] = row[idx] ?? "";
        });

        // Build output object using mappings
        const out: any = {};
        if (mappings.category) out.category = obj[mappings.category];
        const modelVal = mappings.model ? obj[mappings.model] : (mappings.tipo ? obj[mappings.tipo] : "");
        out.model = modelVal || "";
        out.colors = mappings.colors ? String(obj[mappings.colors] || "").split(",").map((c: string) => c.trim()).filter(Boolean) : [];
        out.biometrics = mappings.biometrics ? String(obj[mappings.biometrics] || "").toLowerCase() === "true" || String(obj[mappings.biometrics] || "").toLowerCase() === "sim" : false;
        out.facial = mappings.facial ? String(obj[mappings.facial] || "None") : "None";
        out.proximity = mappings.proximity ? String(obj[mappings.proximity] || "None") : "None";
        out.urn = mappings.urn ? String(obj[mappings.urn] || "").toLowerCase() === "true" || String(obj[mappings.urn] || "").toLowerCase() === "sim" : false;
        out.qr = mappings.qr ? String(obj[mappings.qr] || "").toLowerCase() === "true" || String(obj[mappings.qr] || "").toLowerCase() === "sim" : false;
        out.part_number = mappings.part_number ? String(obj[mappings.part_number] || "") : "";
        out.description = mappings.description ? String(obj[mappings.description] || "") : "";
        out.value_12m = mappings.value_12m ? parseFloat(String(obj[mappings.value_12m] || "0").replace(/[^\d,.]/g, "").replace(",", ".")) || 0 : 0;
        out.value_24m = mappings.value_24m ? parseFloat(String(obj[mappings.value_24m] || "0").replace(/[^\d,.]/g, "").replace(",", ".")) || 0 : 0;
        out.sku = out.part_number || out.description || `imported-${Math.random().toString(36).slice(2, 9)}`;
        out.status = "Ativo";
        return out;
      });

      localStorage.setItem("importedProducts", JSON.stringify(mappedRows));
      // persist mapping per spreadsheet (already saved in effect), but also ensure it's stored explicitly
      try {
        if (spreadsheetId) {
          localStorage.setItem(`import_column_map_${spreadsheetId}`, JSON.stringify(mappings));
        } else {
          localStorage.setItem("import_column_map", JSON.stringify(mappings));
        }
      } catch {}
      toast.success(`Importado ${mappedRows.length} linhas e salvo em localStorage (importedProducts)`);
      setStage("mapped");
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao importar planilha com mapeamento: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleUseFileLink = (id: string) => {
    setSpreadsheetLink(`https://docs.google.com/spreadsheets/d/${id}`);
  };

  const filteredFiles = useMemo(() => {
    const q = fileSearch.trim().toLowerCase();
    if (!q) return files;
    return files.filter(f => {
      return f.name.toLowerCase().includes(q) || f.id.toLowerCase().includes(q);
    });
  }, [files, fileSearch]);

  const saveOverrideClientId = () => {
    try {
      if (!overrideClientId) {
        toast.error("Cole um Client ID válido antes de salvar.");
        return;
      }
      localStorage.setItem(LOCAL_STORAGE_KEY, overrideClientId);
      toast.success("Client ID salvo para esta sessão (localStorage).");
    } catch (err) {
      console.error("Erro ao salvar override client id:", err);
      toast.error("Não foi possível salvar o Client ID.");
    }
  };

  const clearOverrideClientId = () => {
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      setOverrideClientId("");
      toast.success("Client ID de override removido.");
    } catch (err) {
      console.error("Erro ao limpar override client id:", err);
      toast.error("Não foi possível limpar o Client ID.");
    }
  };

  // Seller persistence functions
  const saveSeller = () => {
    try {
      localStorage.setItem("seller_name", sellerName);
      localStorage.setItem("seller_role", sellerRole);
      localStorage.setItem("seller_email", sellerEmail);
      localStorage.setItem("seller_phone", sellerPhone);
      toast.success("Dados do vendedor salvos.");
    } catch (err) {
      console.error("Erro ao salvar dados do vendedor:", err);
      toast.error("Não foi possível salvar os dados do vendedor.");
    }
  };

  const clearSeller = () => {
    try {
      localStorage.removeItem("seller_name");
      localStorage.removeItem("seller_role");
      localStorage.removeItem("seller_email");
      localStorage.removeItem("seller_phone");
      setSellerName("");
      setSellerRole("");
      setSellerEmail("");
      setSellerPhone("");
      toast.success("Dados do vendedor removidos.");
    } catch (err) {
      console.error("Erro ao limpar dados do vendedor:", err);
      toast.error("Não foi possível limpar os dados do vendedor.");
    }
  };

  // Allow manual reset of saved import mapping for this spreadsheet
  const clearSavedImportMapping = () => {
    try {
      if (spreadsheetId) {
        localStorage.removeItem(`import_column_map_${spreadsheetId}`);
      }
      localStorage.removeItem("import_column_map");
      setMappings({});
      toast.success("Mapeamento salvo removido.");
    } catch (err) {
      console.error("Erro ao limpar mapeamento salvo", err);
      toast.error("Não foi possível limpar o mapeamento salvo.");
    }
  };

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
                  <Button onClick={saveOverrideClientId}>Salvar</Button>
                  <Button variant="outline" onClick={clearOverrideClientId}>Limpar</Button>
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
                        {filteredFiles.length === 0 ? (
                          <div className="text-sm text-muted-foreground p-2">Nenhum arquivo encontrado.</div>
                        ) : (
                          filteredFiles.map((f) => (
                            <div key={f.id} className="flex items-center justify-between border rounded px-3 py-2">
                              <div className="truncate pr-4">{f.name}</div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleUseFileLink(f.id)}
                                >
                                  Usar link
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
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
                      <Button variant="outline" onClick={clearSavedImportMapping}>Limpar Mapeamento Salvo</Button>
                    </div>
                  </div>
                )}

                {stage === "headersLoaded" && (
                  <div className="space-y-4 pt-4 border-t">
                    <Label>Range de importação dentro da aba</Label>
                    <Input value={range} onChange={(e) => setRange(e.target.value)} />
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

                      <div className="flex justify-end mt-4 gap-2">
                        <Button onClick={() => {
                          const initial: Record<string,string> = {};
                          MAPPING_FIELDS.forEach(f => initial[f.key] = "");
                          setMappings(initial);
                        }} variant="outline">
                          Resetar Mapeamento
                        </Button>

                        <Button onClick={handleImportWithMapping} disabled={loading}>
                          Importar com Mapeamento
                        </Button>
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
                <Button onClick={saveSeller}>Salvar Dados do Vendedor</Button>
                <Button variant="outline" onClick={clearSeller}>Limpar Dados</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}