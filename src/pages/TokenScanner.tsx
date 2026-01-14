"use client";

import React, { useEffect, useState } from "react";
import { scanTemplateTexts } from "@/utils/pptxScanner";
import { generateProposalPPTX } from "@/services/proposalService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

/**
 * Replacement keys we expect to populate in the template.
 * The UI will allow mapping a source text from the PPTX to each of these keys.
 *
 * Added Portuguese keys per request:
 *  - descrição, descrição1, descrição2
 *  - qtd, qtd1, qtd2
 *  - users, devices
 *  - CNPJ, endereço
 *
 * Keeping original English keys as well for backward compatibility.
 */
const KEYS = [
  // existing keys
  "companyName",
  "contactName",
  "date",
  "proposalNumber",
  "items_list",
  "sellerName",
  "sellerRole",
  "sellerEmail",
  "sellerPhone",
  "totalPrice",
  // requested Portuguese keys (may contain accented chars)
  "descrição",
  "descrição1",
  "descrição2",
  "qtd",
  "qtd1",
  "qtd2",
  "users",
  "devices",
  "CNPJ",
  "endereço",
];

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