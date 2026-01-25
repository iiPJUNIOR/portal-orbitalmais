"use client";

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, Settings as SettingsIcon, ScanText } from "lucide-react";
import * as googleClient from "@/integrations/google/client";
import { fetchBases, saveBase, deleteBase, type StoredBase } from "@/services/productBaseService";
import { getUserSettings, saveUserSettings } from "@/services/settingsService";

export default function Settings() {
  const navigate = useNavigate();
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

  const loadBases = async () => {
    try {
      const data = await fetchBases();
      setBases(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadBases();
    (async () => {
      const s = await getUserSettings();
      if (s) {
        setSellerName(s.seller_name || "");
        setSellerRole(s.seller_role || "");
        setSellerEmail(s.seller_email || "");
        setSellerPhone(s.seller_phone || "");
        setSpreadsheetLink(s.spreadsheet_link || "");
      }
    })();
  }, []);

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

  const addExtraColumn = (base: StoredBase) => {
    const current = base.extra_columns || [];
    updateBaseMapping(base, "extra_columns", [...current, ""]);
  };

  const updateExtraColumn = (base: StoredBase, index: number, value: string) => {
    const current = [...(base.extra_columns || [])];
    current[index] = value;
    updateBaseMapping(base, "extra_columns", current);
  };

  const removeExtraColumn = (base: StoredBase, index: number) => {
    const current = [...(base.extra_columns || [])];
    current.splice(index, 1);
    updateBaseMapping(base, "extra_columns", current);
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Configurações</h1>
        <Button variant="outline" onClick={() => navigate("/")}>Voltar</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-primary/20 shadow-lg">
            <CardHeader className="bg-primary/5">
              <CardTitle className="flex items-center gap-2">
                <ScanText className="h-5 w-5" />
                Mapeamento de Tokens do Template
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-4">
                Se campos como <strong>Razão Social</strong> ou <strong>CNPJ</strong> não estiverem saindo na proposta, use esta ferramenta para sincronizar os nomes das variáveis do seu arquivo PPTX com o sistema.
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
                        className="w-full text-xs border rounded-lg p-1.5 bg-white focus:ring-1 focus:ring-primary outline-none transition-all" 
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
                        className="w-full text-xs border rounded-lg p-1.5 bg-white focus:ring-1 focus:ring-primary outline-none transition-all" 
                        value={base.description_column || ""} 
                        onChange={e => updateBaseMapping(base, "description_column", e.target.value)}
                      >
                        <option value="">-- Automático --</option>
                        {base.headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    <div className="md:col-span-2 pt-2">
                      <div className="flex items-center justify-between mb-3">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Informações Adicionais</Label>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-7 text-[10px] rounded-full px-3" 
                          onClick={() => addExtraColumn(base)}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add Coluna
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
                        {(base.extra_columns || []).map((col, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 group">
                            <select 
                              className="w-full text-[10px] border rounded-lg p-1.5 bg-white focus:ring-1 focus:ring-primary outline-none transition-all" 
                              value={col} 
                              onChange={e => updateExtraColumn(base, idx, e.target.value)}
                            >
                              <option value="">-- Selecione --</option>
                              {base.headers.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive flex-shrink-0" 
                              onClick={() => removeExtraColumn(base, idx)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                        {(base.extra_columns || []).length === 0 && (
                          <p className="text-[10px] text-muted-foreground italic col-span-full">Nenhuma informação adicional configurada.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {bases.length === 0 && <p className="text-center text-muted-foreground py-10 border-2 border-dashed rounded-xl">Nenhuma base cadastrada ainda.</p>}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit lg:sticky lg:top-6">
          <CardHeader><CardTitle>Perfil do Vendedor</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Nome</Label><Input value={sellerName} onChange={e => setSellerName(e.target.value)} /></div>
            <div className="space-y-2"><Label>Cargo</Label><Input value={sellerRole} onChange={e => setSellerRole(e.target.value)} /></div>
            <div className="space-y-2"><Label>E-mail</Label><Input value={sellerEmail} onChange={e => setSellerEmail(e.target.value)} /></div>
            <div className="space-y-2"><Label>Telefone</Label><Input value={sellerPhone} onChange={e => setSellerPhone(e.target.value)} /></div>
            <Button onClick={() => saveUserSettings({ seller_name: sellerName, seller_role: sellerRole, seller_email: sellerEmail, seller_phone: sellerPhone }).then(() => toast.success("Perfil atualizado!"))} className="w-full">Salvar Perfil</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}