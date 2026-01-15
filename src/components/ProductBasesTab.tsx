"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { fetchBases, deleteBase, type StoredBase } from "@/services/productBaseService";

type ProductBasesTabProps = {
  onBack?: () => void;
};

export default function ProductBasesTab({ onBack }: ProductBasesTabProps) {
  const [bases, setBases] = useState<StoredBase[]>([]);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadBases();
    // listen for external updates (e.g., saved/deleted from Settings)
    const handler = () => {
      loadBases();
    };
    window.addEventListener("product_bases_changed", handler);
    return () => window.removeEventListener("product_bases_changed", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadBases() {
    setLoading(true);
    try {
      const data = await fetchBases();
      setBases(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load product bases", err);
      toast.error("Falha ao carregar bases do servidor");
      setBases([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleExport(b: StoredBase) {
    try {
      const blob = new Blob([JSON.stringify(b, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(b.name || b.id).replace(/\s+/g, "-") || b.id}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Base exportada");
    } catch (err) {
      console.error("export failed", err);
      toast.error("Falha ao exportar base");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover esta base permanentemente?")) return;
    try {
      await deleteBase(id);
      toast.success("Base removida");
      // reload
      await loadBases();
    } catch (err) {
      console.error("delete failed", err);
      toast.error("Falha ao remover base");
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Base de Produtos</CardTitle>
        </CardHeader>
        <CardContent>
          <div>Carregando...</div>
        </CardContent>
      </Card>
    );
  }

  if (bases.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Base de Produtos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Nenhuma base de produtos salva ainda. Você pode salvar uma base a partir das Configurações (conecte uma planilha e salve a aba como base).
            </div>

            <div className="flex gap-2">
              <Button onClick={() => navigate("/settings")}>Ir para Configurações</Button>
              <Button variant="outline" onClick={() => { if (onBack) onBack(); else navigate("/"); }}>Voltar</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Base de Produtos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="font-medium">Bases salvas</div>
              <div className="text-sm text-muted-foreground">Gerencie suas bases de produtos (exportar / remover)</div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate("/settings")}>Abrir Configurações</Button>
              <Button onClick={() => { if (onBack) onBack(); else navigate("/"); }}>Voltar</Button>
            </div>
          </div>

          <div className="space-y-2">
            {bases.map((b) => (
              <div key={b.id} className="flex items-center justify-between border rounded px-3 py-3">
                <div>
                  <div className="font-medium">{b.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {Array.isArray(b.rows) ? b.rows.length : 0} linhas · {Array.isArray(b.headers) ? b.headers.length : 0} colunas · criado em {b.created_at ? new Date(b.created_at).toLocaleDateString() : ""}
                  </div>
                  {b.key_column && <div className="text-sm text-muted-foreground mt-1">Coluna chave: <strong>{b.key_column}</strong></div>}
                  {b.com_ids_column && <div className="text-sm text-muted-foreground mt-1">Coluna 'Com iDSecure': <strong>{b.com_ids_column}</strong></div>}
                  {b.sem_ids_column && <div className="text-sm text-muted-foreground mt-1">Coluna 'Sem iDSecure': <strong>{b.sem_ids_column}</strong></div>}
                </div>

                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleExport(b)}>Exportar</Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(String(b.id))}>Remover</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}