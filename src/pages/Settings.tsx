"use client";

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, Settings as SettingsIcon, ScanText, ShieldCheck, Users, Lock } from "lucide-react";
import * as googleClient from "@/integrations/google/client";
import { fetchBases, saveBase, deleteBase, type StoredBase } from "@/services/productBaseService";
import { getUserSettings, saveUserSettings, getAllUsersSettings, updateUserAccess } from "@/services/settingsService";
import { useSession } from "@/contexts/SessionProvider";
import { Switch } from "@/components/ui/switch";

export default function Settings() {
  const navigate = useNavigate();
  const { user } = useSession();
  const [connected, setConnected] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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
  
  const [hasFullAccess, setHasFullAccess] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  const isSuperAdmin = user?.email === "paulo.sergio@controlid.com.br";

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
        setHasFullAccess(!!s.has_full_access || isSuperAdmin);
      } else if (isSuperAdmin) {
        setHasFullAccess(true);
      }
      
      if (isSuperAdmin || s?.has_full_access) {
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

  const toggleUserAccess = async (userId: string, currentAccess: boolean) => {
    try {
      await updateUserAccess(userId, !currentAccess);
      toast.success("Acesso atualizado");
      loadAllUsers();
    } catch (err) {
      toast.error("Erro ao atualizar acesso");
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Configurações</h1>
          {!hasFullAccess && (
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
              <Lock className="h-3 w-3" /> Algumas seções estão restritas ao administrador.
            </p>
          )}
        </div>
        <Button variant="outline" onClick={() => navigate("/")}>Voltar</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Seções Restritas */}
          {hasFullAccess ? (
            <>
              <Card className="border-primary/20 shadow-lg">
                <CardHeader className="bg-primary/5">
                  <CardTitle className="flex items-center gap-2">
                    <ScanText className="h-5 w-5" />
                    Mapeamento de Tokens do Template
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground mb-4">
                    Sincronize as variáveis do seu arquivo PPTX com o sistema.
                  </p>
                  <Button onClick={() => navigate("/token-scan")} className="w-full h-12 text-lg font-bold">
                    Mapear Variáveis do Template
                  </Button>
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
                        <select className="w-full border rounded p-2" value={selectedSheet || ""} onChange={e => setSelectedSheet(e.target.value)}>
                          {sheetTitles.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>Nome da Base</Label>
                        <Input value={newBaseName} onChange={e => setNewBaseName(e.target.value)} placeholder="Ex: Catálogo 2024" />
                      </div>
                    </div>
                  )}

                  <Button onClick={handleSaveImportedBase} className="w-full" disabled={!selectedSheet || !newBaseName}>Salvar Base no Servidor</Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Bases Salvas e Mapeamento</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                  {bases.map(base => (
                    <div key={base.id} className="p-6 border rounded-2xl space-y-6 bg-gray-50/50 shadow-sm">
                      <div className="flex items-center justify-between border-b pb-4">
                        <div className="flex items-center gap-2">
                          <SettingsIcon className="h-5 w-5 text-primary" />
                          <h3 className="font-bold text-lg">{base.name}</h3>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-destructive hover:bg-destructive/10 text-xs h-8" 
                          onClick={() => deleteBase(base.id!).then(loadBases)}
                        >
                          Remover Base
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Coluna Nome do Produto</Label>
                          <select 
                            className="w-full text-xs border rounded-lg p-1.5 bg-white" 
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
                            className="w-full text-xs border rounded-lg p-1.5 bg-white" 
                            value={base.description_column || ""} 
                            onChange={e => updateBaseMapping(base, "description_column", e.target.value)}
                          >
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
            <Card className="bg-neutral-50 border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Lock className="h-12 w-12 text-neutral-300 mb-4" />
                <h3 className="text-lg font-bold text-neutral-900">Configurações Avançadas Restritas</h3>
                <p className="text-sm text-neutral-500 max-w-sm mt-2">
                  As opções de importação de bases e mapeamento de tokens estão disponíveis apenas para administradores autorizados.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Gestão de Acessos (Apenas para Paulo) */}
          {isSuperAdmin && (
            <Card className="border-green-100 bg-green-50/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-green-600" />
                  Gestão de Acessos
                </CardTitle>
                <CardDescription>Libere o acesso às configurações avançadas para outros usuários.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {allUsers.map(u => (
                    <div key={u.user_id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-green-100 shadow-sm">
                      <div>
                        <p className="font-bold text-sm">{u.seller_name || "Sem Nome"}</p>
                        <p className="text-xs text-muted-foreground">{u.seller_email}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-neutral-500">Acesso Total</span>
                        <Switch 
                          checked={u.has_full_access} 
                          disabled={u.seller_email === "paulo.sergio@controlid.com.br"}
                          onCheckedChange={() => toggleUserAccess(u.user_id, u.has_full_access)} 
                        />
                      </div>
                    </div>
                  ))}
                  {allUsers.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum usuário cadastrado.</p>}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Perfil do Vendedor (Sempre visível) */}
        <Card className="h-fit lg:sticky lg:top-6 shadow-md">
          <CardHeader className="border-b bg-neutral-50/50">
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
              onClick={() => saveUserSettings({ 
                seller_name: sellerName, 
                seller_role: sellerRole, 
                seller_email: sellerEmail, 
                seller_phone: sellerPhone 
              }).then(() => toast.success("Perfil atualizado!"))} 
              className="w-full h-11 font-bold"
            >
              Salvar Perfil
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}