"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDrafts, deleteDraft, syncSingleDraft, syncLocalDrafts, DraftRecord } from "@/services/draftService";
import { useNavigate } from "react-router-dom";
import { Trash2, ArrowRight, RefreshCw, FileText, Download } from "lucide-react";
import { toast } from "sonner";

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const navigate = useNavigate();

  function load() {
    setDrafts(getDrafts());
  }

  useEffect(() => {
    load();
  }, []);

  const handleContinue = (d: DraftRecord) => {
    navigate("/wizard", { state: { draft: d } });
  };

  const handleExport = (d: DraftRecord) => {
    try {
      const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `draft-${d.id}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Rascunho exportado");
    } catch (err) {
      toast.error("Falha ao exportar rascunho");
    }
  };

  const handleDelete = (d: DraftRecord) => {
    if (!confirm("Remover rascunho permanentemente?")) return;
    deleteDraft(d.id);
    load();
    toast.success("Rascunho removido");
  };

  const handleSync = async (d: DraftRecord) => {
    const tId = toast.loading("Sincronizando rascunho...");
    try {
      const res = await syncSingleDraft(d.id);
      if (res.success) {
        toast.success("Rascunho sincronizado com sucesso", { id: tId });
        load();
      } else {
        toast.error("Falha ao sincronizar rascunho: " + String(res.error), { id: tId });
      }
    } catch (err) {
      toast.error("Erro ao sincronizar rascunho", { id: tId });
    }
  };

  const [isSyncingAll, setIsSyncingAll] = useState(false);

  const handleSyncAll = async () => {
    const pending = drafts.filter((d) => !d.synced);
    if (pending.length === 0) {
      toast.info("Todos os rascunhos já estão sincronizados com o servidor.");
      return;
    }

    setIsSyncingAll(true);
    const tId = toast.loading("Sincronizando todos os rascunhos...");
    try {
      const res = await syncLocalDrafts();
      const syncedLen = res.synced.length;
      const failedLen = res.failed.length;

      if (syncedLen > 0 && failedLen === 0) {
        toast.success(`Sucesso: ${syncedLen} rascunho(s) sincronizado(s).`, { id: tId });
      } else if (syncedLen > 0 && failedLen > 0) {
        toast.warning(`Sincronizados: ${syncedLen}. Falhas: ${failedLen}.`, { id: tId });
      } else if (failedLen > 0) {
        toast.error(`Falha ao sincronizar ${failedLen} rascunho(s).`, { id: tId });
      } else {
        toast.info("Nenhum rascunho pendente para sincronização.", { id: tId });
      }
      load();
    } catch (err) {
      toast.error("Erro ao sincronizar rascunhos", { id: tId });
    } finally {
      setIsSyncingAll(false);
    }
  };

  return (
    <div className="min-h-full p-6">
      <div className="container mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Rascunhos</h1>
          <div className="flex gap-2">
            <Button onClick={handleSyncAll} disabled={isSyncingAll} className="bg-amber-500 hover:bg-amber-600 text-white font-bold">
              <RefreshCw className={`mr-2 h-4 w-4 ${isSyncingAll ? "animate-spin" : ""}`} /> Sincronizar Todos
            </Button>
            <Button onClick={load} variant="outline"><RefreshCw className="mr-2 h-4 w-4" /> Recarregar</Button>
            <Button onClick={() => navigate("/")}>Ir para o Gerador</Button>
          </div>
        </div>

        {drafts.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Nenhum rascunho salvo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                Salve um rascunho a partir do assistente (após o passo 4) e ele aparecerá aqui.
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {drafts.map((d) => (
              <Card key={d.id} className="overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-center p-4">
                  <div className="md:col-span-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold">{d.data.companyName || "Rascunho sem título"}</h3>
                        <div className="text-sm text-muted-foreground">{d.data.contactName ? `${d.data.contactName} • ${d.data.cnpj || ""}` : (d.data.cnpj || "")}</div>
                      </div>
                      <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Criado em</span>
                        <span className="font-medium">{new Date(d.created_at).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="mt-3 text-sm text-muted-foreground">
                      <div><strong>Itens:</strong> {(d.data.selectedProducts || []).length}</div>
                      {d.data.totalPrice ? <div><strong>Valor total:</strong> R$ {Number(d.data.totalPrice).toFixed(2)}</div> : null}
                      <div className="mt-2 text-xs text-muted-foreground">Passo salvo: <span className="font-medium">{d.step ?? 1}</span></div>
                    </div>
                  </div>

                  <div className="md:col-span-2 flex flex-col items-stretch gap-2">
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" onClick={() => handleContinue(d)}>
                        <ArrowRight className="mr-2 h-4 w-4" /> Continuar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleExport(d)}>
                        <FileText className="mr-2 h-4 w-4" /> Export
                      </Button>
                    </div>

                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" className="flex-1" onClick={() => handleSync(d)}><RefreshCw className="mr-2 h-4 w-4" /> Sincronizar</Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(d)}><Trash2 className="h-4 w-4" /></Button>
                    </div>

                    <div className="md:hidden mt-2 text-xs text-muted-foreground">
                      Criado: {new Date(d.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}