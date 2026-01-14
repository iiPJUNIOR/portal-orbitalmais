"use client";

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import * as googleClient from "@/integrations/google/client";

export default function Settings() {
  const navigate = useNavigate();
  const [connected, setConnected] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedFileId, setSelectedFileId] = useState<string>("");
  const [range, setRange] = useState<string>("Sheet1!A1:Z1000");

  useEffect(() => {
    // nothing to init on mount beyond client script lazy load
  }, []);

  const handleConnect = async () => {
    setLoading(true);
    try {
      await googleClient.init();
      const tokenResp = await googleClient.requestAccessToken();
      if (tokenResp && tokenResp.access_token) {
        setAccessToken(tokenResp.access_token);
        setConnected(true);
        toast.success("Conectado ao Google com sucesso");
        const driveFiles = await googleClient.listDriveSpreadsheets(tokenResp.access_token);
        setFiles(driveFiles.map((f: any) => ({ id: f.id, name: f.name })));
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
    toast.success("Desconectado do Google");
  };

  const handleRefreshFiles = async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const driveFiles = await googleClient.listDriveSpreadsheets(accessToken);
      setFiles(driveFiles.map((f: any) => ({ id: f.id, name: f.name })));
      toast.success("Arquivos atualizados");
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao listar arquivos: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!accessToken) {
      toast.error("Conecte sua conta Google primeiro");
      return;
    }
    if (!selectedFileId) {
      toast.error("Selecione um arquivo para importar");
      return;
    }
    setLoading(true);
    try {
      const sheet = await googleClient.getSpreadsheetValues(accessToken, selectedFileId, range);
      const values: string[][] = sheet.values || [];
      if (values.length === 0) {
        toast.error("Planilha vazia");
        setLoading(false);
        return;
      }
      const headers = values[0].map((h: string) => String(h).trim());
      const rows = values.slice(1).map((row: any[]) => {
        const obj: any = {};
        headers.forEach((header, idx) => {
          obj[header || `col_${idx}`] = row[idx] ?? "";
        });
        return obj;
      });

      // Save to localStorage as imported products (temporary)
      localStorage.setItem("importedProducts", JSON.stringify(rows));
      toast.success(`Importado ${rows.length} linhas e salvo em localStorage (importedProducts)`);
      console.log("Imported rows preview:", rows.slice(0, 20));
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao importar planilha: " + (err?.message || err));
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
            <p className="text-gray-600">Conecte sua conta Google para importar uma tabela de produtos (Drive / Sheets)</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/")}>
              Voltar ao Orçamento
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    <Button onClick={handleConnect} disabled={loading}>
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
                  <Label>Arquivos (Planilhas) no Drive</Label>
                  {connected ? (
                    files.length > 0 ? (
                      <div className="space-y-2 mt-2">
                        <select
                          className="w-full border rounded px-3 py-2"
                          value={selectedFileId}
                          onChange={(e) => setSelectedFileId(e.target.value)}
                        >
                          <option value="">-- selecione uma planilha --</option>
                          {files.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-2">Nenhuma planilha encontrada.</p>
                    )
                  ) : (
                    <p className="text-sm text-muted-foreground mt-2">Você não está conectado.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Range (Sheets API)</Label>
                  <Input value={range} onChange={(e) => setRange(e.target.value)} />
                  <p className="text-sm text-muted-foreground">Exemplo: Sheet1!A1:Z1000</p>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleImport} disabled={!connected || !selectedFileId || loading}>
                    {loading ? "Importando..." : "Importar Planilha para Produtos"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Import Preview / Ações</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Após a importação, os dados são salvos temporariamente no localStorage sob a chave <code>importedProducts</code>.
                  Você pode usar essa lista para popular o catálogo local ou sincronizar com o banco.
                </p>

                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      const raw = localStorage.getItem("importedProducts");
                      if (!raw) {
                        toast.error("Nenhum arquivo importado encontrado em localStorage");
                        return;
                      }
                      const rows = JSON.parse(raw);
                      toast.success(`Preview: ${rows.length} linhas (veja console)`);
                      console.log("Imported products (full):", rows);
                    }}
                  >
                    Ver preview (console)
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => {
                      localStorage.removeItem("importedProducts");
                      toast.success("Import removido do localStorage");
                    }}
                  >
                    Remover importações locais
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}