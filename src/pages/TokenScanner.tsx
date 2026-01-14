"use client";

import React, { useEffect, useState, useRef } from "react";
import { scanTemplateTexts } from "@/utils/pptxScanner";
import { generateProposalPPTX } from "@/services/proposalService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

/**
 * Replacement keys we expect to populate in the template.
 * Using the exact keys you provided so the automatic mapping targets them.
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

export default function TokenScannerPage() {
  const [found, setFound] = useState<Array<{ text: string; count: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [mapping, setMapping] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem("pptx_token_map");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const autoMappedRef = useRef(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const texts = await scanTemplateTexts();
        setFound(texts);
      } catch (err: any) {
        console.error("scan failed", err);
        toast.error("Falha ao escanear template: " + (err?.message || err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Attempt automatic mapping once after we have the 'found' texts and if not already auto-mapped
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
        match = foundByNormalized.find((f) => f.normalized.includes("item") || f.normalized.includes("descri") || f.normalized.includes("descrição") || f.normalized.includes("descr"));
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
        localStorage.setItem("pptx_token_map", JSON.stringify(newMapping));
        toast.success("Mapeamento automático aplicado (você pode ajustar manualmente)");
      } catch (err) {
        console.warn("failed to save automatic mapping", err);
      }
    } else {
      // no automatic matches found (not an error)
      console.debug("TokenScanner: no automatic mapping candidates found");
    }

    autoMappedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found]);

  const saveMapping = () => {
    try {
      localStorage.setItem("pptx_token_map", JSON.stringify(mapping));
      toast.success("Mapeamento salvo em localStorage (pptx_token_map)");
    } catch (err) {
      console.error("save mapping failed", err);
      toast.error("Falha ao salvar mapeamento");
    }
  };

  const runTestGeneration = async () => {
    // Build mock proposal data with minimal required fields
    const mock = {
      cnpj: "00.000.000/0000-00",
      companyName: "ACME LTDA",
      contactName: "Fulano de Tal",
      email: "venda@acme.com",
      phone: "(11) 99999-9999",
      address: "Rua Exemplo, 123",
      proposalDate: new Date().toISOString(),
      observations: "Proposta de teste",
      priceModel: "12m" as const,
      items: [
        {
          id: "p1",
          product: {
            id: "p1",
            sku: "IDB-NEXT-001",
            category: "Catraca Pedestal",
            model: "iDBlock Next",
            colors: ["Inox"],
            biometrics: true,
            facial: "Max" as any,
            proximity: "Mifare" as any,
            urn: true,
            qr: true,
            description: "Catraca pedestral biométrica com facial Max",
            value_12m: 1200,
            value_24m: 1000,
            part_number: "IDB-NEXT-001",
            status: "Ativo",
          },
          quantity: 2,
          priceModel: "12m" as const,
        },
        {
          id: "p2",
          product: {
            id: "p2",
            sku: "IDB-BAL-001",
            category: "Catraca Balcão",
            model: "iDBlock Balcão",
            colors: ["Preta"],
            biometrics: true,
            facial: "1" as any,
            proximity: "ASK" as any,
            urn: false,
            qr: true,
            description: "Catraca balcão com facial 1",
            value_12m: 850,
            value_24m: 720,
            part_number: "IDB-BAL-001",
            status: "Ativo",
          },
          quantity: 1,
          priceModel: "12m" as const,
        },
      ],
      proposalNumber: "214049 V.1",
      pipedriveUrl: "https://controlid.pipedrive.com/deal/214049",
      flags: {
        botoeira: true,
        idfaceEntry: true,
        idfaceExit: false,
        idAccessNanoEntry: false,
        idFlexProEntry: false,
        idFlexProGlass: false,
        hasCatraca: true,
        systemIncluded: false,
      },
      overrideTotal: null,
    };

    try {
      const blob = await generateProposalPPTX(mock as any);
      // trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `test-proposal-${Date.now()}.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Arquivo gerado e download iniciado (teste).");
    } catch (err: any) {
      console.error("generate failed", err);
      toast.error("Falha ao gerar PPTX de teste: " + (err?.message || err));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Scanner de Tokens do Template</h1>
            <p className="text-sm text-muted-foreground">Mapeie textos do template para os campos que o gerador usa e execute uma geração de teste.</p>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            <div className="bg-white p-4 rounded border">
              <h3 className="font-semibold mb-2">Textos encontrados no template ({found.length})</h3>
              {loading ? (
                <div>Escaneando template...</div>
              ) : (
                <div className="max-h-96 overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="py-1">Texto</th>
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
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white p-4 rounded border">
              <h3 className="font-semibold mb-2">Test generation</h3>
              <p className="text-sm text-muted-foreground mb-2">Ao clicar em "Gerar teste" será criado um PPTX usando os mapeamentos atuais e será iniciado o download.</p>
              <div className="flex gap-2">
                <Button onClick={runTestGeneration}>Gerar teste e baixar</Button>
                <Button variant="outline" onClick={() => {
                  // refresh scan
                  setFound([]);
                  autoMappedRef.current = false;
                  (async () => {
                    try {
                      const texts = await scanTemplateTexts();
                      setFound(texts);
                      toast.success("Reescaneado template");
                    } catch (err: any) {
                      console.error(err);
                      toast.error("Falha ao reescanear: " + (err?.message || err));
                    }
                  })();
                }}>Reescanear template</Button>
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