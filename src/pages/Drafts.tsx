"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDrafts, deleteDraft, syncSingleDraft, syncLocalDrafts, DraftRecord } from "@/services/draftService";
import { useNavigate } from "react-router-dom";
import { Trash2, ArrowRight, RefreshCw, FileText, Download } from "lucide-react";
import { toast } from "sonner";
import { saveAs } from "file-saver";
import { getProposalKind, getProposalKindBadgeInfo, ProposalKind } from "@/utils/proposalType";

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [typeFilter, setTypeFilter] = useState<"all" | ProposalKind>("all");
  const navigate = useNavigate();

  async function load() {
    const data = await getDrafts();
    setDrafts(data);
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
      saveAs(blob, `draft-${d.id}.json`);
      toast.success("Rascunho exportado");
    } catch (err) {
      toast.error("Falha ao exportar rascunho");
    }
  };

  const handleDelete = async (d: DraftRecord) => {
    if (!confirm("Remover este rascunho permanentemente?")) return;
    try {
      await deleteDraft(d.id);
      await load();
      toast.success("Rascunho removido");
    } catch (err) {
      toast.error("Falha ao remover rascunho");
    }
  };

  const handleDeleteAll = async () => {
    if (drafts.length === 0) return;
    if (!confirm(`Tem certeza que deseja remover todos os ${drafts.length} rascunhos permanentemente?`)) return;
    const tId = toast.loading("Removendo todos os rascunhos...");
    try {
      for (const d of drafts) {
        await deleteDraft(d.id);
      }
      await load();
      toast.success("Todos os rascunhos foram removidos com sucesso.", { id: tId });
    } catch (err) {
      console.error(err);
      toast.error("Falha ao remover rascunhos.", { id: tId });
    }
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

  const filteredDrafts = drafts.filter((d) => {
    if (typeFilter === "all") return true;
    return getProposalKind(d.data) === typeFilter;
  });

  return (
    <div className="min-h-full p-6">
      <div className="container mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Rascunhos</h1>
            <p className="text-sm text-muted-foreground mt-1">Gerencie propostas em andamento de Qualificação e Serviço.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border mr-2">
              <Button
                size="sm"
                variant={typeFilter === "all" ? "default" : "ghost"}
                className="rounded-lg text-xs font-semibold h-8"
                onClick={() => setTypeFilter("all")}
              >
                Todos ({drafts.length})
              </Button>
              <Button
                size="sm"
                variant={typeFilter === "qualification" ? "default" : "ghost"}
                className="rounded-lg text-xs font-semibold h-8"
                onClick={() => setTypeFilter("qualification")}
              >
                Qualificação ({drafts.filter((d) => getProposalKind(d.data) === "qualification").length})
              </Button>
              <Button
                size="sm"
                variant={typeFilter === "service" ? "default" : "ghost"}
                className="rounded-lg text-xs font-semibold h-8"
                onClick={() => setTypeFilter("service")}
              >
                Serviço ({drafts.filter((d) => getProposalKind(d.data) === "service").length})
              </Button>
            </div>

            <Button onClick={handleSyncAll} disabled={isSyncingAll} className="bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl">
              <RefreshCw className={`mr-2 h-4 w-4 ${isSyncingAll ? "animate-spin" : ""}`} /> Sincronizar Todos
            </Button>
            {drafts.length > 0 && (
              <Button onClick={handleDeleteAll} variant="outline" className="rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 font-semibold">
                <Trash2 className="mr-2 h-4 w-4" /> Excluir Todos
              </Button>
            )}
            <Button onClick={load} variant="outline" className="rounded-xl"><RefreshCw className="mr-2 h-4 w-4" /> Recarregar</Button>
            <Button onClick={() => navigate("/")} className="rounded-xl font-bold">Ir para o Gerador</Button>
          </div>
        </div>

        {filteredDrafts.length === 0 ? (
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Nenhum rascunho encontrado</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                {drafts.length === 0
                  ? "Salve um rascunho a partir do assistente e ele aparecerá aqui."
                  : "Nenhum rascunho salvo nesta categoria selecionada."}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredDrafts.map((d) => {
              const kindInfo = getProposalKindBadgeInfo(d.data);
              return (
                <Card key={d.id} className="overflow-hidden rounded-2xl hover:shadow-md transition-shadow">
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-center p-5">
                    <div className="md:col-span-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold">{d.data.companyName || "Rascunho sem título"}</h3>
                            <Badge variant="outline" className={`${kindInfo.badgeClass} font-bold rounded-lg text-xs`}>
                              {kindInfo.label}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">{d.data.contactName ? `${d.data.contactName} • ${d.data.cnpj || ""}` : (d.data.cnpj || "")}</div>
                        </div>
                        <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
                          <span>Criado em</span>
                          <span className="font-medium">{new Date(d.created_at).toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="mt-3 text-sm text-muted-foreground space-y-1">
                        <div><strong>Tipo de Proposta:</strong> {kindInfo.fullLabel}</div>
                        <div><strong>Itens:</strong> {(d.data.selectedProducts || d.data.items || []).length}</div>
                        {d.data.totalPrice ? <div><strong>Valor total:</strong> R$ {Number(d.data.totalPrice).toFixed(2)}</div> : null}
                        <div className="text-xs text-muted-foreground">Passo salvo: <span className="font-medium">{d.step ?? 1}</span></div>
                      </div>
                    </div>

                    <div className="md:col-span-2 flex flex-col items-stretch gap-2">
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1 rounded-xl font-bold" onClick={() => handleContinue(d)}>
                          <ArrowRight className="mr-2 h-4 w-4" /> Continuar
                        </Button>
                        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => handleExport(d)}>
                          <FileText className="mr-2 h-4 w-4" /> Export
                        </Button>
                      </div>

                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" className="flex-1 rounded-xl" onClick={() => handleSync(d)}><RefreshCw className="mr-2 h-4 w-4" /> Sincronizar</Button>
                        <Button size="sm" variant="destructive" className="rounded-xl" onClick={() => handleDelete(d)}><Trash2 className="h-4 w-4" /></Button>
                      </div>

                      <div className="md:hidden mt-2 text-xs text-muted-foreground">
                        Criado: {new Date(d.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}