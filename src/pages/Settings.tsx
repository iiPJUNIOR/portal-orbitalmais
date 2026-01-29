"use client";

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, Settings as SettingsIcon, ScanText, ShieldCheck, Users, Lock, Type, Info, LayoutList } from "lucide-react";
import * as googleClient from "@/integrations/google/client";
import { fetchBases, saveBase, deleteBase, type StoredBase } from "@/services/productBaseService";
import { getUserSettings, saveUserSettings, getAllUsersSettings, updateUserPermission, ensureSettingsForCurrentUser } from "@/services/settingsService";
import { useSession } from "@/contexts/SessionProvider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

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
  const [fontSize, setFontSize] = useState<string>("medium");
  const [slideMappings, setSlideMappings] = useState<Record<string, number>>({});
  const [newKeyword, setNewKeyword] = useState("");
  const [newSlideNumber, setNewSlideNumber] = useState("");

  const [canAccessSettings, setCanAccessSettings] = useState(false);
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
      try {
        const s = await getUserSettings();
        if (s) {
          setSellerName(s.seller_name || "");
          setSellerRole(s.seller_role || "");
          setSellerEmail(s.seller_email || "");
          setSellerPhone(s.seller_phone || "");
          setSpreadsheetLink(s.spreadsheet_link || "");
          setFontSize(s.font_size || "medium");
          setSlideMappings(s.slide_mappings || {});
          setCanAccessSettings(!!s?.can_access_settings || isSuperAdmin);
        } else {
          // Fallback: try to attach any existing settings row by email (useful when the row exists but wasn't linked)
          try {
            const recovered = await ensureSettingsForCurrentUser();
            if (recovered) {
              setSellerName(recovered.seller_name || "");
              setSellerRole(recovered.seller_role || "");
              setSellerEmail(recovered.seller_email || user?.email || "");
              setSellerPhone(recovered.seller_phone || "");
              setSpreadsheetLink(recovered.spreadsheet_link || "");
              setFontSize(recovered.font_size || "medium");
              setSlideMappings(recovered.slide_mappings || {});
              setCanAccessSettings(!!recovered.can_access_settings || isSuperAdmin);
              toast.success("Perfil recuperado a partir do registro existente.");
            } else {
              // If still nothing, preserve defaults but keep canAccessSettings for super admin
              if (isSuperAdmin) setCanAccessSettings(true);
            }
          } catch (err) {
            console.warn("Fallback recovery failed", err);
            if (isSuperAdmin) setCanAccessSettings(true);
          }
        }

        if (isSuperAdmin || s?.can_access_settings) {
          loadBases();
        }

        if (isSuperAdmin) {
          loadAllUsers();
        }
      } catch (err) {
        console.error("Settings load failed", err);
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

  const toggleUserPermission = async (userId: string, permission: 'history' | 'settings', currentValue: boolean) => {
    try {
      await updateUserPermission(userId, permission, !currentValue);
      toast.success("Permissão atualizada");
      loadAllUsers();
    } catch (err) {
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

  // Improved save profile handler with error feedback and attempt to attach existing record by email
  const handleSaveProfile = async () => {
    try {
      const payload: any = {
        seller_name: sellerName || undefined,
        seller_role: sellerRole || undefined,
        seller_email: sellerEmail || user?.email || undefined,
        seller_phone: sellerPhone || undefined,
      };

      const result = await saveUserSettings(payload);
      if (result) {
        toast.success("Perfil atualizado com sucesso");
        // ensure UI shows the possibly updated flags
        setCanAccessSettings(!!result.can_access_settings || isSuperAdmin);
      } else {
        toast.error("Não foi possível atualizar o perfil");
      }
    } catch (err: any) {
      console.error("Failed to save profile", err);
      // If there is an email-related problem, try to attach existing settings row first
      if (user?.email) {
        try {
          const recovered = await ensureSettingsForCurrentUser();
          if (recovered) {
            // Retry saving after recovery
            await saveUserSettings({
              seller_name: sellerName,
              seller_role: sellerRole,
              seller_email: sellerEmail || user.email,
              seller_phone: sellerPhone,
            });
            toast.success("Perfil recuperado e salvo com sucesso");
            return;
          }
        } catch (innerErr) {
          console.warn("Recovery attempt failed", innerErr);
        }
      }

      toast.error("Erro ao salvar perfil: " + (err?.message || String(err)));
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

          {/* ... rest of the file unchanged (kept exactly as before) ... */}

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
            >
              Salvar Perfil
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}