"use client";

import React, { useEffect, useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { showSuccess, showError, showLoading, dismissToast } from "@/utils/toast";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { saveAs } from "file-saver";
import { getUserSettings, UserSettings } from "@/services/settingsService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Mail, FileText, Copy, FileText as FileTextIcon } from "lucide-react";

export default function SolicitarVistoria() {
  // Seller / contact info
  const [vendedor, setVendedor] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [empresaEmail, setEmpresaEmail] = useState("");
  const [empresaPhone, setEmpresaPhone] = useState("");
  const [contatoNome, setContatoNome] = useState("");
  const [contatoTelefone, setContatoTelefone] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [produto, setProduto] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);

  // Address split fields
  const [cep, setCep] = useState("");
  const [rua, setRua] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");

  // CNPJ related
  const [cnpj, setCnpj] = useState("");
  const [fetchingCnpj, setFetchingCnpj] = useState(false);
  const lastFetchedCnpj = useRef<string | null>(null);

  // Track last fetched CEP to avoid repeated requests
  const lastFetchedCepRef = useRef<string | null>(null);

  // Prefill seller info from user settings
  useEffect(() => {
    (async () => {
      try {
        const s = await getUserSettings();
        if (!s) return;
        setSettings(s);
        if (!vendedor && s.seller_name) setVendedor(s.seller_name);
      } catch (err) {
        console.warn("SolicitarVistoria: falha ao obter seller settings", err);
      }
    })();
  }, []);

  const subject = empresa ? `Solicitação de vistoria técnica presencial – ${empresa}` : "Solicitação de vistoria técnica presencial";

  // Helper: compose a full single-line address: Street, Number - Neighborhood - City/UF - CEP: 00000-000
  function composeFullAddress() {
    const parts: string[] = [];
    
    // Part 1: Street and Number
    if (rua) {
      let main = rua;
      if (numero) main += `, ${numero}`;
      if (complemento) main += ` ${complemento}`;
      parts.push(main);
    }
    
    // Part 2: Neighborhood
    if (bairro) parts.push(bairro);
    
    // Part 3: City/UF
    const cityState = [cidade, uf].filter(Boolean).join("/");
    if (cityState) parts.push(cityState);
    
    // Part 4: CEP
    if (cep) parts.push(`CEP: ${cep}`);
    
    return parts.filter(Boolean).join(" - ");
  }

  const buildEmailBody = () => {
    const lines: string[] = [];
    lines.push(`Olá Evelem,\n`);
    lines.push(`Poderia, por gentileza, agendar uma vistoria técnica para atendimento à empresa ${empresa || "[Razão Social]"}, conforme informações abaixo:\n`);

    if (vendedor) lines.push(`• Vendedor: ${vendedor}`);
    if (empresa) lines.push(`• Empresa: ${empresa}`);
    if (cnpj) lines.push(`• CNPJ: ${cnpj}`);
    if (contatoNome) lines.push(`• Contato: ${contatoNome}${contatoTelefone ? ` (${contatoTelefone})` : ""}`);
    
    const addr = composeFullAddress();
    if (addr) lines.push(`• Endereço: ${addr}`);
    
    if (produto) lines.push(`• Produto/Solicitação: ${produto}${quantidade ? ` (${quantidade} un)` : ""}`);
    if (observacoes) lines.push(`\nObservações: ${observacoes}`);

    lines.push(`\nAgradeço desde já o suporte e fico à disposição.\n`);
    lines.push(`Atenciosamente,`);
    lines.push(`${vendedor || "Consultor Comercial"}`);

    return lines.filter(Boolean).join("\n");
  };

  /**
   * Robust healing of fragmented tokens in docx XML.
   */
  function healDocxTokens(xml: string): string {
    if (!xml) return xml;
    const paragraphRegex = /<w:p(?: [\s\S]*?)?>([\s\S]*?)<\/w:p>/gi;
    return xml.replace(paragraphRegex, (pFull, pContent) => {
      if (!pContent.includes('{') && !pContent.includes('}')) return pFull;
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
          const fullText = runs.map(run => run.text).join("");
          return r.open + fullText + r.close;
        }
        return r.open + r.close;
      });
      const pOpen = pFull.match(/^<w:p(?: [\s\S]*?)?>/i)?.[0] || "<w:p>";
      return pOpen + healedContent + "</w:p>";
    });
  }

  const handleGenerateDocx = async () => {
    setLoadingDoc(true);
    const toastId = showLoading("Gerando documento...");
    try {
      const res = await fetch(encodeURI("/Solicitação de vistoria.docx"));
      if (!res.ok) throw new Error("Template DOCX não encontrado no servidor.");
      const arrayBuffer = await res.arrayBuffer();
      
      const zip = new PizZip(arrayBuffer);

      // Limpa fragmentação de tags XML
      const filesToHeal = ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/header3.xml"];
      for (const fileName of filesToHeal) {
        const file = zip.file(fileName);
        if (file) {
          const content = file.asText();
          zip.file(fileName, healDocxTokens(content));
        }
      }

      const doc = new Docxtemplater(zip, { 
        paragraphLoop: true, 
        linebreaks: true, 
        delimiters: { start: "{{", end: "}}" }
      });

      // Mapeamento exaustivo de dados para cobrir camelCase e snake_case e variações PT-BR
      const fullAddress = composeFullAddress();
      const docxData = {
        // Snake Case
        vendedor: vendedor || "",
        empresa: empresa || "",
        cnpj: cnpj || "",
        CNPJ: cnpj || "",
        empresa_phone: empresaPhone || "",
        empresa_email: empresaEmail || "",
        contato_nome: contatoNome || "",
        contato_telefone: contatoTelefone || "",
        cep: cep || "",
        CEP: cep || "",
        rua: rua || "",
        numero: numero || "",
        complemento: complemento || "",
        bairro: bairro || "",
        cidade: cidade || "",
        uf: uf || "",
        UF: uf || "",
        endereco: fullAddress,
        endereço: fullAddress,
        quantidade: quantidade || "",
        qtd: quantidade || "",
        produto: produto || "",
        observacoes: observacoes || "",
        observação: observacoes || "",

        // Camel Case (alguns templates podem usar)
        empresaEmail: empresaEmail || "",
        empresaPhone: empresaPhone || "",
        contatoNome: contatoNome || "",
        contatoTelefone: contatoTelefone || "",
        fullAddress: fullAddress,
      } as any;

      // Se houver mapeamentos customizados salvos em Configurações, eles têm prioridade
      const mappings = settings?.docx_mappings || {};
      const renderData: Record<string, any> = { ...docxData };

      if (Object.keys(mappings).length > 0) {
        Object.entries(mappings).forEach(([token, field]) => {
          if (field === "none") return;
          const cleanToken = token.replace(/[{}]/g, "").trim();
          renderData[cleanToken] = docxData[field] ?? "";
        });
      }

      // Aplica os dados e renderiza
      doc.setData(renderData);
      doc.render();

      const out = doc.getZip().generate({ 
        type: "blob", 
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
      });
      
      saveAs(out, `Vistoria_${(empresa || "cliente").replace(/\s/g, "_")}.docx`);
      
      dismissToast(toastId as any);
      showSuccess("DOCX gerado!");
    } catch (err: any) {
      console.error(err);
      showError(`Erro: ${err.message || String(err)}`, { id: toastId });
    } finally {
      setLoadingDoc(false);
    }
  };

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "").substring(0, 14);
    let formatted = "";
    for (let i = 0; i < value.length; i++) {
      if (i === 2 || i === 5) formatted += ".";
      if (i === 8) formatted += "/";
      if (i === 12) formatted += "-";
      formatted += value[i];
    }
    setCnpj(formatted);
  };

  const handleContatoTelefoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = e.target.value.replace(/\D/g, "").slice(0, 11);
    let f = "";
    if (d.length > 0) f = "(" + d.slice(0, 2);
    if (d.length > 2) f += ") " + d.slice(2, d.length > 10 ? 7 : 6);
    if (d.length > 6) f += "-" + d.slice(d.length > 10 ? 7 : 6);
    setContatoTelefone(f);
  };

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "").substring(0, 8);
    let formatted = value.length > 5 ? `${value.slice(0, 5)}-${value.slice(5)}` : value;
    setCep(formatted);
    if (value.length === 8 && lastFetchedCepRef.current !== value) {
      fetchCepData(value);
    }
  };

  async function fetchCepData(digits: string) {
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setRua(data.logradouro || "");
        setBairro(data.bairro || "");
        setCidade(data.localidade || "");
        setUf(data.uf || "");
        lastFetchedCepRef.current = digits;
      }
    } catch {}
  }

  useEffect(() => {
    const digits = cnpj.replace(/\D/g, "");
    if (digits.length === 14) {
      const timer = setTimeout(async () => {
        if (lastFetchedCnpj.current === digits) return;
        lastFetchedCnpj.current = digits;
        try {
          const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
          const data = await res.json();
          if (data) {
            setNumero(String(data.numero || ""));
            setComplemento(String(data.complemento || ""));
            if (!empresa) setEmpresa(data.razao_social || "");
            if (data.cep) {
              const c = data.cep.replace(/\D/g, "");
              setCep(`${c.slice(0,5)}-${c.slice(5)}`);
              fetchCepData(c);
            }
          }
        } catch {}
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [cnpj]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-2">
        <FileTextIcon className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Solicitar Vistoria</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">Preencha os dados e gere o documento ou e-mail de vistoria.</p>

      <div className="space-y-6 bg-card p-6 rounded-lg shadow-sm border">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">Vendedor Responsável</Label>
            <Input value={vendedor} onChange={(e) => setVendedor(e.target.value)} placeholder="Seu nome" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">CNPJ</Label>
            <Input placeholder="00.000.000/0000-00" value={cnpj} onChange={handleCnpjChange} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">Empresa (Razão Social)</Label>
            <Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">E-mail Empresa</Label>
            <Input value={empresaEmail} onChange={(e) => setEmpresaEmail(e.target.value)} placeholder="email@empresa.com" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">Contato / Telefone</Label>
            <div className="flex gap-2">
              <Input className="flex-1" value={contatoNome} onChange={(e) => setContatoNome(e.target.value)} placeholder="Nome" />
              <Input className="w-40" value={contatoTelefone} onChange={handleContatoTelefoneChange} placeholder="(00) 00000-0000" />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">CEP / Cidade</Label>
            <div className="flex gap-2">
              <Input className="w-32" value={cep} onChange={handleCepChange} placeholder="00000-000" />
              <Input className="flex-1" value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Cidade" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/20 rounded-xl border border-dashed">
          <div className="md:col-span-2 space-y-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">Rua</Label>
            <Input value={rua} onChange={(e) => setRua(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">Nº / Compl.</Label>
            <div className="flex gap-2">
              <Input className="w-20" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex: 123" />
              <Input className="flex-1" value={complemento} onChange={(e) => setComplemento(e.target.value)} placeholder="Sala 1" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">Produto / Qtd</Label>
            <div className="flex gap-2">
              <Input className="flex-1" value={produto} onChange={(e) => setProduto(e.target.value)} placeholder="Ex: iDFace" />
              <Input className="w-20" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} placeholder="1" />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">Observações</Label>
            <Input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Instruções adicionais" />
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3 pt-6 border-t">
          <Button onClick={handleGenerateDocx} disabled={loadingDoc} className="font-bold flex-1 md:flex-none">
            {loadingDoc ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileTextIcon className="h-4 w-4 mr-2" />}
            Gerar Documento (Word)
          </Button>
          <Button variant="outline" onClick={() => {
            navigator.clipboard.writeText(buildEmailBody());
            showSuccess("Corpo do email copiado.");
          }} className="flex-1 md:flex-none">
            <Copy className="h-4 w-4 mr-2" /> Copiar E-mail
          </Button>
          <Button variant="secondary" onClick={() => {
            const body = encodeURIComponent(buildEmailBody());
            const sub = encodeURIComponent(subject);
            window.location.href = `mailto:?subject=${sub}&body=${body}`;
          }} className="flex-1 md:flex-none">
            <Mail className="h-4 w-4 mr-2" /> Abrir E-mail
          </Button>
        </div>

        <Card className="mt-8 border-none bg-muted/30 shadow-inner rounded-2xl overflow-hidden">
          <CardHeader className="py-3 px-6 border-b">
            <CardTitle className="text-xs font-black uppercase tracking-widest text-muted-foreground">Pré-visualização do E-mail</CardTitle>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="bg-white dark:bg-neutral-900 p-6 rounded-xl border shadow-sm font-sans text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
              {buildEmailBody().split("\n").map((line, i) => (
                <p key={i} className={line.trim() === "" ? "h-3" : "mb-0.5"}>{line}</p>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}