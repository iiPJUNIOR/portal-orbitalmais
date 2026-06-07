"use client";

import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CheckCircle2, FileText, Loader2, Search } from "lucide-react";
import { getUserSettings } from "@/services/settingsService";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { saveAs } from "file-saver";

interface QualificationWizardProps {
  onCancel: () => void;
}

function healDocxTokens(xml: string): string {
  if (!xml) return xml;
  const paragraphRegex = /<w:p(?: [\s\S]*?)?>([\s\S]*?)<\/w:p>/gi;
  return xml.replace(paragraphRegex, (pFull, pContent) => {
    if (!pContent.includes("{") && !pContent.includes("}")) return pFull;
    const textNodeRegex = /(<w:t[^>]*>)([\s\S]*?)(<\/w:t>)/gi;
    const runs: { open: string; text: string; close: string }[] = [];
    let m;
    while ((m = textNodeRegex.exec(pContent)) !== null) {
      runs.push({ open: m[1], text: m[2], close: m[3] });
    }
    if (runs.length <= 1) return pFull;
    let runIndex = 0;
    const healedContent = pContent.replace(textNodeRegex, () => {
      const r = runs[runIndex++];
      if (runIndex === 1) {
        const fullText = runs.map((run) => run.text).join("");
        return r.open + fullText + r.close;
      }
      return r.open + r.close;
    });
    const pOpen = pFull.match(/^<w:p(?: [\s\S]*?)?>/i)?.[0] || "<w:p>";
    return pOpen + healedContent + "</w:p>";
  });
}

export function QualificationWizard({ onCancel }: QualificationWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const lastFetchedCnpj = useRef<string>("");
  const cnpjDebounce = useRef<NodeJS.Timeout | null>(null);

  const [formData, setFormData] = useState({
    // Seller
    vendedor: "",
    // Client
    empresa: "",
    cnpj: "",
    contatoNome: "",
    contatoTelefone: "",
    empresaEmail: "",
    // Address
    cep: "",
    rua: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
    // Product/scope
    produto: "",
    quantidade: "",
    observacoes: "",
    // Sequence & version
    sequencia: "001",
    versao: "0",
  });

  const set = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  // Load seller name from settings
  useEffect(() => {
    (async () => {
      try {
        const s = await getUserSettings();
        if (s?.seller_name) set("vendedor", s.seller_name);
      } catch {}
    })();
  }, []);

  // CEP lookup
  const fetchCep = async (digits: string) => {
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setFormData((prev) => ({
          ...prev,
          rua: data.logradouro || prev.rua,
          bairro: data.bairro || prev.bairro,
          cidade: data.localidade || prev.cidade,
          uf: data.uf || prev.uf,
        }));
      }
    } catch {}
  };

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 8);
    const formatted = raw.length > 5 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : raw;
    set("cep", formatted);
    if (raw.length === 8) fetchCep(raw);
  };

  // CNPJ mask & auto-lookup
  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value.replace(/\D/g, "").slice(0, 14);
    if (v.length >= 3) v = v.replace(/^(\d{2})(\d)/, "$1.$2");
    if (v.length >= 7) v = v.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
    if (v.length >= 11) v = v.replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4");
    if (v.length >= 16) v = v.replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
    set("cnpj", v);
  };

  useEffect(() => {
    if (cnpjDebounce.current) clearTimeout(cnpjDebounce.current);
    const digits = formData.cnpj.replace(/\D/g, "");
    if (digits.length === 14 && lastFetchedCnpj.current !== digits) {
      cnpjDebounce.current = setTimeout(async () => {
        lastFetchedCnpj.current = digits;
        const tId = toast.loading("Buscando CNPJ...");
        try {
          const { fetchCnpjData } = await import("@/services/cnpjService");
          const data = await fetchCnpjData(digits);
          if (data) {
            setFormData((prev) => ({
              ...prev,
              empresa: data.companyName || prev.empresa,
              rua: data.address || prev.rua,
            }));
            toast.success("Dados do CNPJ preenchidos!", { id: tId });
          } else {
            toast.dismiss(tId);
          }
        } catch {
          toast.dismiss(tId);
        }
      }, 600);
    }
    return () => { if (cnpjDebounce.current) clearTimeout(cnpjDebounce.current); };
  }, [formData.cnpj]);

  const handleContatoTelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = e.target.value.replace(/\D/g, "").slice(0, 11);
    let f = "";
    if (d.length > 0) f = "(" + d.slice(0, 2);
    if (d.length > 2) f += ") " + d.slice(2, d.length > 10 ? 7 : 6);
    if (d.length > 6) f += "-" + d.slice(d.length > 10 ? 7 : 6);
    set("contatoTelefone", f);
  };

  const handleGenerateDocx = async () => {
    setLoading(true);
    const tId = toast.loading("Gerando documento de qualificação...");
    try {
      const res = await fetch(encodeURI("/Solicitação de vistoria.docx"));
      if (!res.ok) throw new Error("Template DOCX não encontrado no servidor.");
      const arrayBuffer = await res.arrayBuffer();
      const zip = new PizZip(arrayBuffer);

      const filesToHeal = ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/header3.xml"];
      for (const fileName of filesToHeal) {
        const file = zip.file(fileName);
        if (file) zip.file(fileName, healDocxTokens(file.asText()));
      }

      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => "",
        delimiters: { start: "{{", end: "}}" },
      });

      const renderData: Record<string, string> = {
        nomevendedor: formData.vendedor,
        empresa: formData.empresa,
        emailcliente: formData.empresaEmail,
        Rua: formData.rua,
        Numero: formData.numero,
        Complemento: formData.complemento,
        Bairro: formData.bairro,
        Cidade: formData.cidade,
        UF: formData.uf,
        nomecliente: formData.contatoNome,
        telcliente: formData.contatoTelefone,
        produto: formData.produto,
        qtd: formData.quantidade,
        obs: formData.observacoes,
      };

      // Also inject lowercase/uppercase variants for robustness
      const finalData: Record<string, string> = {};
      Object.entries(renderData).forEach(([k, v]) => {
        finalData[k] = v;
        finalData[k.toLowerCase()] = v;
        finalData[k.toUpperCase()] = v;
      });

      doc.setData(finalData);
      doc.render();

      const out = doc.getZip().generate({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      const safeName = (formData.empresa || "cliente").replace(/[\/\\:*?"<>|]/g, "_");
      const seq = formData.sequencia || "001";
      const ver = formData.versao || "0";
      saveAs(out, `${safeName} - OBM-${seq} - REV${ver}.docx`);

      toast.success("Documento de qualificação gerado com sucesso!", { id: tId });
      setCurrentStep(3); // success step
    } catch (err: any) {
      console.error(err);
      toast.error(`Erro ao gerar documento: ${err.message || String(err)}`, { id: tId });
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-5">
            {/* Filename preview */}
            {formData.empresa && (
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl">
                <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-bold mb-0.5">Nome do arquivo</p>
                <p className="text-sm font-mono font-bold truncate">
                  {formData.empresa.replace(/[\/\\:*?"<>|]/g, "_")} - OBM-{formData.sequencia || "001"} - REV{formData.versao || "0"}.docx
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nº Seq. OBM</Label>
                <Input value={formData.sequencia} onChange={(e) => set("sequencia", e.target.value.replace(/\D/g, "").slice(0, 4).padStart(3, "0") || "001")} placeholder="001" />
              </div>
              <div className="space-y-2">
                <Label>Versão (REV)</Label>
                <Input type="number" min="0" value={formData.versao} onChange={(e) => set("versao", e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vendedor Responsável</Label>
                <Input value={formData.vendedor} onChange={(e) => set("vendedor", e.target.value)} placeholder="Seu nome" />
              </div>
              <div className="space-y-2">
                <Label>CNPJ</Label>
                <div className="flex gap-2">
                  <Input placeholder="00.000.000/0000-00" value={formData.cnpj} onChange={handleCnpjChange} />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Razão Social</Label>
                <Input value={formData.empresa} onChange={(e) => set("empresa", e.target.value)} placeholder="Empresa do cliente" />
              </div>
              <div className="space-y-2">
                <Label>E-mail da Empresa</Label>
                <Input value={formData.empresaEmail} onChange={(e) => set("empresaEmail", e.target.value)} placeholder="email@empresa.com" type="email" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome do Contato</Label>
                <Input value={formData.contatoNome} onChange={(e) => set("contatoNome", e.target.value)} placeholder="A/C: Nome" />
              </div>
              <div className="space-y-2">
                <Label>Telefone do Contato</Label>
                <Input value={formData.contatoTelefone} onChange={handleContatoTelChange} placeholder="(00) 00000-0000" />
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>CEP</Label>
                <Input value={formData.cep} onChange={handleCepChange} placeholder="00000-000" />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Cidade</Label>
                <Input value={formData.cidade} onChange={(e) => set("cidade", e.target.value)} placeholder="Cidade" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2 space-y-2">
                <Label>Rua / Logradouro</Label>
                <Input value={formData.rua} onChange={(e) => set("rua", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>UF</Label>
                <Input value={formData.uf} onChange={(e) => set("uf", e.target.value)} maxLength={2} />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Número</Label>
                <Input value={formData.numero} onChange={(e) => set("numero", e.target.value)} placeholder="123" />
              </div>
              <div className="col-span-1 sm:col-span-3 space-y-2">
                <Label>Complemento</Label>
                <Input value={formData.complemento} onChange={(e) => set("complemento", e.target.value)} placeholder="Sala, andar..." />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Produto / Escopo</Label>
                <Input value={formData.produto} onChange={(e) => set("produto", e.target.value)} placeholder="Ex: iDFace 373 Bio" />
              </div>
              <div className="space-y-2">
                <Label>Quantidade</Label>
                <Input value={formData.quantidade} onChange={(e) => set("quantidade", e.target.value)} placeholder="1" type="number" min="1" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={formData.observacoes}
                onChange={(e) => set("observacoes", e.target.value)}
                placeholder="Informações adicionais para o documento..."
                rows={3}
              />
            </div>
          </div>
        );

      case 3:
        return (
          <div className="py-10 flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in-95 duration-500">
            <div className="p-4 bg-green-100 dark:bg-green-900/30 rounded-full">
              <CheckCircle2 className="h-16 w-16 text-green-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-black">Documento Gerado!</h2>
              <p className="text-muted-foreground max-w-sm">
                O documento de qualificação foi baixado para o seu computador.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 w-full max-w-xs">
              <Button onClick={handleGenerateDocx} disabled={loading} variant="outline" className="h-12 rounded-2xl">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                Baixar Novamente
              </Button>
              <Button onClick={onCancel} className="h-12 rounded-2xl">
                Voltar ao Início
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card className="max-w-2xl mx-auto proposal-highlight rounded-3xl border-none shadow-md w-full">
      <CardHeader className="p-6 md:p-8" style={{ background: "#f47321" }}>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-xl md:text-2xl font-black text-white">
              {currentStep === 3 ? "Concluído" : `Passo ${currentStep}`}
            </CardTitle>
            <CardDescription className="text-white/70 text-xs md:text-sm">
              {currentStep === 1 && "Dados do cliente"}
              {currentStep === 2 && "Endereço e escopo"}
              {currentStep === 3 && "Qualificação pronta"}
            </CardDescription>
          </div>
          {currentStep < 3 && (
            <div className="text-xs bg-white/20 px-3 py-1 rounded-full text-white">
              {currentStep}/2
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-6 md:p-8">
        {renderStep()}

        {currentStep < 3 && (
          <div className="flex justify-between mt-6 pt-4 border-t">
            <Button
              variant="ghost"
              className="rounded-xl"
              onClick={currentStep === 1 ? onCancel : () => setCurrentStep((p) => p - 1)}
            >
              {currentStep === 1 ? "Cancelar" : "Voltar"}
            </Button>

            {currentStep < 2 ? (
              <Button className="rounded-xl px-6" style={{ background: "#f47321" }} onClick={() => setCurrentStep((p) => p + 1)}>
                Próximo <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                className="rounded-xl px-6 font-bold"
                style={{ background: "#f47321" }}
                onClick={handleGenerateDocx}
                disabled={loading}
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                Gerar Documento
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
