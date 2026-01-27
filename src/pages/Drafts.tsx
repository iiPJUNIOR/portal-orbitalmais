"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDrafts, deleteDraft, syncSingleDraft, DraftRecord } from "@/services/draftService";
import { saveDraft } from "@/services/draftService";
import { useNavigate } from "react-router-dom";
import { Trash2, ArrowRight, Download, RefreshCw, FileText } from "lucide-react";
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

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="container mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Rascunhos</h1>
          <div className="flex gap-2">
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
              <Card key={d.id}>
                <CardHeader className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{d.data.companyName || "Rascunho sem título"}</CardTitle>
                    <div className="text-sm text-muted-foreground">{new Date(d.created_at).toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => handleContinue(d)}><ArrowRight className="mr-2 h-4 w-4" />Continuar</Button>
                    <Button size="sm" variant="outline" onClick={() => handleExport(d)}><FileText className="mr-2 h-4 w-4" />Export</Button>
                    <Button size="sm" variant="ghost" onClick={() => handleSync(d)}><RefreshCw className="mr-2 h-4 w-4" />Sincronizar</Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(d)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground break-words">
                    {d.data.contactName ? <div><strong>Contato:</strong> {d.data.contactName}</div> : null}
                    {d.data.cnpj ? <div><strong>CNPJ:</strong> {d.data.cnpj}</div> : null}
                    <div className="mt-2">
                      <strong>Passo salvo:</strong> {d.step ?? 1}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}