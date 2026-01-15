"use client";

import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import * as googleClient from "@/integrations/google/client";
import { parseSpreadsheetNumber } from "@/lib/formatters";
import { fetchBases, saveBase, type StoredBase } from "@/services/productBaseService";
import { getUserSettings, upsertUserSettings, type UserSettings } from "@/services/settingsService";

/**
 * Settings page:
 * - Loads settings from Supabase for the authenticated user (fallbacks to localStorage if not available).
 * - Auto-saves (debounced) edits to Supabase via upsertUserSettings.
 *
 * This preserves the UI behavior but centralizes persistence to Supabase.
 */

const ENV_GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const LOCAL_STORAGE_KEY = "google_client_id_override";

// Local storage keys (kept for compatibility fallback)
const LS_COMPLEMENT_RANGE = "complement_range";
const LS_COMPLEMENT_SHEET = "complement_sheet";
const LS_COMPLEMENT_KEY_COLUMN = "complement_key_column";
const LS_COMPLEMENT_COM_IDS = "complement_com_ids_column";
const LS_COMPLEMENT_SEM_IDS = "complement_sem_ids_column";

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
  const [overrideClientId, setOverrideClientId] = useState<string>("");
  const effectiveClientId = ENV_GOOGLE_CLIENT_ID || overrideClientId || undefined;
  const isGoogleConfigured = !!effectiveClientId;

  // Seller fields
  const [sellerName, setSellerName] = useState<string>("");
  const [sellerRole, setSellerRole] = useState<string>("");
  const [sellerEmail, setSellerEmail] = useState<string>("");
  const [sellerPhone, setSellerPhone] = useState<string>("");

  // Complement import states
  const [complementSheet, setComplementSheet] = useState<string | null>(null);
  const [complementRange, setComplementRange] = useState<string>("A1:Z1000");
  const [complementHeaders, setComplementHeaders] = useState<string[]>([]);
  const [complementPreviewRows, setComplementPreviewRows] = useState<any[][]>([]);
  const [complementKeyColumn, setComplementKeyColumn] = useState<string>("");
  const [complementImporting, setComplementImporting] = useState(false);
  const [complementRowsCount, setComplementRowsCount] = useState<number | null>(null);
  const [complementComIdsColumn, setComplementComIdsColumn] = useState<string>("");
  const [complementSemIdsColumn, setComplementSemIdsColumn] = useState<string>("");

  // Supabase-backed bases (catalog/product)
  const [bases, setBases] = useState<StoredBase[]>([]);

  // debounce ref for saving settings
  const saveTimeoutRef = useRef<number | null>(null);

  // Load initial settings: try Supabase first; fallback to localStorage if unauthenticated or not found.
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const s = await getUserSettings();
        if (s) {
          setSpreadsheetLink(s.spreadsheet_link ?? "");
          setOverrideClientId(s.google_client_id_override ?? "");
          setComplementRange(s.complement_range ?? "A1:Z1000");
          setComplementSheet(s.complement_sheet ?? null);
          setComplementKeyColumn(s.complement_key_column ?? "");
          setComplementComIdsColumn(s.complement_com_ids_column ?? "");
          setComplementSemIdsColumn(s.complement_sem_ids_column ?? "");
          setSellerName(s.seller_name ?? "");
          setSellerRole(s.seller_role ?? "");
          setSellerEmail(s.seller_email ?? "");
          setSellerPhone(s.seller_phone ?? "");
        } else {
          // Fallback to localStorage for users that haven't been saved to DB or unauthenticated flows
          try {
            const localLink = localStorage.getItem("spreadsheet_link");
            if (localLink) setSpreadsheetLink(localLink);

            const localOverride = localStorage.getItem("google_client_id_override");
            if (localOverride) setOverrideClientId(localOverride);

            const localRange = localStorage.getItem(LS_COMPLEMENT_RANGE);
            if (localRange) setComplementRange(localRange);

            const localSheet = localStorage.getItem(LS_COMPLEMENT_SHEET);
            if (localSheet) setComplementSheet(localSheet);

            const keyCol = localStorage.getItem(LS_COMPLEMENT_KEY_COLUMN);
            if (keyCol) setComplementKeyColumn(keyCol);

            const comIds = localStorage.getItem(LS_COMPLEMENT_COM_IDS);
            if (comIds) setComplementComIdsColumn(comIds);

            const semIds = localStorage.getItem(LS_COMPLEMENT_SEM_IDS);
            if (semIds) setComplementSemIdsColumn(semIds);

            setSellerName(localStorage.getItem("seller_name") || "");
            setSellerRole(localStorage.getItem("seller_role") || "");
            setSellerEmail(localStorage.getItem("seller_email") || "");
            setSellerPhone(localStorage.getItem("seller_phone") || "");
          } catch {
            // ignore
          }
        }
      } catch (err) {
        console.error("Failed to load user settings:", err);
        toast.error("Falha ao carregar configurações do servidor; usando valores locais quando houver.");
        // fallback to localStorage as above
        try {
          const localLink = localStorage.getItem("spreadsheet_link");
          if (localLink) setSpreadsheetLink(localLink);

          const localOverride = localStorage.getItem("google_client_id_override");
          if (localOverride) setOverrideClientId(localOverride);

          const localRange = localStorage.getItem(LS_COMPLEMENT_RANGE);
          if (localRange) setComplementRange(localRange);

          const localSheet = localStorage.getItem(LS_COMPLEMENT_SHEET);
          if (localSheet) setComplementSheet(localSheet);

          const keyCol = localStorage.getItem(LS_COMPLEMENT_KEY_COLUMN);
          if (keyCol) setComplementKeyColumn(keyCol);

          const comIds = localStorage.getItem(LS_COMPLEMENT_COM_IDS);
          if (comIds) setComplementComIdsColumn(comIds);

          const semIds = localStorage.getItem(LS_COMPLEMENT_SEM_IDS);
          if (semIds) setComplementSemIdsColumn(semIds);

          setSellerName(localStorage.getItem("seller_name") || "");
          setSellerRole(localStorage.getItem("seller_role") || "");
          setSellerEmail(localStorage.getItem("seller_email") || "");
          setSellerPhone(localStorage.getItem("seller_phone") || "");
        } catch {
          // ignore
        }
      } finally {
        setLoading(false);
      }

      // load product bases from Supabase
      try {
        const b = await fetchBases();
        setBases(Array.isArray(b) ? b : []);
      } catch (err) {
        console.warn("Failed to load bases from server", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save settings to Supabase when key fields change (debounced).
  useEffect(() => {
    // gather settings to save
    const payload: Partial<UserSettings> = {
      spreadsheet_link: spreadsheetLink || null,
      google_client_id_override: overrideClientId || null,
      complement_range: complementRange || null,
      complement_sheet: complementSheet || null,
      complement_key_column: complementKeyColumn || null,
      complement_com_ids_column: complementComIdsColumn || null,
      complement_sem_ids_column: complementSemIdsColumn || null,
      seller_name: sellerName || null,
      seller_role: sellerRole || null,
      seller_email: sellerEmail || null,
      seller_phone: sellerPhone || null,
    };

    // Debounce: wait 800ms after last change
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    saveTimeoutRef.current = window.setTimeout(async () => {
      try {
        const res = await upsertUserSettings(payload);
        if (res) {
          // reflect back into localStorage for backward compatibility
          try {
            if (payload.spreadsheet_link) localStorage.setItem("spreadsheet_link", String(payload.spreadsheet_link));
            if (payload.google_client_id_override) localStorage.setItem("google_client_id_override", String(payload.google_client_id_override));
            if (payload.complement_range) localStorage.setItem(LS_COMPLEMENT_RANGE, String(payload.complement_range));
            if (payload.complement_sheet) localStorage.setItem(LS_COMPLEMENT_SHEET, String(payload.complement_sheet));
            if (payload.complement_key_column) localStorage.setItem(LS_COMPLEMENT_KEY_COLUMN, String(payload.complement_key_column));
            if (payload.complement_com_ids_column) localStorage.setItem(LS_COMPLEMENT_COM_IDS, String(payload.complement_com_ids_column));
            if (payload.complement_sem_ids_column) localStorage.setItem(LS_COMPLEMENT_SEM_IDS, String(payload.complement_sem_ids_column));
            if (payload.seller_name) localStorage.setItem("seller_name", String(payload.seller_name));
            if (payload.seller_role) localStorage.setItem("seller_role", String(payload.seller_role));
            if (payload.seller_email) localStorage.setItem("seller_email", String(payload.seller_email));
            if (payload.seller_phone) localStorage.setItem("seller_phone", String(payload.seller_phone));
          } catch {
            // ignore localStorage failures
          }
        } else {
          // unauthenticated: still persist to localStorage so behavior remains functional
          try {
            if (payload.spreadsheet_link !== undefined && payload.spreadsheet_link !== null) localStorage.setItem("spreadsheet_link", String(payload.spreadsheet_link));
            if (payload.google_client_id_override !== undefined && payload.google_client_id_override !== null) localStorage.setItem("google_client_id_override", String(payload.google_client_id_override));
            if (payload.complement_range !== undefined && payload.complement_range !== null) localStorage.setItem(LS_COMPLEMENT_RANGE, String(payload.complement_range));
            if (payload.complement_sheet !== undefined && payload.complement_sheet !== null) localStorage.setItem(LS_COMPLEMENT_SHEET, String(payload.complement_sheet));
            if (payload.complement_key_column !== undefined && payload.complement_key_column !== null) localStorage.setItem(LS_COMPLEMENT_KEY_COLUMN, String(payload.complement_key_column));
            if (payload.complement_com_ids_column !== undefined && payload.complement_com_ids_column !== null) localStorage.setItem(LS_COMPLEMENT_COM_IDS, String(payload.complement_com_ids_column));
            if (payload.complement_sem_ids_column !== undefined && payload.complement_sem_ids_column !== null) localStorage.setItem(LS_COMPLEMENT_SEM_IDS, String(payload.complement_sem_ids_column));
            if (payload.seller_name !== undefined && payload.seller_name !== null) localStorage.setItem("seller_name", String(payload.seller_name));
            if (payload.seller_role !== undefined && payload.seller_role !== null) localStorage.setItem("seller_role", String(payload.seller_role));
            if (payload.seller_email !== undefined && payload.seller_email !== null) localStorage.setItem("seller_email", String(payload.seller_email));
            if (payload.seller_phone !== undefined && payload.seller_phone !== null) localStorage.setItem("seller_phone", String(payload.seller_phone));
          } catch {
            // ignore
          }
        }
      } catch (err) {
        console.error("Failed to save settings to Supabase:", err);
        // do not spam user with errors — only show on first failure
        toast.error("Não foi possível salvar configurações no servidor.");
      }
    }, 800) as unknown as number;

    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    spreadsheetLink,
    overrideClientId,
    complementRange,
    complementSheet,
    complementKeyColumn,
    complementComIdsColumn,
    complementSemIdsColumn,
    sellerName,
    sellerRole,
    sellerEmail,
    sellerPhone,
  ]);

  // Helper: try to detect spreadsheet id
  function extractSpreadsheetId(input: string): string | null {
    if (!input) return null;
    const trimmed = input.trim();
    const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) return match[1];
    const rawMatch = trimmed.match(/[a-zA-Z0-9-_]{20,}/);
    if (rawMatch) return rawMatch[0];
    return null;
  }

  // Google connection functions unchanged (use existing integration)
  async function handleConnect() {
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
  }

  async function handleRefreshFiles() {
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
  }

  // Load sheets for given spreadsheetLink
  async function handleLoadSheets() {
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
  }

  // Load headers for a selected sheet
  async function handleLoadHeaders() {
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
      setStage("headersLoaded");
      toast.success("Cabeçalhos carregados — ajuste mapeamentos se desejar.");
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao carregar cabeçalhos: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  // Read full complement range preview
  async function handleReadRange() {
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
  }

  // Save a base to Supabase
  const handleSaveBase = async (name: string, type: StoredBase["type"]) => {
    if (!name || name.trim().length === 0) {
      toast.error("Informe um nome para a base");
      return;
    }

    try {
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

  // Save product base (selected sheet)
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

        {/* Main simplified UI (keeps behavior) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Planilha e Conexão Google</CardTitle>
            </CardHeader>
            <CardContent>
              <Label>Link da planilha</Label>
              <Input value={spreadsheetLink} onChange={(e) => setSpreadsheetLink(e.target.value)} />
              <div className="mt-3 flex gap-2">
                <Button onClick={handleLoadSheets} disabled={!spreadsheetLink || !accessToken}>Carregar abas</Button>
                <Button variant="outline" onClick={handleConnect}>Conectar Google</Button>
                <Button variant="outline" onClick={handleRefreshFiles}>Atualizar arquivos</Button>
              </div>
              {sheetTitles.length > 0 && (
                <div className="mt-3">
                  <Label>Aba selecionada</Label>
                  <select value={selectedSheet ?? ""} onChange={(e) => setSelectedSheet(e.target.value)} className="border rounded px-2 py-1 mt-2 w-full">
                    <option value="">-- selecione a aba --</option>
                    {sheetTitles.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dados do Vendedor</CardTitle>
            </CardHeader>
            <CardContent>
              <Label>Nome</Label>
              <Input value={sellerName} onChange={(e) => setSellerName(e.target.value)} className="mb-2" />
              <Label>Cargo</Label>
              <Input value={sellerRole} onChange={(e) => setSellerRole(e.target.value)} className="mb-2" />
              <Label>E-mail</Label>
              <Input value={sellerEmail} onChange={(e) => setSellerEmail(e.target.value)} className="mb-2" />
              <Label>Telefone</Label>
              <Input value={sellerPhone} onChange={(e) => setSellerPhone(e.target.value)} className="mb-2" />
              <div className="flex gap-2 mt-3">
                <Button onClick={() => toast.success("Dados do vendedor serão salvos automaticamente")}>Salvar</Button>
                <Button variant="outline" onClick={() => {
                  setSellerName("");
                  setSellerRole("");
                  setSellerEmail("");
                  setSellerPhone("");
                  // also clear on backend on next autosave (we already write nulls)
                  toast.success("Campos do vendedor limpos (serão atualizados no servidor)");
                }}>Limpar</Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6">
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