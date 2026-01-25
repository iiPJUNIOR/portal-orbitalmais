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
import { fetchBases, saveBase, deleteBase, type StoredBase } from "@/services/productBaseService";
import { getUserSettings, saveUserSettings } from "@/services/settingsService";

const ENV_GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const LOCAL_STORAGE_KEY = "google_client_id_override";

// Local storage keys for complement settings
const LS_COMPLEMENT_RANGE = "complement_range";
const LS_COMPLEMENT_SHEET = "complement_sheet";
const LS_COMPLEMENT_KEY_COLUMN = "complement_key_column";
const LS_COMPLEMENT_COM_IDS = "complement_com_ids_column";
const LS_COMPLEMENT_SEM_IDS = "complement_sem_ids_column";

export default function Settings() {
  const navigate = useNavigate();
  const [connected, setConnected] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<Array<{ id: string; name: string }>>([]);
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

  // preview / header / range states
  const [complementRange, setComplementRange] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_COMPLEMENT_RANGE) || "A1:Z1000";
    } catch {
      return "A1:Z1000";
    }
  });
  const [complementHeaders, setComplementHeaders] = useState<string[]>([]);
  const [complementPreviewRows, setComplementPreviewRows] = useState<any[][]>([]);
  const [complementRowsCount, setComplementRowsCount] = useState<number | null>(null);

  // seller settings (moved to DB)
  const [sellerName, setSellerName] = useState<string>("");
  const [sellerRole, setSellerRole] = useState<string>("");
  const [sellerEmail, setSellerEmail] = useState<string>("");
  const [sellerPhone, setSellerPhone] = useState<string>("");

  // list of saved bases (from Supabase)
  const [bases, setBases] = useState<StoredBase[]>([]);

  // import UI helpers
  const [importMode, setImportMode] = useState<"sheet" | "range">("sheet");
  const [baseType, setBaseType] = useState<"product" | "catalog">("product");
  const [newBaseName, setNewBaseName] = useState<string>("");
  const [headersLoaded, setHeadersLoaded] = useState(false);

  const effectiveClientId = ENV_GOOGLE_CLIENT_ID;

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await fetchBases();
        setBases(Array.isArray(data) ? data : []);
      } catch (err) {
        console.warn("Failed to fetch bases on mount", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load user settings (seller fields + spreadsheet link and complement defaults) from Supabase
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const s = await getUserSettings();
        if (s) {
          setSellerName(s.seller_name ?? (localStorage.getItem("seller_name") || ""));
          setSellerRole(s.seller_role ?? (localStorage.getItem("seller_role") || ""));
          setSellerEmail(s.seller_email ?? (localStorage.getItem("seller_email") || ""));
          setSellerPhone(s.seller_phone ?? (localStorage.getItem("seller_phone") || ""));

          setSpreadsheetLink(s.spreadsheet_link ?? (localStorage.getItem("spreadsheet_link") || ""));
          setComplementRange(s.complement_range ?? (localStorage.getItem(LS_COMPLEMENT_RANGE) || "A1:Z1000"));
          setSelectedSheet(s.complement_sheet ?? (localStorage.getItem(LS_COMPLEMENT_SHEET) || null));
          setComplementHeaders([]);
          setComplementPreviewRows([]);
        } else {
          // fallback to localStorage
          setSellerName(localStorage.getItem("seller_name") || "");
          setSellerRole(localStorage.getItem("seller_role") || "");
          setSellerEmail(localStorage.getItem("seller_email") || "");
          setSellerPhone(localStorage.getItem("seller_phone") || "");
        }
      } catch (err) {
        console.warn("Failed to load settings:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Try to restore persisted Google access token (so the user remains connected across reloads)
  useEffect(() => {
    (async () => {
      try {
        // ensure script loaded (so requestAccessToken could run later if needed)
        await googleClient.init();
      } catch (err) {
        // ignore init error here
      }

      try {
        const stored = googleClient.getStoredAccessToken();
        if (stored && stored.access_token) {
          // validate by listing drive files (best-effort)
          try {
            const driveFiles = await googleClient.listDriveSpreadsheets(stored.access_token);
            setAccessToken(stored.access_token);
            setConnected(true);
            setFiles((driveFiles || []).map((f: any) => ({ id: f.id, name: f.name })));
            // keep storage in google client; nothing else needed
          } catch (err) {
            console.warn("Stored Google token seems invalid; attempting to request a fresh one", err);
            // Try a fresh token request silently (may open a consent prompt only if needed)
            try {
              const resp = await googleClient.requestAccessToken();
              if (resp?.access_token) {
                setAccessToken(resp.access_token);
                setConnected(true);
                try {
                  const driveFiles = await googleClient.listDriveSpreadsheets(resp.access_token);
                  setFiles((driveFiles || []).map((f: any) => ({ id: f.id, name: f.name })));
                } catch {}
              }
            } catch (reqErr) {
              console.warn("Silent requestAccessToken failed", reqErr);
              // leave disconnected; user can re-click Connect
              setConnected(false);
              setAccessToken(null);
            }
          }
        }
      } catch (err) {
        console.warn("Failed to restore stored Google token", err);
      }
    })();
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("spreadsheet_link", spreadsheetLink || "");
    } catch {}
  }, [spreadsheetLink]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_COMPLEMENT_RANGE, complementRange || "");
    } catch {}
  }, [complementRange]);

  function extractSpreadsheetId(input: string): string | null {
    if (!input) return null;
    const trimmed = input.trim();
    const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) return match[1];
    const rawMatch = trimmed.match(/[a-zA-Z0-9-_]{20,}/);
    if (rawMatch) return rawMatch[0];
    return null;
  }

  async function handleConnect() {
    if (!effectiveClientId) {
      toast.error("VITE_GOOGLE_CLIENT_ID não configurado (não modifiquei .env conforme solicitado).");
      return;
    }
    setLoading(true);
    try {
      await googleClient.init();
      const resp = await googleClient.requestAccessToken();
      if (resp?.access_token) {
        setAccessToken(resp.access_token);
        setConnected(true);
        toast.success("Conectado ao Google");
        try {
          const driveFiles = await googleClient.listDriveSpreadsheets(resp.access_token);
          setFiles((driveFiles || []).map((f: any) => ({ id: f.id, name: f.name })));
        } catch {}
      } else {
        toast.error("Não foi possível obter token do Google");
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao conectar ao Google: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadSheets() {
    const id = extractSpreadsheetId(spreadsheetLink);
    if (!id) {
      toast.error("Cole o link completo da planilha ou o ID.");
      return;
    }
    if (!accessToken) {
      toast.error("Conecte ao Google primeiro.");
      return;
    }
    setLoading(true);
    try {
      const titles = await googleClient.getSpreadsheetSheets(accessToken, id);
      setSpreadsheetId(id);
      setSheetTitles(titles);
      setSelectedSheet(titles[0] ?? null);
      toast.success(`Abas carregadas: ${titles.length}`);
    } catch (err: any) {
      console.error("load sheets err", err);
      toast.error("Erro ao carregar abas: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadHeaders() {
    if (!accessToken || !spreadsheetId || !selectedSheet) {
      toast.error("Carregue a planilha e selecione a aba primeiro.");
      return;
    }
    setLoading(true);
    try {
      const res = await googleClient.getSpreadsheetValues(accessToken, spreadsheetId, `${selectedSheet}!1:1`);
      const values: any[] = res.values || [];
      const headerRow = values[0] || [];
      setComplementHeaders(headerRow.map((h: any) => String(h).trim()));
      setHeadersLoaded(true);
      toast.success("Cabeçalhos carregados.");
    } catch (err: any) {
      console.error("load headers err", err);
      toast.error("Falha ao carregar cabeçalhos: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  async function handleReadRange() {
    if (!accessToken || !spreadsheetId || !selectedSheet) {
      toast.error("Carregue a planilha e selecione a aba primeiro.");
      return;
    }
    setLoading(true);
    try {
      const fullRange = `${selectedSheet}!${complementRange}`;
      const res = await googleClient.getSpreadsheetValues(accessToken, spreadsheetId, fullRange);
      const values: any[][] = res.values || [];
      if (values.length === 0) {
        toast.error("Intervalo vazio ou inválido.");
        setComplementHeaders([]);
        setComplementPreviewRows([]);
        setComplementRowsCount(0);
        setLoading(false);
        return;
      }
      const headerRow = (values[0] || []).map((h: any) => String(h).trim());
      const dataRows = values.slice(1);
      setComplementHeaders(headerRow);
      setComplementPreviewRows(dataRows.slice(0, 10));
      setComplementRowsCount(dataRows.length);
      toast.success(`Intervalo lido: ${dataRows.length} linhas (prévia até 10).`);
    } catch (err: any) {
      console.error("read range err", err);
      toast.error("Falha ao ler intervalo: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveImportedBase() {
    if (!selectedSheet && importMode === "sheet") {
      toast.error("Selecione uma aba para importar.");
      return;
    }
    if (!newBaseName || newBaseName.trim() === "") {
      toast.error("Informe um nome para a base.");
      return;
    }
    if (!accessToken || !spreadsheetId) {
      toast.error("Conecte e carregue a planilha antes de salvar.");
      return;
    }

    try {
      setLoading(true);
      if (importMode === "sheet") {
        // whole sheet -> fetch A1:Z1000 (or detect dynamic range)
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
          name: newBaseName.trim(),
          type: baseType,
          headers: headerRow,
          rows: dataRows,
          key_column: null,
          com_ids_column: null,
          sem_ids_column: null,
        };

        const saved = await saveBase(base);
        toast.success(`Base "${saved.name}" salva como ${baseType === "product" ? "Base de Produtos" : "Preços"} no servidor.`);
      } else {
        // range mode: use selectedSheet + complementRange
        const fullRange = `${selectedSheet}!${complementRange}`;
        const res = await googleClient.getSpreadsheetValues(accessToken, spreadsheetId, fullRange);
        const values: any[][] = res.values || [];
        if (values.length === 0) {
          toast.error("Intervalo vazio.");
          return;
        }
        const headerRow = (values[0] || []).map((h: any) => String(h).trim());
        const dataRows = values.slice(1);

        const base: StoredBase = {
          name: newBaseName.trim(),
          type: baseType,
          headers: headerRow,
          rows: dataRows,
          key_column: null,
          com_ids_column: null,
          sem_ids_column: null,
        };

        const saved = await saveBase(base);
        toast.success(`Base "${saved.name}" salva como ${baseType === "product" ? "Base de Produtos" : "Preços"} no servidor.`);
      }

      // refresh local list
      try {
        const list = await fetchBases();
        setBases(Array.isArray(list) ? list : []);
      } catch {}
      // clear inputs
      setNewBaseName("");
    } catch (err: any) {
      console.error("save imported base err", err);
      toast.error("Falha ao salvar base: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSellerSettings() {
    setLoading(true);
    try {
      await saveUserSettings({
        seller_name: sellerName || null,
        seller_role: sellerRole || null,
        seller_email: sellerEmail || null,
        seller_phone: sellerPhone || null,
        spreadsheet_link: spreadsheetLink || null,
        complement_range: complementRange || null,
        complement_sheet: selectedSheet || null,
      });
      toast.success("Configurações salvas no servidor.");
      // refresh bases list
      try {
        const list = await fetchBases();
        setBases(Array.isArray(list) ? list : []);
      } catch {}
    } catch (err: any) {
      console.error("save user settings err", err);
      toast.error("Falha ao salvar configurações: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  // New: delete a saved base
  async function handleDeleteBase(id?: string) {
    if (!id) {
      toast.error("ID da base inválido");
      return;
    }
    if (!confirm("Remover esta base permanentemente?")) return;

    setLoading(true);
    try {
      await deleteBase(id);
      toast.success("Base removida");
      // refresh list
      try {
        const list = await fetchBases();
        setBases(Array.isArray(list) ? list : []);
      } catch (err) {
        console.warn("Failed to refresh bases after delete", err);
      }
    } catch (err: any) {
      console.error("delete base err", err);
      toast.error("Falha ao remover base: " + (err?.message || ""));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Configurações</h1>
            <p className="text-gray-600">Conecte ao Google Sheets e importe bases diretamente para o Supabase.</p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/")}>Voltar ao Orçamento</Button>
            <Button variant="outline" onClick={() => navigate("/token-scan")}>Scanner de Tokens</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Google import card */}
            <Card>
              <CardHeader>
                <CardTitle>Importar base do Google Sheets</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div className="md:col-span-2">
                      <Label>Link da planilha ou ID</Label>
                      <Input
                        placeholder="Cole o link da planilha (https://docs.google.com/spreadsheets/...)"
                        value={spreadsheetLink}
                        onChange={(e) => setSpreadsheetLink(e.target.value)}
                      />
                    </div>

                    <div className="flex items-end gap-2">
                      <Button onClick={handleConnect} disabled={loading}>
                        {connected ? "Reconectar" : "Conectar ao Google"}
                      </Button>

                      <Button variant="outline" onClick={handleLoadSheets} disabled={loading || !spreadsheetLink}>
                        Carregar abas
                      </Button>
                    </div>
                  </div>

                  {sheetTitles.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                      <div className="md:col-span-1">
                        <Label>Escolha a aba</Label>
                        <select
                          className="w-full border rounded px-2 py-1"
                          value={selectedSheet ?? ""}
                          onChange={(e) => setSelectedSheet(e.target.value || null)}
                        >
                          <option value="">-- selecione --</option>
                          {sheetTitles.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>

                      <div>
                        <Label>Importar</Label>
                        <div className="flex gap-2 items-center mt-1">
                          <label className={`px-3 py-1 rounded cursor-pointer ${importMode === "sheet" ? "bg-gray-100" : "hover:bg-gray-50"}`}>
                            <input type="radio" name="importMode" checked={importMode === "sheet"} onChange={() => setImportMode("sheet")} /> Aba inteira
                          </label>
                          <label className={`px-3 py-1 rounded cursor-pointer ${importMode === "range" ? "bg-gray-100" : "hover:bg-gray-50"}`}>
                            <input type="radio" name="importMode" checked={importMode === "range"} onChange={() => setImportMode("range")} /> Intervalo
                          </label>
                        </div>
                      </div>

                      <div>
                        <Label>Tipo de base</Label>
                        <div className="flex gap-2 items-center mt-1">
                          <label className={`px-3 py-1 rounded cursor-pointer ${baseType === "product" ? "bg-gray-100" : "hover:bg-gray-50"}`}>
                            <input type="radio" name="baseType" checked={baseType === "product"} onChange={() => setBaseType("product")} /> Base de Produtos
                          </label>
                          <label className={`px-3 py-1 rounded cursor-pointer ${baseType === "catalog" ? "bg-gray-100" : "hover:bg-gray-50"}`}>
                            <input type="radio" name="baseType" checked={baseType === "catalog"} onChange={() => setBaseType("catalog")} /> Preços
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {importMode === "range" && (
                    <div>
                      <Label>Intervalo (ex: A1:Z1000)</Label>
                      <div className="flex gap-2 items-center">
                        <Input value={complementRange} onChange={(e) => setComplementRange(e.target.value)} />
                        <Button onClick={handleReadRange} disabled={!selectedSheet || !complementRange || !accessToken}>Ler intervalo</Button>
                        <Button variant="outline" onClick={handleLoadHeaders} disabled={!selectedSheet || !accessToken}>Carregar cabeçalhos</Button>
                      </div>

                      {complementHeaders.length > 0 && (
                        <div className="mt-3">
                          <div className="text-sm text-muted-foreground mb-2">Cabeçalhos detectados:</div>
                          <div className="flex flex-wrap gap-2">
                            {complementHeaders.map((h, i) => (
                              <div key={i} className="px-2 py-1 bg-gray-50 border rounded text-sm">{h || "(vazio)"}</div>
                            ))}
                          </div>
                        </div>
                      )}

                      {complementPreviewRows.length > 0 && (
                        <div className="mt-3">
                          <div className="text-sm text-muted-foreground mb-2">Pré-visualização (até 10 linhas)</div>
                          <div className="overflow-auto border rounded">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  {complementHeaders.map((h, i) => <th key={i} className="px-2 py-1 text-left">{h || "(vazio)"}</th>)}
                                </tr>
                              </thead>
                              <tbody>
                                {complementPreviewRows.map((r, ri) => (
                                  <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                                    {complementHeaders.map((_, ci) => (
                                      <td key={ci} className="px-2 py-1 align-top">{String(r[ci] ?? "")}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Base name + save */}
                  {sheetTitles.length > 0 && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                      <div className="md:col-span-2">
                        <Label>Nome da base (será salvo no servidor)</Label>
                        <Input value={newBaseName} onChange={(e) => setNewBaseName(e.target.value)} placeholder="Ex: Minha base de preços - Jan 2026" />
                      </div>

                      <div className="flex gap-2">
                        <Button onClick={handleSaveImportedBase} disabled={loading || !selectedSheet || !newBaseName}>
                          Salvar base no Supabase
                        </Button>
                        <Button variant="outline" onClick={async () => {
                          try {
                            const list = await fetchBases();
                            setBases(Array.isArray(list) ? list : []);
                            toast.success("Lista de bases atualizada");
                          } catch (err) {
                            toast.error("Falha ao atualizar lista");
                          }
                        }}>Atualizar lista</Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Bases saved on server */}
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

                          <Button size="sm" variant="destructive" onClick={() => handleDeleteBase(String(b.id))}>Remover</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Dados do Vendedor</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <Label>Nome</Label>
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

                  <div className="flex justify-end gap-2 mt-2">
                    <Button onClick={handleSaveSellerSettings} disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ajuda rápida</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm space-y-2 list-disc list-inside text-muted-foreground">
                  <li>Cole o link da planilha, conecte ao Google e carregue as abas.</li>
                  <li>Escolha a aba e selecione se deseja importar a aba inteira ou um intervalo.</li>
                  <li>Escolha o tipo de base: "Base de Produtos" (busca por código) ou "Preços" (tabela de valores).</li>
                  <li>Defina um nome e clique em "Salvar base no Supabase".</li>
                </ul>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}