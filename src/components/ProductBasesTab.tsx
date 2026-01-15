"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

type StoredBase = {
  id: string;
  name: string;
  type: "catalog" | "product";
  headers: string[];
  rows: any[][];
  createdAt: string;
  // optional metadata
  keyColumn?: string | null;
  comIdsColumn?: string | null;
  semIdsColumn?: string | null;
};

type ProductBasesTabProps = {
  onBack?: () => void;
};

export default function ProductBasesTab({ onBack }: ProductBasesTabProps) {
  const [bases, setBases] = useState<StoredBase[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    loadBases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadBases() {
    try {
      const raw = localStorage.getItem("product_bases");
      if (!raw) {
        setBases([]);
        return;
      }
      const parsed = JSON.parse(raw) as StoredBase[];
      setBases(Array.isArray(parsed) ? parsed : []);
    } catch (err) {
      console.warn("Failed to load product_bases", err);
      setBases([]);
    }
  }

  function handleExport(b: StoredBase) {
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

  function handleDelete(id: string) {
    const next = bases.filter((b) => b.id !== id);
    setBases(next);
    try {
      localStorage.setItem("product_bases", JSON.stringify(next));
      // Notify other parts of the app that bases changed so they can reload
      try {
        window.dispatchEvent(new Event("product_bases_changed"));
      } catch {}
      toast.success("Base removida");
    } catch (err) {
      console.warn("failed to persist bases after delete", err);
      toast.error("Falha ao remover base");
    }
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
                    {b.rows.length} linhas · {b.headers.length} colunas · criado em {new Date(b.createdAt).toLocaleDateString()}
                  </div>
                  {b.keyColumn && <div className="text-sm text-muted-foreground mt-1">Coluna chave: <strong>{b.keyColumn}</strong></div>}
                  {b.comIdsColumn && <div className="text-sm text-muted-foreground mt-1">Coluna 'Com iDSecure': <strong>{b.comIdsColumn}</strong></div>}
                  {b.semIdsColumn && <div className="text-sm text-muted-foreground mt-1">Coluna 'Sem iDSecure': <strong>{b.semIdsColumn}</strong></div>}
                </div>

                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleExport(b)}>Exportar</Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(b.id)}>Remover</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}