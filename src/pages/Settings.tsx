"use client";

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, Settings as SettingsIcon, ScanText, ShieldCheck, Users, Lock, Type, Info, LayoutList, Loader2, FileCheck, Copy, ExternalLink, AlertTriangle } from "lucide-react";
import * as googleClient from "@/integrations/google/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { fetchBases, saveBase, deleteBase, type StoredBase } from "@/services/productBaseService";
import { getUserSettings, saveUserSettings, getAllUsersSettings, updateUserPermission } from "@/services/settingsService";
import { useSession } from "@/contexts/SessionProvider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { scanDocxTemplate } from "@/utils/docxScanner";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { ProductFieldsTab } from "@/components/ProductFieldsTab";

export default function Settings() {
  const navigate = useNavigate();
  const { user } = useSession();
  const [connected, setConnected] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  
  const [spreadsheetLink, setSpreadsheetLink] = useState("");
  const [sheetTitles, setSheetTitles] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [bases, setBases] = useState<StoredBase[]>([]);
  const [newBaseName, setNewBaseName] = useState("");
  const [baseType, setBaseType] = useState<"product" | "catalog">("product");

  const [sellerName, setSellerName] = useState("");
  const [sellerRole, setSellerRole] = useState("");
  const [sellerEmail, setSellerEmail] = useState("");
  const [sellerPhone, setSellerPhone] = useState("");
  const [fontSize, setFontSize] = useState<string>("medium");
  const [slideMappings, setSlideMappings] = useState<Record<string, number>>({});
  const [newKeyword, setNewKeyword] = useState("");
  const [newSlideNumber, setNewSlideNumber] = useState("");

  // DOCX Mappings
  const [docxTokens, setDocxTokens] = useState<string[]>([]);
  const [docxMappings, setDocxMappings] = useState<Record<string, string>>({});
  const [scanningDocx, setScanningDocx] = useState(false);

  // DOCX Upload
  const [docxFile, setDocxFile] = useState<File | null>(null);
  const [uploadingDocx, setUploadingDocx] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [docxTemplateUrl, setDocxTemplateUrl] = useState<string | null>(null);
  const [showRlsModal, setShowRlsModal] = useState(false);

  const [canAccessSettings, setCanAccessSettings] = useState(true);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  const PAULO_EMAIL = "paulo.sergio@controlid.com.br";
  const isSuperAdmin = String(user?.email || "").toLowerCase() === PAULO_EMAIL;

  const baseFields = [
    { value: "vendedor", label: "Vendedor (Nome)" },
    { value: "empresa", label: "Empresa (Razão Social)" },
    { value: "cnpj", label: "CNPJ" },
    { value: "empresa_phone", label: "Telefone do Vendedor" },
    { value: "empresa_email", label: "E-mail do Vendedor" },
    { value: "contato_nome", label: "Nome do Contato" },
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
    baseFields.push({ value: `sku${numStr}`, label: `Código do Produto / SKU (Item ${i + 1})` });
    baseFields.push({ value: `qtd${numStr}`, label: `Quantidade (Item ${i + 1})` });
    baseFields.push({ value: `valor_item${numStr}`, label: `Valor do Item (Item ${i + 1})` });
  }

  const VISTORIA_FIELDS = baseFields;

  const loadBases = async () => {
    try {
      const data = await fetchBases();
      setBases(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadAllUsers = async () => {
    if (!isSuperAdmin) return;
    try {
      const data = await getAllUsersSettings();
      setAllUsers(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    (async () => {
      const s = await getUserSettings();
      if (s) {
        setSellerName(s.seller_name || "");
        setSellerRole(s.seller_role || "");
        setSellerEmail(s.seller_email || "");
        setSellerPhone(s.seller_phone || "");
        setSpreadsheetLink(s.spreadsheet_link || "");
        setFontSize(s.font_size || "medium");
        setSlideMappings(s.slide_mappings || {});
        setDocxTemplateUrl(s.pptx_template_url || null);
        
        const savedDocx = s.docx_mappings || {};
        setDocxMappings(savedDocx);
        
        // Scan template to ensure we only show keys that exist in the active file
        try {
          const scanned = await scanDocxTemplate(s.pptx_template_url || undefined);
          setDocxTokens(scanned.filter(k => !k.startsWith("__")));
        } catch (err) {
          console.warn("settings: auto-scan on mount failed, falling back to saved keys", err);
          const savedKeys = Object.keys(savedDocx).filter(k => !k.startsWith("__"));
          setDocxTokens(savedKeys);
        }

        setCanAccessSettings(true);
      } else {
        setCanAccessSettings(true);
      }

      loadBases();

      if (isSuperAdmin) {
        loadAllUsers();
      }
    })();
  }, [user, isSuperAdmin]);

  const handleConnect = async () => {
    try {
      await googleClient.init();
      const resp = await googleClient.requestAccessToken();
      if (resp?.access_token) {
        setAccessToken(resp.access_token);
        setConnected(true);
        toast.success("Conectado ao Google");
      }
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
  };

  const handleLoadSheets = async () => {
    const id = spreadsheetLink.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || spreadsheetLink;
    if (!id || !accessToken) return;
    try {
      setLoading(true);
      const titles = await googleClient.getSpreadsheetSheets(accessToken, id);
      setSheetTitles(titles);
      setSelectedSheet(titles[0] || null);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveImportedBase = async () => {
    const id = spreadsheetLink.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || spreadsheetLink;
    if (!accessToken || !id || !selectedSheet || !newBaseName) return;
    try {
      setLoading(true);
      const res = await googleClient.getSpreadsheetValues(accessToken, id, `${selectedSheet}!A1:Z1000`);
      if (!res.values) return;
      const headers = res.values[0].map((h: any) => String(h).trim());
      const rows = res.values.slice(1);
      await saveBase({
        name: newBaseName,
        type: baseType,
        headers,
        rows,
        extra_columns: []
      });
      toast.success("Base salva!");
      setNewBaseName("");
      loadBases();
    } finally {
      setLoading(false);
    }
  };

  const updateBaseMapping = async (base: StoredBase, field: string, value: any) => {
    try {
      await saveBase({ ...base, [field]: value });
      toast.success("Mapeamento atualizado");
      loadBases();
    } catch (err) {
      toast.error("Erro ao salvar mapeamento");
    }
  };

  const handleToggleExtraColumn = async (base: StoredBase, header: string) => {
    const current = base.extra_columns || [];
    let next: string[];
    if (current.includes(header)) {
      next = current.filter(c => c !== header);
    } else {
      next = [...current, header];
    }
    await updateBaseMapping(base, "extra_columns", next);
  };

  const toggleUserPermission = async (userId: string, email: string, permission: 'history' | 'settings', currentValue: boolean) => {
    try {
      await updateUserPermission(userId, email, permission, !currentValue);
      toast.success("Permissão atualizada");
      loadAllUsers();
    } catch (err) {
      console.error("Erro permissão:", err);
      toast.error("Erro ao atualizar permissão");
    }
  };

  const handleSaveFontSize = async (value: string) => {
    try {
      setFontSize(value);
      await saveUserSettings({ font_size: value as any });
      toast.success("Tamanho da fonte atualizado!");
    } catch (err) {
      toast.error("Erro ao salvar tamanho da fonte");
    }
  };

  const handleAddSlideMapping = async () => {
    if (!newKeyword.trim() || !newSlideNumber) return;

    const next = { ...slideMappings, [newKeyword.trim().toLowerCase()]: parseInt(newSlideNumber) };
    try {
      setSlideMappings(next);
      await saveUserSettings({ slide_mappings: next });
      setNewKeyword("");
      setNewSlideNumber("");
      toast.success("Mapeamento de slide adicionado!");
    } catch (err) {
      toast.error("Erro ao salvar mapeamento");
    }
  };

  const handleRemoveSlideMapping = async (keyword: string) => {
    const next = { ...slideMappings };
    delete next[keyword];
    try {
      setSlideMappings(next);
      await saveUserSettings({ slide_mappings: next });
      toast.success("Mapeamento removido");
    } catch (err) {
      toast.error("Erro ao remover mapeamento");
    }
  };

  const handleScanDocx = async () => {
    setScanningDocx(true);
    try {
      const tokens = await scanDocxTemplate();
      const filtered = tokens.filter(k => !k.startsWith("__"));
      setDocxTokens(filtered);

      const nextMappings = { ...docxMappings };
      tokens.forEach(t => {
        if (nextMappings[t] === undefined) nextMappings[t] = "";
      });

      setDocxMappings(nextMappings);
      await saveUserSettings({ docx_mappings: nextMappings });

      if (tokens.length > 0) {
        toast.success(`${tokens.length} tokens encontrados.`);
      } else {
        toast.info("Nenhum novo token encontrado no template.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Falha ao escanear template.");
    } finally {
      setScanningDocx(false);
    }
  };

  const handleUpdateDocxMapping = async (token: string, field: string) => {
    const next = { ...docxMappings, [token]: field };
    setDocxMappings(next);
    try {
      await saveUserSettings({ docx_mappings: next });
      // success toast is handled by individual change if desired, but here we just ensure state is updated
    } catch (err) {
      toast.error("Erro ao salvar mapeamento");
    }
  };

  const handleUploadDocx = async () => {
    if (!docxFile) return;
    setUploadingDocx(true);
    setUploadProgress(10);
    
    // Simulate upload progress animation
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) return 90;
        const remaining = 90 - prev;
        return Math.min(90, prev + Math.ceil(remaining * 0.15));
      });
    }, 300);

    try {
      const bucketName = "templates";
      const fileName = `proposal-template-${Date.now()}.docx`;

      // Upload file directly using Supabase SDK (handles session and boundary headers automatically)
      const { data, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(fileName, docxFile, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) throw uploadError;

      clearInterval(progressInterval);
      setUploadProgress(100);

      const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(fileName);
      await saveUserSettings({ pptx_template_url: publicUrl });
      setDocxTemplateUrl(publicUrl);
      setDocxFile(null);
      toast.success("Template DOCX enviado com sucesso!");
    } catch (err: any) {
      clearInterval(progressInterval);
      console.error("Upload error:", err);
      const errMsg = String(err?.message || err || "").toLowerCase();
      const isRlsError = errMsg.includes("row-level security") || 
                         errMsg.includes("security policy") || 
                         errMsg.includes("violates row-level") ||
                         errMsg.includes("policy");
      if (isRlsError) {
        setShowRlsModal(true);
      }
      toast.error("Erro ao subir template: " + (err?.message || String(err)));
    } finally {
      setUploadingDocx(false);
      setTimeout(() => setUploadProgress(0), 2500);
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);

    try {
      await saveUserSettings({
        seller_name: sellerName,
        seller_role: sellerRole,
        seller_email: sellerEmail,
        seller_phone: sellerPhone
      });
      toast.success("Perfil atualizado com sucesso!");
    } catch (err: any) {
      console.error("Erro ao salvar perfil:", err);
      toast.error("Erro ao salvar perfil: " + (err.message || "Erro desconhecido"));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCopySql = () => {
    const sqlText = `-- DELETAR POLÍTICAS ANTIGAS SE EXISTIREM\n` +
      `DROP POLICY IF EXISTS "Leitura pública de templates" ON storage.objects;\n` +
      `DROP POLICY IF EXISTS "Inserção de templates por usuários autenticados" ON storage.objects;\n` +
      `DROP POLICY IF EXISTS "Inserção de templates por qualquer usuário" ON storage.objects;\n` +
      `DROP POLICY IF EXISTS "Atualização de templates por usuários autenticados" ON storage.objects;\n` +
      `DROP POLICY IF EXISTS "Atualização de templates por qualquer usuário" ON storage.objects;\n` +
      `DROP POLICY IF EXISTS "Deleção de templates por usuários autenticados" ON storage.objects;\n` +
      `DROP POLICY IF EXISTS "Deleção de templates por qualquer usuário" ON storage.objects;\n` +
      `\n` +
      `-- CRIAR NOVAS POLÍTICAS PARA O BUCKET DE TEMPLATES (storage.objects)\n` +
      `-- 1. Permitir leitura pública dos arquivos do bucket 'templates'\n` +
      `CREATE POLICY "Leitura pública de templates" ON storage.objects FOR SELECT USING (bucket_id = 'templates');\n` +
      `\n` +
      `-- 2. Permitir inserção por qualquer usuário (autenticado ou anônimo)\n` +
      `CREATE POLICY "Inserção de templates por qualquer usuário" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'templates');\n` +
      `\n` +
      `-- 3. Permitir atualização por qualquer usuário\n` +
      `CREATE POLICY "Atualização de templates por qualquer usuário" ON storage.objects FOR UPDATE USING (bucket_id = 'templates') WITH CHECK (bucket_id = 'templates');\n` +
      `\n` +
      `-- 4. Permitir deleção por qualquer usuário\n` +
      `CREATE POLICY "Deleção de templates por qualquer usuário" ON storage.objects FOR DELETE USING (bucket_id = 'templates');`;
    navigator.clipboard.writeText(sqlText);
    toast.success("Código SQL copiado para a área de transferência!");
  };

  const docxMappedCount = Object.keys(docxMappings || {}).filter(k => docxMappings[k] && docxMappings[k] !== "none").length;
  const docxTotalTokens = docxTokens.length;

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Configurações</h1>
          {!canAccessSettings && (
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
              <Lock className="h-3 w-3" /> Algumas seções estão restritas ao administrador.
            </p>
          )}
        </div>
        <Button variant="outline" onClick={() => navigate("/")}>Voltar</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Type className="h-5 w-5" />
                Preferências de Interface
              </CardTitle>
              <CardDescription>Ajuste como o sistema aparece para você.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Tamanho do Texto Global</Label>
                <Select value={fontSize} onValueChange={handleSaveFontSize}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Escolha um tamanho" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Pequeno (Compacto)</SelectItem>
                    <SelectItem value="medium">Médio (Padrão)</SelectItem>
                    <SelectItem value="large">Grande</SelectItem>
                    <SelectItem value="extra-large">Extra Grande</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {canAccessSettings ? (
            <>
              <ProductFieldsTab />
              <Card className="border-primary/20 shadow-lg">
                <CardHeader className="bg-primary/10 dark:bg-primary/5">
                  <CardTitle className="flex items-center gap-2">
                    <ScanText className="h-5 w-5 text-primary" />
                    Template e Mapeamento DOCX
                  </CardTitle>
                  <CardDescription>Gerencie o arquivo de template Word (.docx) e configure as substituições de variáveis.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  {/* Current File status */}
                  <div className="p-4 bg-muted/40 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border">
                    <div className="space-y-1">
                      <p className="text-sm font-bold">Template Ativo:</p>
                      <p className="text-xs text-muted-foreground break-all max-w-md">
                        {docxTemplateUrl ? docxTemplateUrl : "Padrão do Sistema (/Solicitação de vistoria.docx)"}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0 w-full sm:w-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(docxTemplateUrl || "/proposal-template.docx", "_blank")}
                        className="rounded-xl w-full sm:w-auto"
                      >
                        Ver/Baixar Arquivo
                      </Button>
                      <Button
                        onClick={() => navigate("/token-scan")}
                        size="sm"
                        className="rounded-xl font-bold w-full sm:w-auto"
                      >
                        Mapear Tokens
                      </Button>
                    </div>
                  </div>
                  {/* Upload Form */}
                  <div className="space-y-3">
                    <Label className="font-semibold text-sm">Alterar Template (Subir arquivo .docx)</Label>
                    <div className="flex flex-col sm:flex-row gap-3 items-center">
                      <Input
                        type="file"
                        accept=".docx"
                        onChange={(e) => { setDocxFile(e.target.files?.[0] || null); setUploadProgress(0); }}
                        className="rounded-xl bg-background cursor-pointer"
                        disabled={uploadingDocx}
                      />
                      <Button
                        onClick={handleUploadDocx}
                        disabled={!docxFile || uploadingDocx}
                        className="rounded-xl shrink-0 font-bold w-full sm:w-auto min-w-[160px]"
                      >
                        {uploadingDocx
                          ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{uploadProgress > 0 ? `${uploadProgress}%` : "Preparando..."}</>
                          : "Subir Novo Template"}
                      </Button>
                    </div>

                    {/* Progress bar */}
                    {uploadingDocx && (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-muted-foreground font-medium">
                          <span>{uploadProgress < 100 ? "Enviando arquivo..." : "Finalizando..."}</span>
                          <span className="font-bold text-primary">{uploadProgress}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                          <div
                            className="h-2.5 rounded-full transition-all duration-300 ease-out"
                            style={{
                              width: `${uploadProgress}%`,
                              background: "linear-gradient(90deg, #f47321, #ff9a4d)"
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {docxFile && !uploadingDocx && (
                      <p className="text-xs text-muted-foreground">
                        Arquivo selecionado: <strong>{docxFile.name}</strong> ({(docxFile.size / 1024).toFixed(1)} KB)
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground italic">
                      * O template DOCX deve conter variáveis no formato <code className="bg-muted px-1 rounded">{"{{companyName}}"}</code> para funcionar.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="docx-mapping">
                  <Card className="border">
                    <CardHeader className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileCheck className="h-5 w-5 text-primary" />
                        <div>
                          <div className="font-bold">Mapeamento de Tokens do Template Vistoria (DOCX)</div>
                          <div className="text-xs text-muted-foreground">
                            {docxMappedCount} mapeado(s) {docxTotalTokens ? `• ${docxTotalTokens} token(s) detectado(s)` : ""}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Button size="sm" variant="ghost" onClick={handleScanDocx} disabled={scanningDocx}>
                          {scanningDocx ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ScanText className="h-4 w-4 mr-2" />}
                          Escanear
                        </Button>

                        <AccordionTrigger className="rounded-md px-3 py-2 bg-muted/10 hover:bg-muted">
                          Ver mapeamentos
                        </AccordionTrigger>
                      </div>
                    </CardHeader>

                    <AccordionContent>
                      <CardContent className="space-y-6">
                        <p className="text-sm text-muted-foreground mb-2">
                          Associe as tags encontradas no DOCX aos campos do formulário de vistoria.
                        </p>

                        {docxTokens.length > 0 ? (
                          <div className="space-y-3">
                            {docxTokens.map(token => (
                              <div key={token} className="flex flex-col gap-2 p-3 bg-card border rounded-lg shadow-sm">
                                <div className="flex items-center gap-3 w-full">
                                  <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-1 rounded min-w-[120px] text-center shrink-0">
                                    {"{{"}{token}{"}}"}
                                  </span>
                                  <div className="flex-1">
                                    <Select
                                      value={docxMappings[token] ?? ""}
                                      onValueChange={(val) => handleUpdateDocxMapping(token, val)}
                                    >
                                      <SelectTrigger className="h-9">
                                        <SelectValue placeholder="Selecione o campo correspondente" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="none">-- Ignorar --</SelectItem>
                                        {VISTORIA_FIELDS.map(f => (
                                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                                {docxMappings[token] === "ensaios_inclusos" && (
                                  <div className="mt-2 grid grid-cols-2 gap-3 pl-0 md:pl-[132px]">
                                    <div className="space-y-1.5">
                                      <Label className="text-[10px] text-neutral-500 font-bold uppercase">Texto se Sim</Label>
                                      <Input
                                        className="h-8 text-xs rounded-xl"
                                        placeholder="Ex: já"
                                        value={docxMappings["__ensaios_yes"] ?? ""}
                                        onChange={(e) => handleUpdateDocxMapping("__ensaios_yes", e.target.value)}
                                      />
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label className="text-[10px] text-neutral-500 font-bold uppercase">Texto se Não</Label>
                                      <Input
                                        className="h-8 text-xs rounded-xl"
                                        placeholder="Ex: não"
                                        value={docxMappings["__ensaios_no"] ?? ""}
                                        onChange={(e) => handleUpdateDocxMapping("__ensaios_no", e.target.value)}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-6 text-muted-foreground italic">
                            Nenhum token detectado. Clique em "Escanear" para ler o template DOCX.
                          </div>
                        )}

                        <div className="flex justify-end">
                          <Button onClick={async () => {
                            await saveUserSettings({ docx_mappings: docxMappings });
                            toast.success("Mapeamentos salvos com sucesso");
                          }}>
                            Salvar Mapeamentos
                          </Button>
                        </div>
                      </CardContent>
                    </AccordionContent>
                  </Card>
                </AccordionItem>
              </Accordion>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LayoutList className="h-5 w-5" />
                    Mapeamento Dinâmico de Tokens (DOCX)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-3 items-end p-4 bg-muted/30 rounded-xl border border-dashed">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-xs">Palavra-chave</Label>
                      <Input placeholder="Ex: Botoeira" value={newKeyword} onChange={e => setNewKeyword(e.target.value)} />
                    </div>
                    <div className="w-24 space-y-1.5">
                      <Label className="text-xs">Slide nº</Label>
                      <Input type="number" placeholder="Ex: 47" value={newSlideNumber} onChange={e => setNewSlideNumber(e.target.value)} />
                    </div>
                    <Button onClick={handleAddSlideMapping} size="icon"><Plus className="h-4 w-4" /></Button>
                  </div>

                  <div className="space-y-2">
                    {Object.entries(slideMappings).map(([kw, slide]) => (
                      <div key={kw} className="flex items-center justify-between p-3 bg-card border rounded-lg shadow-sm">
                        <div className="flex items-center gap-4">
                          <span className="text-sm font-bold bg-primary/10 text-primary px-2 py-0.5 rounded uppercase">"{kw}"</span>
                          <span className="text-sm text-muted-foreground">Inclui slide: <strong>{slide}</strong></span>
                        </div>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleRemoveSlideMapping(kw)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>



              <Card>
                <CardHeader><CardTitle>Bases Salvas</CardTitle></CardHeader>
                <CardContent className="space-y-8">
                  {bases.map(base => (
                    <div key={base.id} className="p-6 border rounded-2xl space-y-4 bg-muted/30">
                      <div className="flex items-center justify-between border-b pb-2">
                        <h3 className="font-bold">{base.name}</h3>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { if(confirm("Remover base?")) deleteBase(base.id!).then(loadBases); }}>Remover</Button>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold">Coluna Nome</Label>
                          <select className="w-full text-xs border rounded p-1" value={base.name_column || ""} onChange={e => updateBaseMapping(base, "name_column", e.target.value)}>
                            <option value="">-- Automático --</option>
                            {base.headers.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold">Coluna Descrição</Label>
                          <select className="w-full text-xs border rounded p-1" value={base.description_column || ""} onChange={e => updateBaseMapping(base, "description_column", e.target.value)}>
                            <option value="">-- Automático --</option>
                            {base.headers.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="bg-muted/20 py-12 text-center">
              <Lock className="h-12 w-12 mx-auto text-neutral-300 mb-4" />
              <h3 className="font-bold">Acesso Restrito</h3>
              <p className="text-sm text-neutral-500">Configurações de bases e mapeamentos são limitadas a administradores.</p>
            </Card>
          )}

          {isSuperAdmin && (
            <Card className="bg-green-50/30 border-green-100">
              <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-green-600" /> Gestão de Usuários</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {allUsers.map(u => (
                  <div key={u.user_id} className="flex items-center justify-between p-3 bg-card border rounded-xl">
                    <div>
                      <p className="font-bold text-sm">{u.seller_name || "Sem Nome"}</p>
                      <p className="text-xs text-muted-foreground">{u.seller_email}</p>
                    </div>
                    <div className="flex gap-4">
                      <div className="flex flex-col items-end text-[10px]">
                        <span>Histórico</span>
                        <Switch checked={!!u.can_view_history} onCheckedChange={() => toggleUserPermission(u.user_id, u.seller_email, 'history', !!u.can_view_history)} />
                      </div>
                      <div className="flex flex-col items-end text-[10px]">
                        <span>Configurações</span>
                        <Switch checked={!!u.can_access_settings} onCheckedChange={() => toggleUserPermission(u.user_id, u.seller_email, 'settings', !!u.can_access_settings)} />
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="h-fit lg:sticky lg:top-6 shadow-md overflow-hidden">
          <CardHeader className="border-b bg-muted/30">
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Perfil do Vendedor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2"><Label>Nome Completo</Label><Input value={sellerName} onChange={e => setSellerName(e.target.value)} /></div>
            <div className="space-y-2"><Label>Cargo</Label><Input value={sellerRole} onChange={e => setSellerRole(e.target.value)} /></div>
            <div className="space-y-2"><Label>E-mail</Label><Input value={sellerEmail} onChange={e => setSellerEmail(e.target.value)} /></div>
            <div className="space-y-2"><Label>Telefone</Label><Input value={sellerPhone} onChange={e => setSellerPhone(e.target.value)} /></div>
            <Button onClick={handleSaveProfile} className="w-full font-bold" disabled={savingProfile}>
              {savingProfile && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Salvar Perfil
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Modal de Instrução de RLS do Supabase */}
      <Dialog open={showRlsModal} onOpenChange={setShowRlsModal}>
        <DialogContent className="max-w-2xl bg-card rounded-2xl border-primary/20 shadow-2xl p-6">
          <DialogHeader className="space-y-3">
            <div className="flex items-center gap-3 text-destructive">
              <div className="p-3 bg-destructive/10 rounded-2xl">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold tracking-tight">Erro de Permissão (RLS) no Supabase</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground mt-1">
                  O bucket de armazenamento <strong>templates</strong> não permite uploads devido às políticas de segurança de linha (Row Level Security).
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 my-2">
            <div className="p-4 bg-muted/50 border rounded-2xl text-sm space-y-2.5">
              <h4 className="font-bold flex items-center gap-2 text-primary">
                <Info className="h-4 w-4" /> Como resolver isso no painel do Supabase:
              </h4>
              <ol className="list-decimal pl-5 space-y-1.5 text-xs text-muted-foreground">
                <li>Acesse o painel do seu projeto no <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5 font-semibold">Supabase Dashboard <ExternalLink className="h-3 w-3" /></a>.</li>
                <li>No menu lateral esquerdo, clique em <strong>SQL Editor</strong> (ícone de terminal/código).</li>
                <li>Clique em <strong>New query</strong> (Nova consulta).</li>
                <li>Copie o script SQL abaixo, cole no editor e clique no botão <strong>Run</strong> (Executar).</li>
              </ol>
            </div>

            <div className="relative">
              <div className="flex justify-between items-center bg-zinc-900 text-zinc-100 rounded-t-xl px-4 py-2 text-xs font-mono">
                <span>supabase_storage_policies.sql</span>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={handleCopySql} 
                  className="text-zinc-400 hover:text-white hover:bg-zinc-800 h-8 rounded-lg font-bold gap-1"
                >
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copiar SQL
                </Button>
              </div>
              <pre className="p-4 bg-zinc-950 text-zinc-300 rounded-b-xl overflow-x-auto text-[11px] font-mono leading-relaxed max-h-48 border border-t-0">
{`-- DELETAR POLÍTICAS ANTIGAS SE EXISTIREM
DROP POLICY IF EXISTS "Leitura pública de templates" ON storage.objects;
DROP POLICY IF EXISTS "Inserção de templates por usuários autenticados" ON storage.objects;
DROP POLICY IF EXISTS "Inserção de templates por qualquer usuário" ON storage.objects;
DROP POLICY IF EXISTS "Atualização de templates por usuários autenticados" ON storage.objects;
DROP POLICY IF EXISTS "Atualização de templates por qualquer usuário" ON storage.objects;
DROP POLICY IF EXISTS "Deleção de templates por usuários autenticados" ON storage.objects;
DROP POLICY IF EXISTS "Deleção de templates por qualquer usuário" ON storage.objects;

-- CRIAR NOVAS POLÍTICAS PARA O BUCKET DE TEMPLATES (storage.objects)

-- 1. Permitir leitura pública dos arquivos do bucket 'templates'
CREATE POLICY "Leitura pública de templates" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'templates');

-- 2. Permitir inserção por qualquer usuário (autenticado ou anônimo)
CREATE POLICY "Inserção de templates por qualquer usuário" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'templates');

-- 3. Permitir atualização por qualquer usuário
CREATE POLICY "Atualização de templates por qualquer usuário" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'templates') 
WITH CHECK (bucket_id = 'templates');

-- 4. Permitir deleção por qualquer usuário
CREATE POLICY "Deleção de templates por qualquer usuário" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'templates');`}
              </pre>
            </div>
            
            <p className="text-[11px] text-muted-foreground italic text-center">
              * Nota: Se o bucket 'templates' ainda não existir, certifique-se de criá-lo como "Public" na seção Storage do painel antes de aplicar as políticas.
            </p>
          </div>

          <DialogFooter>
            <Button onClick={() => setShowRlsModal(false)} className="w-full sm:w-auto font-bold rounded-xl">
              Entendido, vou configurar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}