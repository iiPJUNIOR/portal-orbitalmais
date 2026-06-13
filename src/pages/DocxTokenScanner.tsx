"use client";

import React, { useEffect, useState, useRef } from "react";
import { scanDocxTemplate } from "@/utils/docxScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileSearch, AlertTriangle, RefreshCw, Save, CheckCircle2 } from "lucide-react";
import { getUserSettings, saveUserSettings } from "@/services/settingsService";

const baseSystemFields = [
  { value: "vendedor", label: "Vendedor (Nome)" },
  { value: "empresa", label: "Empresa (Razão Social)" },
  { value: "cnpj", label: "CNPJ" },
  { value: "empresa_phone", label: "Telefone do Vendedor" },
  { value: "empresa_email", label: "E-mail do Vendedor" },
  { value: "contato_nome", label: "Nome do Cliente" },
  { value: "contato_telefone", label: "Telefone do Contato" },
  { value: "endereco", label: "Endereço Completo" },
  { value: "quantidade", label: "Quantidade Total de Itens" },
  { value: "produto", label: "Descrição dos Produtos" },
  { value: "observacoes", label: "Observações" },
  { value: "numeroproposta", label: "Número do Orçamento (Nome do Arquivo)" },
  { value: "versao", label: "Versão / Revisão" },
  { value: "data", label: "Data da Proposta" },
  { value: "valor", label: "Valor Total" },
  { value: "ensaios_inclusos", label: "Ensaios de Laboratório Inclusos (Sim/Não)" },
];

for (let i = 0; i < 10; i++) {
  const numStr = i === 0 ? "" : String(i);
  baseSystemFields.push({ value: `sku${numStr}`, label: `Código do Produto (Item ${i + 1})` });
  baseSystemFields.push({ value: `qtd${numStr}`, label: `Quantidade (Item ${i + 1})` });
  baseSystemFields.push({ value: `valor_item${numStr}`, label: `Valor do Item (Item ${i + 1})` });
}

const SYSTEM_FIELDS = baseSystemFields;

function normalizeForMatch(s?: string) {
  if (!s) return "";
  return s.replace(/[{}]/g, "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export default function DocxTokenScannerPage() {
  const navigate = useNavigate();
  const [found, setFound] = useState<Array<{ text: string; count: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [mapping, setMapping] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem("docx_token_map");
      const loaded = raw ? JSON.parse(raw) : {};
      const inverted: Record<string, string> = {};
      Object.entries(loaded).forEach(([token, field]) => {
        if (field && field !== "none" && !token.startsWith("__")) {
          inverted[field] = token;
        }
      });
      return inverted;
    } catch { return {}; }
  });

  const [ensaiosYes, setEnsaiosYes] = useState(() => {
    try {
      const raw = localStorage.getItem("docx_token_map");
      const loaded = raw ? JSON.parse(raw) : {};
      return loaded["__ensaios_yes"] || "já";
    } catch { return "já"; }
  });

  const [ensaiosNo, setEnsaiosNo] = useState(() => {
    try {
      const raw = localStorage.getItem("docx_token_map");
      const loaded = raw ? JSON.parse(raw) : {};
      return loaded["__ensaios_no"] || "não";
    } catch { return "não"; }
  });
  const autoMappedRef = useRef(false);

  const runScan = async () => {
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const tokens = await scanDocxTemplate();
      const arr = Array.from(new Set(tokens || [])).map((t) => ({ text: t, count: 1 }));
      setFound(arr);
      if (arr.length === 0) {
        setError("Nenhum token {{...}} encontrado no template. Verifique se o arquivo DOCX contém variáveis no formato {{nomeVariavel}}.");
      }
    } catch (err: any) {
      console.error("docx scan failed", err);
      setError(err?.message || String(err));
      setFound([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { runScan(); }, []);

  useEffect(() => {
    async function loadSettings() {
      try {
        const settings = await getUserSettings();
        if (settings?.docx_mappings) {
          const loaded = settings.docx_mappings;
          const inverted: Record<string, string> = {};
          Object.entries(loaded).forEach(([token, field]) => {
            if (field && field !== "none" && !token.startsWith("__")) {
              inverted[field] = token;
            }
          });
          setMapping(inverted);
          setEnsaiosYes(loaded["__ensaios_yes"] || "já");
          setEnsaiosNo(loaded["__ensaios_no"] || "não");
        }
      } catch (err) {
        console.warn("Failed to load user settings in DocxTokenScanner", err);
      }
    }
    loadSettings();
  }, []);

  /* Auto-mapping */
  useEffect(() => {
    if (found.length === 0 || autoMappedRef.current) return;
    const foundByNorm = found.map((f) => ({ raw: f.text, normalized: normalizeForMatch(f.text) }));
    const newMapping = { ...mapping };
    let anyMapped = false;

    for (const field of SYSTEM_FIELDS) {
      const key = field.value;
      if (newMapping[key]) continue;
      const keyNorm = normalizeForMatch(key);
      const labelNorm = normalizeForMatch(field.label);
      const match =
        foundByNorm.find((f) => f.normalized === keyNorm) ||
        foundByNorm.find((f) => f.normalized === labelNorm) ||
        foundByNorm.find((f) => f.normalized.includes(keyNorm)) ||
        foundByNorm.find((f) => keyNorm.includes(f.normalized));
      if (match) { newMapping[key] = match.raw; anyMapped = true; }
    }

    if (anyMapped) {
      setMapping(newMapping);
      const toSave: Record<string, string> = {};
      Object.entries(newMapping).forEach(([field, token]) => {
        if (token && !token.startsWith("__") && !field.startsWith("__")) {
          toSave[token] = field;
        }
      });
      toSave["__ensaios_yes"] = ensaiosYes;
      toSave["__ensaios_no"] = ensaiosNo;
      const applyAuto = async () => {
        try {
          await saveUserSettings({ docx_mappings: toSave });
        } catch {}
      };
      applyAuto();
      toast.success("Mapeamento automático aplicado.");
    }
    autoMappedRef.current = true;
  }, [found]);

  const saveMapping = async () => {
    try {
      const toSave: Record<string, string> = {};
      Object.entries(mapping).forEach(([field, token]) => {
        if (token && !token.startsWith("__") && !field.startsWith("__")) {
          toSave[token] = field;
        }
      });
      toSave["__ensaios_yes"] = ensaiosYes;
      toSave["__ensaios_no"] = ensaiosNo;
      await saveUserSettings({ docx_mappings: toSave });
      setSaved(true);
      toast.success("Mapeamento salvo com sucesso!");
      setTimeout(() => setSaved(false), 3000);
    } catch {
      toast.error("Falha ao salvar mapeamento.");
    }
  };

  const handleClearCache = async () => {
    try {
      await saveUserSettings({ docx_mappings: {} });
    } catch {}
    setMapping({});
    autoMappedRef.current = false;
    setFound([]);
    toast.info("Cache limpo. Reescaneando...");
    await runScan();
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/settings")} className="rounded-xl">
          <ArrowLeft className="h-4 w-4 mr-1" /> Configurações
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Scanner de Tokens DOCX</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Detecta variáveis <code className="bg-muted px-1 rounded text-xs">{"{{token}}"}</code> no template e permite mapeá-las aos campos do sistema.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" className="rounded-xl" onClick={handleClearCache} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" /> Reescanear
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <Card className="border-destructive/40 bg-destructive/5 rounded-2xl">
          <CardContent className="pt-6 space-y-4">
            <div className="flex gap-3">
              <AlertTriangle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-destructive">Erro ao escanear template</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button className="rounded-xl" onClick={() => navigate("/settings")}>
                Ir para Configurações e subir template
              </Button>
              <Button variant="outline" className="rounded-xl" onClick={runScan} disabled={loading}>
                Tentar novamente
              </Button>
            </div>
            <p className="text-xs text-muted-foreground border-t pt-3">
              Certifique-se de que o arquivo <strong>Solicitação de vistoria.docx</strong> está na pasta{" "}
              <code className="bg-muted px-1 rounded">/public</code> do projeto, ou acesse{" "}
              <strong>Configurações → Template e Mapeamento DOCX</strong> para subir um arquivo personalizado.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {loading && (
        <Card className="rounded-2xl">
          <CardContent className="py-12 flex flex-col items-center gap-4 text-muted-foreground">
            <FileSearch className="h-12 w-12 animate-pulse" />
            <p className="font-semibold">Escaneando template DOCX...</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {!loading && !error && found.length > 0 && (
        <div className="grid lg:grid-cols-5 gap-6">
          {/* Tokens found */}
          <Card className="lg:col-span-2 rounded-2xl border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <FileSearch className="h-4 w-4 text-primary" />
                Tokens encontrados
              </CardTitle>
              <CardDescription>{found.length} token{found.length !== 1 ? "s" : ""} distintos</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[420px] overflow-y-auto space-y-1 pr-1">
                {found.map((f) => (
                  <div
                    key={f.text}
                    className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/40 hover:bg-primary/5 transition-colors"
                  >
                    <code className="text-xs font-mono font-bold text-primary">
                      {"{{"}{f.text}{"}}"}
                    </code>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Mapping */}
          <Card className="lg:col-span-3 rounded-2xl border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold">Mapeamento de Campos</CardTitle>
              <CardDescription>
                Associe cada campo do sistema ao token correspondente no template.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="max-h-[420px] overflow-y-auto space-y-3 pr-1">
                {SYSTEM_FIELDS.map((field) => {
                  const k = field.value;
                  const isMapped = !!mapping[k];
                  return (
                    <div key={k} className={`flex flex-col gap-2 p-3 rounded-xl border transition-colors ${isMapped ? "bg-primary/5 border-primary/20" : "bg-muted/20"}`}>
                      <div className="flex items-center gap-3 w-full">
                        <div className="flex-1 min-w-0">
                          <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{field.label}</Label>
                          <select
                            className="mt-1 w-full bg-background border border-input rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                            value={mapping[k] ?? ""}
                            onChange={(e) => setMapping((prev) => ({ ...prev, [k]: e.target.value }))}
                          >
                            <option value="">-- não mapear --</option>
                            {found.map((f) => (
                              <option key={f.text} value={f.text}>{f.text}</option>
                            ))}
                          </select>
                        </div>
                        {isMapped && (
                          <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-5" />
                        )}
                      </div>
                      {k === "ensaios_inclusos" && isMapped && (
                        <div className="mt-1 grid grid-cols-2 gap-3 border-t pt-2 border-primary/10">
                          <div className="space-y-1">
                            <Label className="text-[10px] text-neutral-500 font-bold uppercase">Texto se Sim</Label>
                            <Input
                              className="h-8 text-xs rounded-xl"
                              placeholder="Ex: já"
                              value={ensaiosYes}
                              onChange={(e) => setEnsaiosYes(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-neutral-500 font-bold uppercase">Texto se Não</Label>
                            <Input
                              className="h-8 text-xs rounded-xl"
                              placeholder="Ex: não"
                              value={ensaiosNo}
                              onChange={(e) => setEnsaiosNo(e.target.value)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between items-center pt-3 border-t gap-3">
                <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={handleClearCache} disabled={loading}>
                  Limpar cache
                </Button>
                <Button
                  className="rounded-xl font-bold flex-1"
                  onClick={saveMapping}
                  disabled={saved}
                >
                  {saved
                    ? <><CheckCircle2 className="mr-2 h-4 w-4" /> Salvo!</>
                    : <><Save className="mr-2 h-4 w-4" /> Salvar mapeamento</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}