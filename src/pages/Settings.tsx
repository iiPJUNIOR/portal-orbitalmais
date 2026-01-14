"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import * as googleClient from "@/integrations/google/client";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

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

  const isGoogleConfigured = !!GOOGLE_CLIENT_ID;

  useEffect(() => {
    // Try to restore token and files from localStorage on mount
    const storedToken = localStorage.getItem("google_access_token");
    if (storedToken) {
      setAccessToken(storedToken);
      setConnected(true);
      // try to list files to validate token
      (async () => {
        setLoading(true);
        try {
          const driveFiles = await googleClient.listDriveSpreadsheets(storedToken);
          setFiles(driveFiles.map((f: any) => ({ id: f.id, name: f.name })));
        } catch (err: any) {
          console.error("Failed to restore Google session:", err);
          // token may be invalid/expired - clear it
          localStorage.removeItem("google_access_token");
          setAccessToken(null);
          setConnected(false);
          toast.error("Sessão do Google expirada. Conecte novamente.");
        } finally {
          setLoading(false);
        }
      })();
    } else {
      // restore cached files if any (non-sensitive)
      const cached = localStorage.getItem("google_drive_files");
      if (cached) {
        try {
          setFiles(JSON.parse(cached));
        } catch {}
      }
    }
  }, []);

  function extractSpreadsheetId(input: string): string | null {
    if (!input) return null;
    const trimmed = input.trim();
    // Match standard URL pattern /spreadsheets/d/<id>
    const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) return match[1];
    // If a raw id was provided (alphanumeric of reasonable length)
    const rawMatch = trimmed.match(/[a-zA-Z0-9-_]{20,}/);
    if (rawMatch) return rawMatch[0];
    return null;
  }

  const handleConnect = async () => {
    if (!isGoogleConfigured) {
      toast.error("VITE_GOOGLE_CLIENT_ID não está definido. Verifique as variáveis de ambiente.");
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
        // persist token so connection survives reloads (developer note: consider more secure storage for production)
        localStorage.setItem("google_access_token", token);

        toast.success("Conectado ao Google com sucesso");

        // load files and persist a small cache
        const driveFiles = await googleClient.listDriveSpreadsheets(token);
        const mapped = driveFiles.map((f: any) => ({ id: f.id, name: f.name }));
        setFiles(mapped);
        try {
          localStorage.setItem("google_drive_files", JSON.stringify(mapped));
        } catch (e) {
          // ignore storage errors
        }
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
    // clear persisted session data
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
      } catch (e) {
        // ignore
      }
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
      console.error(err);
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
      // fetch first row headers
      const res = await googleClient.getSpreadsheetValues(accessToken, spreadsheetId, `${selectedSheet}!1:1`);
      const values: any[] = res.values || [];
      const row = values[0] || [];
      const headerStrings = row.map((h: any) => String(h).trim());
      setHeaders(headerStrings);
      // create initial empty mapping
      const initial: Record<string, string> = {};
      MAPPING_FIELDS.forEach(f => {
        initial[f.key] = "";
      });
      setMappings(initial);
      setStage("headersLoaded");
      toast.success("Cabeçalhos carregados. Faça o mapeamento das colunas.");
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

    // Validate that at least description and partnumber and price are mapped
    if (!mappings.description || (!mappings.value_12m && !mappings.value_24m)) {
      toast.error("Mapeie pelo menos Descrição e um dos valores (12 meses ou 24 meses).");
      return;
    }

    setLoading(true);
    try {
      // Fetch full range from selected sheet using provided range columns (A1:Z...) but relative to sheet
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
        // category
        if (mappings.category) out.category = obj[mappings.category];
        // tipo/model handling: prefer model mapping, fall back to tipo
        const modelVal = mappings.model ? obj[mappings.model] : (mappings.tipo ? obj[mappings.tipo] : "");
        out.model = modelVal || "";
        // colors
        out.colors = mappings.colors ? String(obj[mappings.colors] || "").split(",").map((c: string) => c.trim()).filter(Boolean) : [];
        // biometrics
        out.biometrics = mappings.biometrics ? String(obj[mappings.biometrics] || "").toLowerCase() === "true" || String(obj[mappings.biometrics] || "").toLowerCase() === "sim" : false;
        // facial
        out.facial = mappings.facial ? String(obj[mappings.facial] || "None") : "None";
        // proximity
        out.proximity = mappings.proximity ? String(obj[mappings.proximity] || "None") : "None";
        // urn
        out.urn = mappings.urn ? String(obj[mappings.urn] || "").toLowerCase() === "true" || String(obj[mappings.urn] || "").toLowerCase() === "sim" : false;
        // qr
        out.qr = mappings.qr ? String(obj[mappings.qr] || "").toLowerCase() === "true" || String(obj[mappings.qr] || "").toLowerCase() === "sim" : false;
        // part_number
        out.part_number = mappings.part_number ? String(obj[mappings.part_number] || "") : "";
        // description
        out.description = mappings.description ? String(obj[mappings.description] || "") : "";
        // values
        out.value_12m = mappings.value_12m ? parseFloat(String(obj[mappings.value_12m] || "0").replace(/[^\d,.]/g, "").replace(",", ".")) || 0 : 0;
        out.value_24m = mappings.value_24m ? parseFloat(String(obj[mappings.value_24m] || "0").replace(/[^\d,.]/g, "").replace(",", ".")) || 0 : 0;
        // sku/id fallback
        out.sku = out.part_number || out.description || `imported-${Math.random().toString(36).slice(2, 9)}`;

        // status default
        out.status = "Ativo";

        return out;
      });

      // Save mappedRows to localStorage as importedProducts
      localStorage.setItem("importedProducts", JSON.stringify(mappedRows));
      toast.success(`Importado ${mappedRows.length} linhas e salvo em localStorage (importedProducts)`);
      console.log("Imported mapped rows preview:", mappedRows.slice(0, 20));
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
              Para conectar ao Google, defina a variável de ambiente VITE_GOOGLE_CLIENT_ID com o Client ID da sua aplicação.
              Exemplo local: crie um arquivo <code className="bg-white rounded px-1 py-0.5">.env</code> na raiz com:
              <div className="mt-1 font-mono text-sm">VITE_GOOGLE_CLIENT_ID=seu_client_id_aqui</div>
              Ou defina a variável no painel de variáveis de ambiente do seu serviço de hospedagem.
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
                      // quick clear
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
                                  onClick={() => setSpreadsheetLink(`https://docs.google.com/spreadsheets/d/${f.id}`)}
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
                    </div>
                  </div>
                )}

                {stage === "headersLoaded" && (
                  <div className="space-y-4 pt-4 border-t">
                    <Label>Range de importação dentro da aba</Label>
                    <Input value={range} onChange={(e) => setRange(e.target.value)} />
                    <p className="text-sm text-muted-foreground">Exemplo: A1:Z1000 (será prefixado com a aba)</p>

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
                          // Reset mappings
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
        </div>
      </div>
    </div>
  );
}