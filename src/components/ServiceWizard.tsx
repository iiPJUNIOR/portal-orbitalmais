"use client";

import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, CheckCircle2, FileText,
  Loader2, Plus, Search, Trash2, Save, Info,
} from "lucide-react";
import { getUserSettings, defaultFields } from "@/services/settingsService";
import { fetchProducts } from "@/services/productService";
import { formatCurrencyBRL } from "@/lib/formatters";
import { saveDraft, updateDraft } from "@/services/draftService";
import { getNextProposalSequence } from "@/services/supabaseService";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { saveAs } from "file-saver";

/* ─── DOCX helpers ─── */
function healDocxTokens(xml: string): string {
  if (!xml) return xml;
  const pRe = /<w:p(?: [\s\S]*?)?>([\s\S]*?)<\/w:p>/gi;
  return xml.replace(pRe, (pFull, pContent) => {
    if (!pContent.includes("{") && !pContent.includes("}")) return pFull;
    const tRe = /(<w:t[^>]*>)([\s\S]*?)(<\/w:t>)/gi;
    const runs: { open: string; text: string; close: string }[] = [];
    let m;
    while ((m = tRe.exec(pContent)) !== null)
      runs.push({ open: m[1], text: m[2], close: m[3] });
    if (runs.length <= 1) return pFull;
    let idx = 0;
    const healed = pContent.replace(tRe, () => {
      const r = runs[idx++];
      if (idx === 1) return r.open + runs.map((x) => x.text).join("") + r.close;
      return r.open + r.close;
    });
    const pOpen = pFull.match(/^<w:p(?: [\s\S]*?)?>/i)?.[0] || "<w:p>";
    return pOpen + healed + "</w:p>";
  });
}

async function generateServiceDocx(data: Record<string, string>, templateUrl: string): Promise<Blob> {
  const res = await fetch(encodeURI(templateUrl));
  if (!res.ok) throw new Error(`Template DOCX não encontrado: ${templateUrl}`);
  const buf = await res.arrayBuffer();
  const zip = new PizZip(buf);

  for (const fn of ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/header3.xml"]) {
    const f = zip.file(fn);
    if (f) zip.file(fn, healDocxTokens(f.asText()));
  }

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
    delimiters: { start: "{{", end: "}}" },
  });

  const final: Record<string, string> = {};
  Object.entries(data).forEach(([k, v]) => {
    final[k] = v; final[k.toLowerCase()] = v; final[k.toUpperCase()] = v;
  });

  doc.setData(final);
  doc.render();

  return doc.getZip().generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

/* ─── helpers ─── */
const formatCurrency = (v: string): string => {
  const digits = v.replace(/\D/g, "");
  if (!digits) return "";
  const num = (parseInt(digits, 10) / 100).toFixed(2);
  const [int, dec] = num.split(".");
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${intFmt},${dec}`;
};

/* ─── component ─── */
interface Props {
  onCancel: () => void;
  draftId?: string;
  initialData?: any;
  initialStep?: number;
}

export function ServiceWizard({ onCancel, draftId, initialData, initialStep }: Props) {
  const [currentStep, setCurrentStep] = useState(initialStep || 1);
  const [loading, setLoading] = useState(false);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [templateUrl, setTemplateUrl] = useState<string>("/Solicitação de vistoria.docx");
  const lastFetchedCnpj = useRef<string>("");
  const cnpjDebounce = useRef<NodeJS.Timeout | null>(null);
  const [todaySequence, setTodaySequence] = useState(1);
  const [numberEdited, setNumberEdited] = useState(false);

  const [form, setForm] = useState<any>({
    proposalNumber: "",
    version: "1",
    date: new Date().toISOString().split("T")[0],
    companyName: "",
    contactName: "",
    cnpj: "",
    address: "",
    sellerName: "",
    sellerRole: "",
    sellerEmail: "",
    sellerPhone: "",
    selectedProducts: [] as any[],
    totalPrice: "",
    observations: "",
  });

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  /* load settings + products */
  useEffect(() => {
    (async () => {
      try {
        const s = await getUserSettings();
        if (s) {
          setForm((p: any) => ({
            ...p,
            sellerName: p.sellerName || s.seller_name || "",
            sellerRole: p.sellerRole || s.seller_role || "",
            sellerEmail: p.sellerEmail || s.seller_email || "",
            sellerPhone: p.sellerPhone || s.seller_phone || "",
          }));
          // If user configured a service docx template, use it
          if ((s as any).service_docx_url) setTemplateUrl((s as any).service_docx_url);
        }
        const prods = await fetchProducts();
        setAllProducts(prods.filter((p: any) => (p.status || "").toLowerCase() === "ativo"));
      } catch {}
    })();
  }, []);

  /* sequence for proposal number */
  useEffect(() => {
    (async () => {
      const dateStr = (form.date || "").replace(/\D/g, "");
      const seq = await getNextProposalSequence(dateStr);
      setTodaySequence(seq);
    })();
  }, [form.date]);

  useEffect(() => {
    if (!numberEdited && form.companyName) {
      const dateStr = (form.date || "").replace(/\D/g, "");
      const seq = String(todaySequence).padStart(3, "0");
      set("proposalNumber", `${form.companyName} - ${dateStr}-${seq}`);
    }
  }, [form.companyName, todaySequence, form.date, numberEdited]);

  /* apply initialData */
  useEffect(() => {
    if (initialData) setForm((p: any) => ({ ...p, ...initialData }));
  }, []);

  /* CNPJ */
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
    const digits = form.cnpj.replace(/\D/g, "");
    if (digits.length === 14 && lastFetchedCnpj.current !== digits) {
      cnpjDebounce.current = setTimeout(async () => {
        lastFetchedCnpj.current = digits;
        const tId = toast.loading("Buscando CNPJ...");
        try {
          const { fetchCnpjData } = await import("@/services/cnpjService");
          const data = await fetchCnpjData(digits);
          if (data) {
            setForm((p: any) => ({
              ...p,
              companyName: data.companyName || p.companyName,
              address: data.address || p.address,
            }));
            toast.success("Dados preenchidos!", { id: tId });
          } else { toast.dismiss(tId); }
        } catch { toast.dismiss(tId); }
      }, 600);
    }
    return () => { if (cnpjDebounce.current) clearTimeout(cnpjDebounce.current); };
  }, [form.cnpj]);

  /* products */
  const filteredProducts = React.useMemo(() => {
    const q = productSearch.toLowerCase();
    return allProducts.filter((p) =>
      !q || p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.model?.toLowerCase().includes(q)
    );
  }, [allProducts, productSearch]);

  const isSelected = (id: string) => form.selectedProducts.some((sp: any) => sp.baseId === id);

  const toggleProduct = (p: any) => {
    setForm((prev: any) => {
      const exists = prev.selectedProducts.find((sp: any) => sp.baseId === p.id);
      if (exists) return { ...prev, selectedProducts: prev.selectedProducts.filter((sp: any) => sp.baseId !== p.id) };
      return { ...prev, selectedProducts: [...prev.selectedProducts, { ...p, baseId: p.id, name: p.model, quantity: 1 }] };
    });
  };

  /* items text for DOCX */
  const buildItemsText = (): string =>
    form.selectedProducts.map((p: any) => `• ${p.name} (Qtd: ${p.quantity})`).join("\n");

  /* generate DOCX */
  const handleGenerate = async () => {
    setLoading(true);
    const tId = toast.loading("Gerando proposta de serviço...");
    try {
      const data: Record<string, string> = {
        nomevendedor: form.sellerName,
        cargovendedor: form.sellerRole,
        emailvendedor: form.sellerEmail,
        telvendedor: form.sellerPhone,
        empresa: form.companyName,
        cnpj: form.cnpj,
        nomecliente: form.contactName,
        endereco: form.address,
        produto: buildItemsText(),
        qtd: String(form.selectedProducts.length),
        valor: form.totalPrice,
        numeroproposta: form.proposalNumber,
        versao: form.version,
        data: form.date,
        obs: form.observations,
      };

      const blob = await generateServiceDocx(data, templateUrl);
      const safe = String(form.proposalNumber || form.companyName || "Proposta").replace(/[\/\\:*?"<>|]/g, "_");
      saveAs(blob, `${safe}.docx`);

      toast.success("Proposta de serviço gerada!", { id: tId });
      setCurrentStep(4); // success
    } catch (err: any) {
      console.error(err);
      toast.error(`Erro: ${err.message || String(err)}`, { id: tId });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    try {
      const tId = toast.loading("Salvando rascunho...");
      if (draftId) {
        const { success, synced } = await updateDraft(draftId, { data: form, step: currentStep });
        if (success) {
          if (synced) {
            toast.success("Rascunho atualizado e sincronizado com o servidor", { id: tId });
          } else {
            toast.info("Rascunho atualizado localmente (offline)", { id: tId });
          }
        } else {
          toast.error("Falha ao atualizar rascunho", { id: tId });
        }
      } else {
        const { id, synced } = await saveDraft({ data: form, step: currentStep });
        if (synced) {
          toast.success("Rascunho salvo e sincronizado com o servidor", { id: tId });
        } else {
          toast.info("Rascunho salvo localmente (offline)", { id: tId });
        }
      }
    } catch (err) {
      console.error("save draft failed", err);
      toast.error("Erro ao salvar rascunho");
    }
  };

  /* ─── Steps ─── */
  const renderStep = () => {
    switch (currentStep) {
      /* Step 1: Client data */
      case 1:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Número do Orçamento</Label>
              <Input
                placeholder="Ex: Empresa - 20260605-001"
                value={form.proposalNumber}
                onChange={(e) => { setNumberEdited(true); set("proposalNumber", e.target.value); }}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Versão</Label><Input value={form.version} onChange={(e) => set("version", e.target.value)} /></div>
              <div className="space-y-2"><Label>Data</Label><Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} /></div>
            </div>
            <div className="space-y-2">
              <Label>CNPJ</Label>
              <Input placeholder="00.000.000/0000-00" value={form.cnpj} onChange={handleCnpjChange} />
            </div>
            <div className="space-y-2"><Label>Razão Social</Label><Input value={form.companyName} onChange={(e) => set("companyName", e.target.value)} /></div>
            <div className="space-y-2"><Label>Nome do Contato</Label><Input value={form.contactName} onChange={(e) => set("contactName", e.target.value)} /></div>
            <div className="space-y-2"><Label>Endereço</Label><Input value={form.address} onChange={(e) => set("address", e.target.value)} /></div>
          </div>
        );

      /* Step 2: Seller data */
      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-2"><Label>Vendedor</Label><Input value={form.sellerName} onChange={(e) => set("sellerName", e.target.value)} /></div>
            <div className="space-y-2"><Label>Cargo</Label><Input value={form.sellerRole} onChange={(e) => set("sellerRole", e.target.value)} /></div>
            <div className="space-y-2"><Label>E-mail</Label><Input value={form.sellerEmail} onChange={(e) => set("sellerEmail", e.target.value)} /></div>
            <div className="space-y-2"><Label>Telefone</Label><Input value={form.sellerPhone} onChange={(e) => set("sellerPhone", e.target.value)} /></div>
          </div>
        );

      /* Step 3: Products + pricing */
      case 3:
        return (
          <div className="space-y-5">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar produto ou serviço..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
            </div>

            {/* Catalog list */}
            <div className="border rounded-xl divide-y bg-card max-h-64 overflow-y-auto">
              {filteredProducts.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground text-center">Nenhum produto encontrado.</p>
              )}
              {filteredProducts.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 hover:bg-muted/40 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{p.model || p.name}</p>
                    {p.sku && <p className="text-xs text-muted-foreground font-mono">{p.sku}</p>}
                  </div>
                  <Button size="sm" variant={isSelected(p.id) ? "destructive" : "outline"}
                    className="h-8 w-8 p-0 rounded-full shrink-0 ml-3" onClick={() => toggleProduct(p)}>
                    {isSelected(p.id) ? <Trash2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              ))}
            </div>

            {/* Selected items */}
            {form.selectedProducts.length > 0 && (
              <div className="space-y-2 pt-2 border-t">
                <Label className="font-bold">Itens Selecionados ({form.selectedProducts.length})</Label>
                {form.selectedProducts.map((p: any) => (
                  <div key={p.baseId} className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/10 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <Input className="text-sm font-bold h-8" value={p.name}
                        onChange={(e) => setForm((prev: any) => ({
                          ...prev,
                          selectedProducts: prev.selectedProducts.map((sp: any) =>
                            sp.baseId === p.baseId ? { ...sp, name: e.target.value } : sp)
                        }))} />
                    </div>
                    <Input type="number" min={1} className="w-16 h-8 text-center text-xs font-bold"
                      value={p.quantity}
                      onChange={(e) => setForm((prev: any) => ({
                        ...prev,
                        selectedProducts: prev.selectedProducts.map((sp: any) =>
                          sp.baseId === p.baseId ? { ...sp, quantity: Math.max(1, parseInt(e.target.value) || 1) } : sp)
                      }))} />
                    <Button variant="ghost" size="sm" onClick={() =>
                      setForm((prev: any) => ({ ...prev, selectedProducts: prev.selectedProducts.filter((sp: any) => sp.baseId !== p.baseId) }))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Total price */}
            <div className="p-5 bg-primary rounded-2xl space-y-2">
              <Label className="text-white/80 text-xs uppercase tracking-widest font-bold">Valor Total da Proposta</Label>
              <Input
                placeholder="R$ 0,00"
                className="bg-transparent border-none text-3xl font-black text-white placeholder:text-white/40 p-0 h-auto focus-visible:ring-0"
                value={form.totalPrice}
                onChange={(e) => set("totalPrice", formatCurrency(e.target.value))}
              />
            </div>

            {/* Observations */}
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea rows={3} value={form.observations} onChange={(e) => set("observations", e.target.value)} placeholder="Condições comerciais, prazo de entrega, validade..." />
            </div>
          </div>
        );

      /* Step 4: Success */
      case 4:
        return (
          <div className="py-10 flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in-95 duration-500">
            <div className="p-4 bg-green-100 dark:bg-green-900/30 rounded-full">
              <CheckCircle2 className="h-16 w-16 text-green-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-black">Proposta Gerada!</h2>
              <p className="text-muted-foreground max-w-sm">
                O documento foi baixado. Você pode baixar novamente ou iniciar uma nova proposta.
              </p>
            </div>
            <div className="p-4 bg-muted/30 rounded-2xl border border-dashed text-left w-full space-y-1">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <Info className="h-4 w-4" /> Dica
              </div>
              <p className="text-xs text-muted-foreground">
                Para substituir o template, acesse <strong>Configurações → Bases Salvas</strong> e envie seu arquivo DOCX base.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 w-full max-w-xs">
              <Button variant="outline" className="h-12 rounded-2xl" onClick={handleGenerate} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                Baixar Novamente
              </Button>
              <Button className="h-12 rounded-2xl" onClick={onCancel}>Voltar ao Início</Button>
            </div>
          </div>
        );

      default: return null;
    }
  };

  return (
    <Card className="max-w-2xl mx-auto proposal-highlight rounded-3xl border-none shadow-md w-full">
      <CardHeader className="bg-primary text-white p-6 md:p-8">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-xl md:text-2xl font-black">
              {currentStep === 4 ? "Concluído" : `Passo ${currentStep}`}
            </CardTitle>
            <CardDescription className="text-white/70 text-xs md:text-sm">
              {currentStep === 1 && "Dados do cliente"}
              {currentStep === 2 && "Dados do vendedor"}
              {currentStep === 3 && "Produtos e valor"}
              {currentStep === 4 && "Proposta de serviço pronta"}
            </CardDescription>
          </div>
          {currentStep < 4 && (
            <div className="text-xs bg-white/20 px-3 py-1 rounded-full text-white">
              {currentStep}/3
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-6 md:p-8">
        {renderStep()}

        {currentStep < 4 && (
          <div className="flex justify-between mt-6 pt-4 border-t">
            <div className="flex gap-2">
              <Button variant="ghost" className="rounded-xl"
                onClick={currentStep === 1 ? onCancel : () => setCurrentStep((p) => p - 1)}>
                {currentStep === 1 ? "Cancelar" : "Voltar"}
              </Button>
              {currentStep >= 2 && (
                <Button variant="outline" className="rounded-xl" onClick={handleSaveDraft}>
                  <Save className="mr-2 h-4 w-4" /> Salvar rascunho
                </Button>
              )}
            </div>

            {currentStep < 3 ? (
              <Button className="rounded-xl px-6" onClick={() => setCurrentStep((p) => p + 1)}>
                Próximo <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button className="rounded-xl px-6 font-bold" onClick={handleGenerate} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                Gerar DOCX
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
