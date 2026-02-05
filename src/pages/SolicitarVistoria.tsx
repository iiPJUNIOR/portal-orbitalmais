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
  // Removed destinatario and cc states as requested
  const [vendedor, setVendedor] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [empresaEmail, setEmpresaEmail] = useState("");
  const [empresaPhone, setEmpresaPhone] = useState("");
  const [contatoNome, setContatoNome] = useState("");
  const [contatoTelefone, setContatoTelefone] = useState("");
  const [endereco, setEndereco] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [produto, setProduto] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [loadingDoc, setLoadingDoc] = useState(false);

  // CNPJ related
  const [cnpj, setCnpj] = useState("");
  const [fetchingCnpj, setFetchingCnpj] = useState(false);
  const lastFetchedCnpj = useRef<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  // On mount: try to prefill seller info from user settings (if present).
  useEffect(() => {
    (async () => {
      try {
        const s = await getUserSettings();
        if (!s) return;
        // Only set fields when they're currently empty so the user can override later
        if (!vendedor && s.seller_name) setVendedor(s.seller_name);
        // NOTE: empresaEmail is client email and should NOT be prefilled with seller email
        // NOTE: contatoTelefone is client contact and should NOT be prefilled with seller phone
      } catch (err) {
        // non-blocking; keep form blank if fetch fails
        console.warn("SolicitarVistoria: falha ao obter seller settings", err);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, []);

  const subject = empresa ? `Solicitação de vistoria técnica presencial – ${empresa}` : "Solicitação de vistoria técnica presencial";

  const buildEmailBody = () => {
    return `Olá Evelem,\n\nPoderia, por gentileza, agendar uma vistoria técnica para atendimento à empresa ${empresa || "NOME_DA_EMPRESA"}, conforme informações abaixo.\n\nVendedor responsável:\n${vendedor || "NOME_DO_VENDEDOR"}\n\nEmpresa:\n${empresa || "NOME_DA_EMPRESA"}\n\nCNPJ:\n${cnpj || ""}\n\nTelefone da empresa:\n${empresaPhone || ""}\n\nE-mail da empresa:\n${empresaEmail || ""}\n\nContato responsável:\n\nNome: ${contatoNome || ""}\n\nTelefone: ${contatoTelefone || ""}\n\nEndereço para vistoria:\n${endereco || ""}\n\nNecessidade do cliente / Produto:\n\nQuantidade: ${quantidade || ""}\n\nProduto: ${produto || ""}\n\nObservações:\n\n${observacoes || ""}\n\nAgradeço desde já o suporte e fico à disposição para qualquer esclarecimento adicional.\n\nAtenciosamente,\n\n${vendedor || ""}`;
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

  // Open mail client without prefilled 'to' or 'cc' per request
  const handleOpenMailClient = () => {
    try {
      const subjectEnc = encodeURIComponent(subject);
      const bodyEnc = encodeURIComponent(buildEmailBody());

      // No recipient and no CC included here
      const mailto = `mailto:?subject=${subjectEnc}&body=${bodyEnc}`;

      // open mail client
      window.location.href = mailto;
    } catch (err) {
      console.error(err);
      showError("Falha ao abrir cliente de e-mail.");
    }
  };

  const handleGenerateDocx = async () => {
    setLoadingDoc(true);
    try {
      // Fetch the template from public folder
      const templatePath = encodeURI("/Solicitação de vistoria.docx");
      const res = await fetch(templatePath);
      if (!res.ok) throw new Error("Não foi possível baixar o template DOCX.");
      const arrayBuffer = await res.arrayBuffer();

      const zip = new PizZip(arrayBuffer);
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

      // map template variables - ensure your DOCX template has matching tags, for example: {{vendedor}}, {{empresa}}, etc.
      const data = {
        vendedor,
        empresa,
        cnpj,
        empresa_phone: empresaPhone,
        empresa_email: empresaEmail,
        contato_nome: contatoNome,
        contato_telefone: contatoTelefone,
        endereco,
        quantidade,
        produto,
        observacoes,
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

  // Phone formatting helper for Brazilian numbers (works on type and paste)
  function formatPhoneDigits(digits: string) {
    const d = digits.replace(/\D/g, "").slice(0, 11); // max 11
    if (d.length === 0) return "";
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    // 11 digits (9xxxx-xxxx)
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

  // Paste handlers to normalize pasted phone numbers
  const handlePhonePaste = (setter: (val: string) => void) => async (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").trim();
    const digits = text.replace(/\D/g, "");
    setter(formatPhoneDigits(digits));
  };

  // Build address string from API response
  function buildAddressFromApi(data: any) {
    const parts: string[] = [];
    const street = data.logradouro || data.street || data.address || data.rua || "";
    const number = data.numero || data.number || data.numero_endereco || "";
    const complement = data.complemento || data.complement || "";
    const neighborhood = data.bairro || data.neighborhood || "";
    const city = data.municipio || data.municipio_nome || data.city || data.nome_cidade || "";
    const uf = data.uf || data.estado || data.state || "";
    const cep = data.cep || data.CEP || "";

    if (street) {
      const s = `${street}${number ? `, ${number}` : ""}${complement ? ` ${complement}` : ""}`;
      parts.push(s);
    }
    if (neighborhood) parts.push(neighborhood);
    if (city || uf) parts.push([city, uf].filter(Boolean).join("/"));
    if (cep) parts.push(cep);

    return parts.filter(Boolean).join(" - ");
  }

  // Try multiple APIs in order until one returns usable data
  const tryApisForCnpj = async (rawDigits: string) => {
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
        // basic validation: must have some company name or address
        const hasName = Boolean(
          data.razao_social ||
            data.nome ||
            data.nome_fantasia ||
            data.fantasia ||
            data.company ||
            data.nome,
        );
        const hasAny = hasName || Boolean(data.logradouro || data.address || data.street);
        if (hasAny) return data;
      } catch (err) {
        // continue to next
        console.debug("CNPJ API failed:", url, err);
      }
    }

    throw new Error("Nenhuma API retornou dados válidos para o CNPJ");
  };

  // Fetch CNPJ data and populate fields with fallback support
  const fetchCnpjData = async (rawDigits: string) => {
    if (!rawDigits || rawDigits.length !== 14) return;
    if (lastFetchedCnpj.current === rawDigits) return;

    lastFetchedCnpj.current = rawDigits;
    setFetchingCnpj(true);
    const id = showLoading("Buscando dados do CNPJ...");

    try {
      const data = await tryApisForCnpj(rawDigits);

      const companyName = data.razao_social || data.nome || data.nome_fantasia || data.fantasia || data.company || "";
      const email = data.email || data.e_mail || data.contato_email || data.contato || "";
      const phone = data.telefone || data.telefones || data.ddd_telefone || data.telefone_principal || data.phone || "";
      const address = buildAddressFromApi(data);

      if (companyName) setEmpresa(companyName);
      if (email) setEmpresaEmail(email);
      if (phone) {
        // format phone before setting
        const digits = String(phone || "").replace(/\D/g, "");
        setEmpresaPhone(formatPhoneDigits(digits));
      }
      if (address) setEndereco(address);

      dismissToast(id as any);
      showSuccess("Dados do CNPJ preenchidos automaticamente");
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

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (digits.length === 14) {
      debounceRef.current = window.setTimeout(() => {
        fetchCnpjData(digits);
        debounceRef.current = null;
      }, 600);
    } else {
      if (digits.length === 0) {
        lastFetchedCnpj.current = null;
      }
    }

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [cnpj]);

  const handleManualLookup = () => {
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
              <Button type="button" onClick={handleManualLookup} disabled={fetchingCnpj}>{fetchingCnpj ? "Buscando..." : "Buscar"}</Button>
            </div>
            <div className="text-sm text-muted-foreground">Ao digitar o CNPJ completo o sistema tentará preencher automaticamente os dados.</div>
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
            <Label className="text-sm">Telefone da empresa</Label>
            <Input
              value={empresaPhone}
              onChange={handleEmpresaPhoneChange}
              onPaste={handlePhonePaste(setEmpresaPhone)}
              placeholder="(00) 00000-0000"
            />
          </div>

          <div>
            <Label className="text-sm">Contato responsável - Nome</Label>
            <Input value={contatoNome} onChange={(e) => setContatoNome(e.target.value)} placeholder="Nome do contato" />
          </div>
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

        <div>
          <Label className="text-sm">Endereço para vistoria</Label>
          <Textarea value={endereco} onChange={(e) => setEndereco(e.target.value)} rows={4} placeholder="Rua, número, bairro, cidade, CEP" />
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