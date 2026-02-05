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
import { getUserSettings } from "@/services/settingsService";

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

  // Debounce refs
  const debounceCepRef = useRef<number | null>(null);
  const debounceCnpjRef = useRef<number | null>(null);

  // Prefill seller info from user settings (non-destructive)
  useEffect(() => {
    (async () => {
      try {
        const s = await getUserSettings();
        if (!s) return;
        if (!vendedor && s.seller_name) setVendedor(s.seller_name);
      } catch (err) {
        // non-blocking
        console.warn("SolicitarVistoria: falha ao obter seller settings", err);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, []);

  const subject = empresa ? `Solicitação de vistoria técnica presencial – ${empresa}` : "Solicitação de vistoria técnica presencial";

  // Helper: compose a full address for previews and legacy template fields
  function composeFullAddress() {
    const parts: string[] = [];
    if (rua) {
      let r = rua;
      if (numero) r += `, ${numero}`;
      if (complemento) r += ` ${complemento}`;
      parts.push(r);
    }
    if (bairro) parts.push(bairro);
    if (cidade || uf) parts.push([cidade, uf].filter(Boolean).join("/"));
    if (cep) parts.push(cep);
    return parts.filter(Boolean).join(" - ");
  }

  // Build a nicely formatted address for email / docx
  function formatAddressNiceFromFields() {
    const lines: string[] = [];
    if (rua) {
      let line = rua;
      if (numero) line += `, ${numero}`;
      if (complemento) line += ` ${complemento}`;
      lines.push(line);
    }
    const cityLineParts: string[] = [];
    if (bairro) cityLineParts.push(bairro);
    if (cidade) cityLineParts.push(cidade);
    if (uf) cityLineParts.push(uf);
    if (cityLineParts.length) lines.push(cityLineParts.join(" - "));
    if (cep) lines.push(`CEP: ${cep}`);
    return lines.join("\n");
  }

  const buildEmailBody = () => {
    const lines: string[] = [];

    lines.push(`Olá Evelem,\n`);
    lines.push(`Poderia, por gentileza, agendar uma vistoria técnica para atendimento à empresa ${empresa || "NOME_DA_EMPRESA"}, conforme informações abaixo.\n`);

    if (vendedor) {
      lines.push(`Vendedor responsável:\n${vendedor}\n`);
    }

    if (empresa || cnpj || empresaPhone || empresaEmail) {
      lines.push(`Empresa:`);
      if (empresa) lines.push(`${empresa}`);
      if (cnpj) lines.push(`CNPJ: ${cnpj}`);
      if (empresaPhone) lines.push(`Telefone: ${empresaPhone}`);
      if (empresaEmail) lines.push(`E-mail: ${empresaEmail}`);
      lines.push("");
    }

    if (contatoNome || contatoTelefone) {
      lines.push(`Contato responsável:`);
      if (contatoNome) lines.push(`Nome: ${contatoNome}`);
      if (contatoTelefone) lines.push(`Telefone: ${contatoTelefone}`);
      lines.push("");
    }

    if (rua || numero || bairro || cidade || uf || cep) {
      lines.push(`Endereço para vistoria:`);
      lines.push(formatAddressNiceFromFields());
      lines.push("");
    }

    if (produto) {
      lines.push(`Produto:\n${produto}`);
      if (quantidade) {
        lines.push(`Quantidade: ${quantidade}`);
      }
      lines.push("");
    } else if (quantidade) {
      lines.push(`Quantidade: ${quantidade}`);
      lines.push("");
    }

    if (observacoes && String(observacoes).trim().length > 0) {
      lines.push(`Observações:\n${observacoes}`);
      lines.push("");
    }

    lines.push(`Agradeço desde já o suporte e fico à disposição para qualquer esclarecimento adicional.\n`);
    lines.push(`Atenciosamente,\n${vendedor || ""}`);

    return lines.filter(Boolean).join("\n");
  };

  const handleCopyBody = async () => {
    try {
      await navigator.clipboard.writeText(buildEmailBody());
      showSuccess("Corpo do email copiado para a área de transferência.");
    } catch (err) {
      console.error(err);
      showError("Falha ao copiar o corpo do email.");
    }
  };

  const handleOpenMailClient = () => {
    try {
      const subjectEnc = encodeURIComponent(subject);
      const bodyEnc = encodeURIComponent(buildEmailBody());
      const mailto = `mailto:?subject=${subjectEnc}&body=${bodyEnc}`;
      window.location.href = mailto;
    } catch (err) {
      console.error(err);
      showError("Falha ao abrir cliente de e-mail.");
    }
  };

  const handleGenerateDocx = async () => {
    setLoadingDoc(true);
    try {
      const templatePath = encodeURI("/Solicitação de vistoria.docx");
      const res = await fetch(templatePath);
      if (!res.ok) throw new Error("Não foi possível baixar o template DOCX.");
      const arrayBuffer = await res.arrayBuffer();

      const zip = new PizZip(arrayBuffer);
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

      // Data object includes both split fields and legacy 'endereco'
      const data = {
        vendedor: vendedor || "",
        empresa: empresa || "",
        cnpj: cnpj || "",
        empresa_phone: empresaPhone || "",
        empresa_email: empresaEmail || "",
        contato_nome: contatoNome || "",
        contato_telefone: contatoTelefone || "",
        // split address fields
        cep: cep || "",
        rua: rua || "",
        numero: numero || "",
        complemento: complemento || "",
        bairro: bairro || "",
        cidade: cidade || "",
        uf: uf || "",
        // legacy full address field for templates that expect a single variable
        endereco: composeFullAddress(),
        quantidade: quantidade || "",
        produto: produto || "",
        observacoes: observacoes || "",
      } as any;

      doc.render(data);

      const out = doc.getZip().generate({ type: "blob" });
      const safeName = (empresa || "solicitacao_vistoria").replace(/[^a-z0-9]/gi, "_");
      saveAs(out, `Solicitacao_vistoria_${safeName}.docx`);
      showSuccess("Documento DOCX gerado e baixado com sucesso.");
    } catch (err: any) {
      console.error(err);
      showError("Erro ao gerar o DOCX. Verifique se o template possui as tags corretas.");
    } finally {
      setLoadingDoc(false);
    }
  };

  // Helper: format CNPJ as user types
  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length > 14) value = value.substring(0, 14);

    let formatted = "";
    for (let i = 0; i < value.length; i++) {
      if (i === 2 || i === 5) formatted += ".";
      if (i === 8) formatted += "/";
      if (i === 12) formatted += "-";
      formatted += value[i];
    }

    setCnpj(formatted);
  };

  // Phone formatting helpers
  function formatPhoneDigits(digits: string) {
    const d = digits.replace(/\D/g, "").slice(0, 11);
    if (d.length === 0) return "";
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  const handleEmpresaPhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const digits = raw.replace(/\D/g, "");
    setEmpresaPhone(formatPhoneDigits(digits));
  };

  const handleContatoTelefoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const digits = raw.replace(/\D/g, "");
    setContatoTelefone(formatPhoneDigits(digits));
  };

  const handlePhonePaste = (setter: (val: string) => void) => async (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").trim();
    const digits = text.replace(/\D/g, "");
    setter(formatPhoneDigits(digits));
  };

  // CEP handling: format as 00000-000 and fetch via ViaCEP when complete (8 digits)
  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length > 8) value = value.substring(0, 8);

    let formatted = "";
    for (let i = 0; i < value.length; i++) {
      if (i === 5) formatted += "-";
      formatted += value[i];
    }
    setCep(formatted);

    // debounce fetch
    if (debounceCepRef.current) {
      window.clearTimeout(debounceCepRef.current);
      debounceCepRef.current = null;
    }
    if (value.length === 8) {
      debounceCepRef.current = window.setTimeout(() => {
        fetchCepData(value);
        debounceCepRef.current = null;
      }, 500);
    } else {
      // if cleared, clear fetched address parts (but keep numero/complemento)
      if (value.length === 0) {
        setRua("");
        setBairro("");
        setCidade("");
        setUf("");
      }
    }
  };

  async function fetchCepData(digits: string) {
    if (!digits || digits.length !== 8) return;
    const id = showLoading("Buscando dados do CEP...");
    try {
      const url = `https://viacep.com.br/ws/${digits}/json/`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`ViaCEP retornou ${res.status}`);
      const data = await res.json();
      if (data.erro) throw new Error("CEP não encontrado");
      // ViaCEP fields: logradouro, complemento, bairro, localidade, uf
      setRua(data.logradouro || "");
      // Do not override numero (it's from CNPJ or manual)
      if (!complemento && data.complemento) setComplemento(data.complemento);
      setBairro(data.bairro || "");
      setCidade(data.localidade || "");
      setUf(data.uf || "");
      setCep((c) => {
        // ensure masked format
        const d = digits;
        return `${d.slice(0, 5)}-${d.slice(5)}`;
      });
      dismissToast(id as any);
      showSuccess("Dados do CEP carregados");
    } catch (err) {
      console.error("fetchCepData error", err);
      dismissToast(id as any);
      showError("Não foi possível obter dados do CEP informado.");
    }
  }

  // Manual CEP lookup button
  const handleManualCepLookup = () => {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) {
      showError("Informe um CEP válido (8 dígitos) para buscar");
      return;
    }
    fetchCepData(digits);
  };

  // Try to extract CEP from various shapes of CNPJ API responses
  function extractCepFromCnpjData(data: any): string | undefined {
    if (!data) return undefined;
    // Common direct fields
    const candidates = [
      data.cep,
      data.CEP,
      data.cep_principal,
      data.cep_pri,
      data.endereco?.cep,
      data.matriz_cnpj?.cep,
      data.estabelecimento?.cep,
      data.estab?.cep,
      data.address?.cep,
      data.address?.zip,
      data.empresa?.cep,
    ];
    for (const c of candidates) {
      if (c && typeof c === "string") {
        const digits = c.replace(/\D/g, "");
        if (digits.length === 8) return digits;
      }
    }

    // Some APIs include addresses in nested objects or arrays - try some common keys
    const possiblePaths = [
      ["estabelecimentos", 0, "cep"],
      ["estabelecimentos", 0, "endereco", "cep"],
      ["atividades_secundarias", 0, "cep"],
      ["estabelecimento", "logradouro", "cep"],
    ];
    for (const path of possiblePaths) {
      try {
        let v: any = data;
        for (const p of path) {
          if (v == null) break;
          v = v[p as any];
        }
        if (v && typeof v === "string") {
          const digits = v.replace(/\D/g, "");
          if (digits.length === 8) return digits;
        }
      } catch {}
    }

    // Try to parse any string value that looks like a CEP anywhere in object values
    const stack: any[] = [data];
    while (stack.length) {
      const cur = stack.pop();
      if (!cur) continue;
      if (typeof cur === "string") {
        const m = cur.replace(/\D/g, "");
        if (m.length === 8) return m;
      } else if (typeof cur === "object") {
        for (const k of Object.keys(cur)) {
          stack.push(cur[k]);
        }
      }
    }

    return undefined;
  }

  // CNPJ fetch: only populate numero and complemento from CNPJ data; if CEP available, fill cep and auto-fetch ViaCEP
  async function tryApisForCnpj(rawDigits: string) {
    const endpoints = [
      `https://brasilapi.com.br/api/cnpj/v1/${rawDigits}`,
      `https://publica.cnpj.ws/cnpj/${rawDigits}`,
      `https://receitaws.com.br/v1/cnpj/${rawDigits}`,
    ];
    for (const url of endpoints) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`API ${url} retornou ${res.status}`);
        const data = await res.json();
        // Prefer returning data even if partial; calling code will decide what to use
        return data;
      } catch (err) {
        console.debug("CNPJ API failed:", url, err);
      }
    }
    throw new Error("Nenhuma API retornou dados úteis para o CNPJ");
  }

  const fetchCnpjData = async (rawDigits: string) => {
    if (!rawDigits || rawDigits.length !== 14) return;
    if (lastFetchedCnpj.current === rawDigits) return;
    lastFetchedCnpj.current = rawDigits;
    setFetchingCnpj(true);
    const id = showLoading("Buscando dados do CNPJ...");
    try {
      const data = await tryApisForCnpj(rawDigits);
      // Only set number and complement from CNPJ response per requirement
      const number = data.numero || data.number || data.numero_endereco || data.numero || data.nro || "";
      const comp = data.complemento || data.complement || data.complemento_endereco || "";
      if (number) setNumero(String(number));
      if (comp) setComplemento(String(comp));

      // Try to extract CEP from the returned CNPJ data; if found, set CEP (masked) and trigger ViaCEP fetch
      const cepDigits = extractCepFromCnpjData(data);
      if (cepDigits && cepDigits.length === 8) {
        // Format as 00000-000
        const masked = `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}`;
        setCep(masked);
        // Trigger ViaCEP fetch to populate rua/bairro/cidade/uf
        // small timeout to ensure state updates are batched nicely
        setTimeout(() => fetchCepData(cepDigits), 50);
      }

      dismissToast(id as any);
      showSuccess("Número/complemento do CNPJ aplicados (se disponíveis)");
    } catch (err) {
      console.error("fetchCnpjData error", err);
      dismissToast(id as any);
      showError("Não foi possível obter dados para o CNPJ informado.");
      lastFetchedCnpj.current = null;
    } finally {
      setFetchingCnpj(false);
    }
  };

  // Auto-trigger fetch when CNPJ reaches 14 digits (debounced)
  useEffect(() => {
    const digits = (cnpj || "").replace(/\D/g, "");
    if (debounceCnpjRef.current) {
      window.clearTimeout(debounceCnpjRef.current);
      debounceCnpjRef.current = null;
    }
    if (digits.length === 14) {
      debounceCnpjRef.current = window.setTimeout(() => {
        fetchCnpjData(digits);
        debounceCnpjRef.current = null;
      }, 600);
    } else {
      if (digits.length === 0) {
        lastFetchedCnpj.current = null;
      }
    }
    return () => {
      if (debounceCnpjRef.current) {
        window.clearTimeout(debounceCnpjRef.current);
        debounceCnpjRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cnpj]);

  const handleManualCnpjLookup = () => {
    const digits = (cnpj || "").replace(/\D/g, "");
    if (digits.length !== 14) {
      showError("Informe um CNPJ válido (14 dígitos) para buscar");
      return;
    }
    fetchCnpjData(digits);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Solicitar Vistoria</h1>
      <p className="text-sm text-muted-foreground mb-6">Preencha os dados abaixo. Você pode gerar um DOCX preenchido a partir do template ou preparar o e-mail automaticamente.</p>

      <div className="space-y-4 bg-card p-6 rounded-lg shadow-sm">
        <div>
          <Label className="text-sm">Vendedor responsável</Label>
          <Input value={vendedor} onChange={(e) => setVendedor(e.target.value)} placeholder="Nome do vendedor" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="text-sm">CNPJ</Label>
            <div className="flex gap-2">
              <Input placeholder="00.000.000/0000-00" value={cnpj} onChange={handleCnpjChange} />
              <Button type="button" onClick={handleManualCnpjLookup} disabled={fetchingCnpj}>{fetchingCnpj ? "Buscando..." : "Buscar"}</Button>
            </div>
            <div className="text-sm text-muted-foreground">O sistema preencherá número, complemento e tentará obter o CEP (se disponível) a partir do CNPJ.</div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Empresa</Label>
            <Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Razão social da empresa" />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">E-mail da empresa</Label>
            <Input value={empresaEmail} onChange={(e) => setEmpresaEmail(e.target.value)} placeholder="email@empresa.com.br" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-sm">Contato responsável - Nome</Label>
            <Input value={contatoNome} onChange={(e) => setContatoNome(e.target.value)} placeholder="Nome do contato" />
          </div>

          <div>
            <Label className="text-sm">Contato responsável - Telefone</Label>
            <Input
              value={contatoTelefone}
              onChange={handleContatoTelefoneChange}
              onPaste={handlePhonePaste(setContatoTelefone)}
              placeholder="(00) 00000-0000"
              rows={1}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div className="md:col-span-2">
            <Label className="text-sm">CEP</Label>
            <div className="flex gap-2">
              <Input placeholder="00000-000" value={cep} onChange={handleCepChange} />
              <Button type="button" onClick={handleManualCepLookup}>Buscar</Button>
            </div>
          </div>

          <div className="md:col-span-4">
            <Label className="text-sm">Rua</Label>
            <Input value={rua} onChange={(e) => setRua(e.target.value)} placeholder="Logradouro / Rua" />
          </div>

          <div>
            <Label className="text-sm">Número</Label>
            <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Número" />
          </div>

          <div>
            <Label className="text-sm">Complemento</Label>
            <Input value={complemento} onChange={(e) => setComplemento(e.target.value)} placeholder="Complemento" />
          </div>

          <div>
            <Label className="text-sm">Bairro</Label>
            <Input value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Bairro" />
          </div>

          <div>
            <Label className="text-sm">Cidade</Label>
            <Input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Cidade" />
          </div>

          <div>
            <Label className="text-sm">UF</Label>
            <Input value={uf} onChange={(e) => setUf(e.target.value)} placeholder="UF" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-sm">Quantidade</Label>
            <Input value={quantidade} onChange={(e) => setQuantidade(e.target.value)} placeholder="Quantidade" />
          </div>
          <div>
            <Label className="text-sm">Produto</Label>
            <Input value={produto} onChange={(e) => setProduto(e.target.value)} placeholder="Descrição do produto/solicitação" />
          </div>
        </div>

        <div>
          <Label className="text-sm">Observações</Label>
          <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={4} placeholder="Observações adicionais" />
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex gap-2">
            <Button onClick={handleGenerateDocx} disabled={loadingDoc}>{loadingDoc ? "Gerando..." : "Gerar DOCX preenchido"}</Button>
            <Button variant="outline" onClick={handleCopyBody}>Copiar corpo do e-mail</Button>
            <Button variant="outline" onClick={handleOpenMailClient}>Abrir no cliente de e-mail</Button>
          </div>
          <div className="text-sm text-muted-foreground">Assunto: <span className="font-medium">{subject}</span></div>
        </div>

        <div>
          <Label className="text-sm">Pré-visualização do corpo do e-mail</Label>
          <Textarea value={buildEmailBody()} readOnly rows={12} />
        </div>
      </div>
    </div>
  );
}