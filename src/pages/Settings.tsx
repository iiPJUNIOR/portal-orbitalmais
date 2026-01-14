"use client";

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import * as googleClient from "@/integrations/google/client";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export default function Settings() {
  const navigate = useNavigate();
  const [connected, setConnected] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<Array<{ id: string; name: string }>>([]);
  const [spreadsheetLink, setSpreadsheetLink] = useState<string>("");
  const [range, setRange] = useState<string>("Sheet1!A1:Z1000");

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
    }
  }, []);

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

  const handleImport = async () => {
    if (!spreadsheetLink) {
      toast.error("Cole o link da planilha ou insira o ID da planilha.");
      return;
    }
    if (!accessToken) {
      toast.error("Você precisa conectar ao Google primeiro.");
      return;
    }
    setLoading(true);
    try {
      const spreadsheetId = extractSpreadsheetId(spreadsheetLink);
      if (!spreadsheetId) {
        toast.error("Não foi possível extrair o ID da planilha. Verifique o link/ID.");
        setLoading(false);
        return;
      }
      const sheet = await googleClient.getSpreadsheetValues(accessToken as string, spreadsheetId, range);
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
                  <p className="text-sm text-muted-foreground mt-2">
                    Exemplo: https://docs.google.com/spreadsheets/d/1aBcD_EfGhIjKlMnOpQrStUvWxYz/edit
                  </p>

                  {files.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm text-muted-foreground">Ou escolha uma planilha encontrada no seu Drive:</p>
                      <div className="space-y-2 mt-2 max-h-40 overflow-auto">
                        {files.map((f) => (
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
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2 mt-4">
                  <Label>Range (Sheets API)</Label>
                  <Input value={range} onChange={(e) => setRange(e.target.value)} />
                  <p className="text-sm text-muted-foreground">Exemplo: Sheet1!A1:Z1000</p>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleImport} disabled={!connected || loading}>
                    {loading ? "Importando..." : "Importar Planilha para Produtos"}
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