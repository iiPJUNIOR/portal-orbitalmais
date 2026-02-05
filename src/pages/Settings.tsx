"use client";

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, Settings as SettingsIcon, ScanText, ShieldCheck, Users, Lock, Type, Info, LayoutList, Loader2, FileCheck } from "lucide-react";
import * as googleClient from "@/integrations/google/client";
import { fetchBases, saveBase, deleteBase, type StoredBase } from "@/services/productBaseService";
import { getUserSettings, saveUserSettings, getAllUsersSettings, updateUserPermission } from "@/services/settingsService";
import { useSession } from "@/contexts/SessionProvider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { scanDocxTemplate } from "@/utils/docxScanner";

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

  const [canAccessSettings, setCanAccessSettings] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  const PAULO_EMAIL = "paulo.sergio@controlid.com.br";
  const isSuperAdmin = String(user?.email || "").toLowerCase() === PAULO_EMAIL;

  const VISTORIA_FIELDS = [
    { value: "vendedor", label: "Vendedor" },
    { value: "empresa", label: "Empresa (Razão Social)" },
    { value: "cnpj", label: "CNPJ" },
    { value: "empresa_phone", label: "Telefone da Empresa" },
    { value: "empresa_email", label: "E-mail da Empresa" },
    { value: "contato_nome", label: "Nome do Contato" },
    { value: "contato_telefone", label: "Telefone do Contato" },
    { value: "cep", label: "CEP" },
    { value: "rua", label: "Rua" },
    { value: "numero", label: "Número" },
    { value: "complemento", label: "Complemento" },
    { value: "bairro", label: "Bairro" },
    { value: "cidade", label: "Cidade" },
    { value: "uf", label: "UF" },
    { value: "endereco", label: "Endereço Completo (Bloco)" },
    { value: "quantidade", label: "Quantidade" },
    { value: "produto", label: "Produto" },
    { value: "observacoes", label: "Observações" },
  ];

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
        setDocxMappings(s.docx_mappings || {});
        setCanAccessSettings(!!s?.can_access_settings || isSuperAdmin);
      } else if (isSuperAdmin) {
        setCanAccessSettings(true);
      }

      if (isSuperAdmin || s?.can_access_settings) {
        loadBases();
      }

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
      if (tokens.length > 0) {
        setDocxTokens(tokens);
        toast.success(`${tokens.length} tokens encontrados no template de vistoria.`);
      } else {
        toast.error("Nenhum token encontrado no template.");
      }
    } catch (err) {
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
      toast.success("Mapeamento salvo!");
    } catch (err) {
      toast.error("Erro ao salvar mapeamento");
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
          {/* Seção acessível a todos: Preferências */}
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
                <p className="text-[10px] text-muted-foreground">Isso ajustará o tamanho de todos os textos do sistema.</p>
              </div>
            </CardContent>
          </Card>

          {/* Seções Restritas */}
          {canAccessSettings ? (
            <>
              <Card className="border-primary/20 shadow-lg">
                <CardHeader className="bg-primary/10 dark:bg-primary/5">
                  <CardTitle className="flex items-center gap-2">
                    <ScanText className="h-5 w-5" />
                    Mapeamento de Tokens do Template PPTX
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground mb-4">
                    Sincronize as variáveis do seu arquivo PPTX com o sistema.
                  </p>
                  <Button onClick={() => navigate("/token-scan")} className="w-full h-12 text-lg font-bold">
                    Mapear Variáveis do Template PPTX
                  </Button>
                </CardContent>
              </Card>

              {/* Novo Mapeamento DOCX Vistoria */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileCheck className="h-5 w-5 text-primary" />
                    Mapeamento de Tokens do Template Vistoria (DOCX)
                  </CardTitle>
                  <CardDescription>Associe as tags do seu arquivo DOCX aos campos do formulário de vistoria.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="p-4 border rounded-xl bg-muted/30 border-dashed flex items-center justify-between">
                    <div>
                      <p className="font-bold text-sm">Escanear Template</p>
                      <p className="text-xs text-muted-foreground">Identifica todos os {"{{campos}}"} dentro do arquivo DOCX.</p>
                    </div>
                    <Button onClick={handleScanDocx} disabled={scanningDocx}>
                      {scanningDocx ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ScanText className="h-4 w-4 mr-2" />}
                      Escanear Agora
                    </Button>
                  </div>

                  {docxTokens.length > 0 && (
                    <div className="space-y-3">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tags Encontradas no DOCX</Label>
                      <div className="grid grid-cols-1 gap-2">
                        {docxTokens.map(token => (
                          <div key={token} className="flex items-center gap-3 p-3 bg-card border rounded-lg shadow-sm">
                            <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-1 rounded min-w-[120px] text-center">
                              {"{{"}{token}{"}}"}
                            </span>
                            <div className="flex-1">
                              <Select
                                value={docxMappings[token] || ""}
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
                        ))}
                      </div>
                    </div>
                  )}

                  {docxTokens.length === 0 && (
                    <p className="text-center py-6 text-sm text-muted-foreground italic">
                      Clique em "Escanear Agora" para começar o mapeamento do template DOCX.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LayoutList className="h-5 w-5" />
                    Mapeamento Dinâmico de Slides (PPTX)
                  </CardTitle>
                  <CardDescription>
                    Configure palavras-chave que, se encontradas no nome/descrição do produto, incluem um slide específico.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-3 items-end p-4 bg-muted/30 rounded-xl border border-dashed">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-xs">Palavra-chave</Label>
                      <Input
                        placeholder="Ex: Botoeira"
                        value={newKeyword}
                        onChange={e => setNewKeyword(e.target.value)}
                      />
                    </div>
                    <div className="w-24 space-y-1.5">
                      <Label className="text-xs">Slide nº</Label>
                      <Input
                        type="number"
                        placeholder="Ex: 47"
                        value={newSlideNumber}
                        onChange={e => setNewSlideNumber(e.target.value)}
                      />
                    </div>
                    <Button onClick={handleAddSlideMapping} size="icon">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {Object.entries(slideMappings).map(([kw, slide]) => (
                      <div key={kw} className="flex items-center justify-between p-3 bg-card border rounded-lg shadow-sm">
                        <div className="flex items-center gap-4">
                          <span className="text-sm font-bold bg-primary/10 text-primary px-2 py-0.5 rounded uppercase">
                            "{kw}"
                          </span>
                          <span className="text-sm text-muted-foreground">
                            Inclui slide: <strong className="text-foreground">{slide}</strong>
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemoveSlideMapping(kw)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {Object.keys(slideMappings).length === 0 && (
                      <div className="text-center py-6 text-muted-foreground text-sm italic">
                        Nenhuma palavra-chave cadastrada.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Importar Nova Base</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label>Link da Planilha</Label>
                    <div className="flex gap-2">
                      <Input value={spreadsheetLink} onChange={e => setSpreadsheetLink(e.target.value)} placeholder="https://..." />
                      <Button onClick={handleConnect}>{connected ? "Reconectar" : "Conectar"}</Button>
                      <Button variant="outline" onClick={handleLoadSheets} disabled={!connected}>Abas</Button>
                    </div>
                  </div>

                  {sheetTitles.length > 0 && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Aba</Label>
                        <select className="w-full border rounded p-2 bg-background" value={selectedSheet || ""} onChange={e => setSelectedSheet(e.target.value)}>
                          {sheetTitles.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>Nome da Base</Label>
                        <Input value={newBaseName} onChange={e => setNewBaseName(e.target.value)} placeholder="Ex: Catálogo 2024" />
                      </div>
                    </div>
                  )}

                  <Button onClick={handleSaveImportedBase} className="w-full" disabled={!selectedSheet || !newBaseName || loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Salvar Base no Servidor
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Bases Salvas e Mapeamento</CardTitle>
                  <CardDescription>Defina quais colunas da planilha representam cada informação no assistente.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                  {bases.map(base => (
                    <div key={base.id} className="p-6 border rounded-2xl space-y-6 bg-muted/30 dark:bg-muted/10 shadow-sm">
                      <div className="flex items-center justify-between border-b pb-4">
                        <div className="flex items-center gap-2">
                          <SettingsIcon className="h-5 w-5 text-primary" />
                          <h3 className="font-bold text-lg">{base.name}</h3>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 text-xs h-8"
                          onClick={() => { if(confirm("Remover esta base?")) deleteBase(base.id!).then(loadBases); }}
                        >
                          Remover Base
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Coluna Nome do Produto</Label>
                          <select
                            className="w-full text-xs border rounded-lg p-1.5 bg-background"
                            value={base.name_column || ""}
                            onChange={e => updateBaseMapping(base, "name_column", e.target.value)}
                          >
                            <option value="">-- Automático --</option>
                            {base.headers.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Coluna Descrição</Label>
                          <select
                            className="w-full text-xs border rounded-lg p-1.5 bg-background"
                            value={base.description_column || ""}
                            onChange={e => updateBaseMapping(base, "description_column", e.target.value)}
                          >
                            <option value="">-- Automático --</option>
                            {base.headers.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-2">
                          Colunas Extras para Exibição (Passo 4)
                          <span title="Estas colunas aparecerão como detalhes adicionais na busca de produtos."><Info className="h-3 w-3" /></span>
                        </Label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-40 overflow-y-auto p-3 border rounded-xl bg-background/50">
                          {base.headers.map(header => (
                            <div key={header} className="flex items-center space-x-2">
                              <Checkbox
                                id={`extra-${base.id}-${header}`}
                                checked={(base.extra_columns || []).includes(header)}
                                onCheckedChange={() => handleToggleExtraColumn(base, header)}
                              />
                              <Label
                                htmlFor={`extra-${base.id}-${header}`}
                                className="text-[10px] truncate cursor-pointer font-medium"
                                title={header}
                              >
                                {header}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                  {bases.length === 0 && <p className="text-sm text-center text-muted-foreground py-10 border border-dashed rounded-2xl">Nenhuma base importada ainda.</p>}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="bg-muted/20 border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Lock className="h-12 w-12 text-neutral-300 mb-4" />
                <h3 className="text-lg font-bold">Configurações Avançadas Restritas</h3>
                <p className="text-sm text-neutral-500 max-w-sm mt-2">
                  As opções de importação de bases e mapeamento de tokens estão disponíveis apenas para administradores autorizados.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Gestão de Acessos (Apenas para Paulo) */}
          {isSuperAdmin && (
            <Card className="border-green-100 dark:border-green-900/30 bg-green-50/30 dark:bg-green-900/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-green-600" />
                  Gestão de Acessos
                </CardTitle>
                <CardDescription>Escolha quem pode acessar o histórico e as configurações do sistema.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2 border-t pt-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Lista de Usuários (registrados)</Label>
                  {allUsers.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-6 text-center">Nenhum usuário encontrado.</div>
                  ) : (
                    <div className="space-y-2">
                      {allUsers.map(u => (
                        <div key={u.user_id} className="flex items-center justify-between p-3 bg-card rounded-xl border border-border shadow-sm">
                          <div>
                            <p className="font-bold text-sm">{u.seller_name || "Sem Nome"}</p>
                            <p className="text-xs text-muted-foreground">{u.seller_email}</p>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="flex flex-col items-end text-xs">
                              <span className="font-medium">Histórico</span>
                              <Switch
                                checked={!!u.can_view_history}
                                disabled={String(u.seller_email || "").toLowerCase() === PAULO_EMAIL}
                                onCheckedChange={() => toggleUserPermission(u.user_id, u.seller_email || u.email, 'history', !!u.can_view_history)}
                              />
                            </div>
                            <div className="flex flex-col items-end text-xs">
                              <span className="font-medium">Configurações</span>
                              <Switch
                                checked={!!u.can_access_settings}
                                disabled={String(u.seller_email || "").toLowerCase() === PAULO_EMAIL}
                                onCheckedChange={() => toggleUserPermission(u.user_id, u.seller_email || u.email, 'settings', !!u.can_access_settings)}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Perfil do Vendedor */}
        <Card className="h-fit lg:sticky lg:top-6 shadow-md overflow-hidden">
          <CardHeader className="border-b bg-muted/30 dark:bg-muted/20">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Perfil do Vendedor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label>Nome Completo</Label>
              <Input value={sellerName} onChange={e => setSellerName(e.target.value)} placeholder="Seu nome na proposta" />
            </div>
            <div className="space-y-2">
              <Label>Cargo / Departamento</Label>
              <Input value={sellerRole} onChange={e => setSellerRole(e.target.value)} placeholder="Ex: Consultor de Vendas" />
            </div>
            <div className="space-y-2">
              <Label>E-mail Corporativo</Label>
              <Input value={sellerEmail} onChange={e => setSellerEmail(e.target.value)} placeholder="email@controlid.com.br" />
            </div>
            <div className="space-y-2">
              <Label>Telefone / WhatsApp</Label>
              <Input value={sellerPhone} onChange={e => setSellerPhone(e.target.value)} placeholder="(11) 99999-9999" />
            </div>
            <Button
              onClick={handleSaveProfile}
              className="w-full h-11 font-bold"
              disabled={savingProfile}
            >
              {savingProfile ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar Perfil
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}