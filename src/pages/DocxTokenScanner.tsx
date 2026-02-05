"use client";

import React, { useEffect, useState, useRef } from "react";
import { scanDocxTemplate } from "@/utils/docxScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

/**
 * Replacement keys we expect to populate in DOCX templates (use same keys as PPTX scanner to keep format).
 */
const KEYS = [
  "companyName",
  "contactName",
  "date",
  "proposalNumber",
  "items_list",
  "items_list1",
  "items_list2",
  "sellerName",
  "sellerRole",
  "sellerEmail",
  "sellerPhone",
  "totalPrice",
  "qtd",
  "qtd1",
  "qtd2",
  "users",
  "devices",
  "CNPJ",
  "endereço",
];

function normalizeForMatch(s?: string) {
  if (!s) return "";
  // remove braces, punctuation we don't care about, lower case, remove accents
  const noBraces = s.replace(/[{}]/g, "");
  const lower = noBraces.toLowerCase();
  const noAccents = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // keep only letters and numbers for robust substring checks
  return noAccents.replace(/[^a-z0-9]/g, "");
}

export default function DocxTokenScannerPage() {
  const [found, setFound] = useState<Array<{ text: string; count: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [mapping, setMapping] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem("docx_token_map");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const autoMappedRef = useRef(false);

  const runScan = async () => {
    setLoading(true);
    try {
      const tokens = await scanDocxTemplate();
      // convert to same shape as PPTX scanner: distinct tokens with count 1
      const arr = Array.from(new Set(tokens || [])).map((t) => ({ text: t, count: 1 }));
      setFound(arr);
    } catch (err: any) {
      console.error("docx scan failed", err);
      toast.error("Falha ao escanear DOCX: " + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      await runScan();
    })();
  }, []);

  // Automatic mapping (runs once) -- same heuristics as PPTX scanner
  useEffect(() => {
    if (found.length === 0) return;
    if (autoMappedRef.current) return;

    const existing = { ...mapping };
    const foundByNormalized: Array<{ raw: string; normalized: string; count: number }> = found.map((f) => ({
      raw: f.text,
      normalized: normalizeForMatch(f.text),
      count: f.count,
    }));

    // helper to find best match for a key
    function findMatchForKey(key: string): string | undefined {
      const keyNorm = normalizeForMatch(key);

      // direct exact match (normalized)
      let match = foundByNormalized.find((f) => f.normalized === keyNorm);
      if (match) return match.raw;

      // substring match where found contains key
      match = foundByNormalized.find((f) => f.normalized.includes(keyNorm));
      if (match) return match.raw;

      // special heuristics for common synonyms / Portuguese words
      if (keyNorm.startsWith("items") || keyNorm.includes("descri") || keyNorm.includes("item")) {
        match = foundByNormalized.find((f) => f.normalized.includes("item") || f.normalized.includes("descri") || f.normalized.includes("descr"));
        if (match) return match.raw;
      }

      if (keyNorm.startsWith("qtd")) {
        match = foundByNormalized.find((f) => f.normalized.includes("qtd") || f.normalized.includes("quant"));
        if (match) return match.raw;
      }

      if (keyNorm.includes("user") || keyNorm.includes("usuarios") || keyNorm.includes("usuario")) {
        match = foundByNormalized.find((f) => f.normalized.includes("user") || f.normalized.includes("usuario") || f.normalized.includes("usuarios"));
        if (match) return match.raw;
      }

      if (keyNorm.includes("device") || keyNorm.includes("disposit")) {
        match = foundByNormalized.find((f) => f.normalized.includes("device") || f.normalized.includes("disposit"));
        if (match) return match.raw;
      }

      if (keyNorm === "cnpj") {
        match = foundByNormalized.find((f) => f.normalized.includes("cnpj"));
        if (match) return match.raw;
      }

      if (keyNorm.includes("endereco") || keyNorm.includes("endereco")) {
        match = foundByNormalized.find((f) => f.normalized.includes("endereco") || f.normalized.includes("address"));
        if (match) return match.raw;
      }

      // fallback: pick the most frequent short text (likely a label)
      const shortCandidates = foundByNormalized.filter((f) => f.raw.length < 40).sort((a, b) => b.count - a.count);
      if (shortCandidates.length > 0) return shortCandidates[0].raw;

      return undefined;
    }

    let anyMapped = false;
    const newMapping = { ...existing };

    for (const key of KEYS) {
      if (newMapping[key]) continue; // don't overwrite manual mapping
      const matched = findMatchForKey(key);
      if (matched) {
        newMapping[key] = matched;
        anyMapped = true;
      }
    }

    if (anyMapped) {
      setMapping(newMapping);
      try {
        localStorage.setItem("docx_token_map", JSON.stringify(newMapping));
        toast.success("Mapeamento automático aplicado (você pode ajustar manualmente)");
      } catch (err) {
        console.warn("failed to save automatic mapping", err);
      }
    } else {
      console.debug("DocxTokenScanner: no automatic mapping candidates found");
    }

    autoMappedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found]);

  const saveMapping = () => {
    try {
      localStorage.setItem("docx_token_map", JSON.stringify(mapping));
      toast.success("Mapeamento salvo em localStorage (docx_token_map)");
    } catch (err) {
      console.error("save mapping failed", err);
      toast.error("Falha ao salvar mapeamento");
    }
  };

  const handleClearScannerCache = async () => {
    try {
      localStorage.removeItem("docx_token_map");
      setMapping({});
      autoMappedRef.current = false;
      setFound([]);
      toast.success("Cache do scanner DOCX limpo (docx_token_map removido). Reescaneando...");
      await runScan();
    } catch (err) {
      console.error("failed to clear scanner cache", err);
      toast.error("Falha ao limpar cache do scanner");
    }
  };

  // Derived counts
  const distinctCount = found.length;
  const totalOccurrences = found.reduce((s, f) => s + (f.count || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Scanner de Tokens (DOCX)</h1>
            <p className="text-sm text-muted-foreground">Mapeie textos do template DOCX para os campos que o gerador usa e ajuste manualmente.</p>
          </div>

          <div className="flex gap-2">
            <Button onClick={async () => { setFound([]); autoMappedRef.current = false; await runScan(); }}>
              Reescanear template DOCX
            </Button>

            <Button variant="outline" onClick={handleClearScannerCache}>
              Limpar cache do scanner
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            <div className="bg-white p-4 rounded border">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="font-semibold">Tokens encontrados (DOCX)</h3>
                  <div className="text-sm text-muted-foreground">
                    Tokens distintos: {distinctCount} — Ocorrências totais: {totalOccurrences}
                  </div>
                </div>
              </div>

              {loading ? (
                <div>Escaneando documento DOCX...</div>
              ) : (
                <div className="max-h-96 overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="py-1">Token</th>
                        <th className="py-1">Ocorrências</th>
                      </tr>
                    </thead>
                    <tbody>
                      {found.map((f, idx) => (
                        <tr key={idx}>
                          <td className="py-1 break-words">{f.text}</td>
                          <td className="py-1">{f.count}</td>
                        </tr>
                      ))}

                      {found.length === 0 && (
                        <tr>
                          <td colSpan={2} className="py-4 text-sm text-muted-foreground text-center">
                            Nenhum token encontrado no DOCX.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white p-4 rounded border">
              <h3 className="font-semibold mb-2">Observação</h3>
              <p className="text-sm text-muted-foreground mb-2">Este scanner detecta tokens no formato {{token}} dentro do documento DOCX e tenta mapear automaticamente para os campos do sistema; ajuste manualmente quando necessário.</p>
              <div className="flex gap-2">
                <Button onClick={runScan}>Reescanear DOCX</Button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white p-4 rounded border">
              <h3 className="font-semibold mb-2">Mapeamento (salvo em localStorage)</h3>
              <p className="text-sm text-muted-foreground mb-2">Escolha o texto exato do template que representa cada campo ou cole um texto personalizado.</p>

              <div className="space-y-2">
                {KEYS.map((k) => (
                  <div key={k} className="space-y-1">
                    <Label className="font-medium">{k}</Label>
                    <select
                      className="w-full border rounded px-2 py-1"
                      value={mapping[k] ?? ""}
                      onChange={(e) => setMapping((prev) => ({ ...prev, [k]: e.target.value }))}
                    >
                      <option value="">-- não mapear --</option>
                      {found.map((f) => <option key={f.text} value={f.text}>{f.text} ({f.count})</option>)}
                    </select>
                    <div className="mt-1">
                      <Input
                        placeholder="Ou cole um texto customizado para substituir"
                        value={mapping[k] ?? ""}
                        onChange={(e) => setMapping((prev) => ({ ...prev, [k]: e.target.value }))}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <Button onClick={saveMapping}>Salvar mapeamento</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}