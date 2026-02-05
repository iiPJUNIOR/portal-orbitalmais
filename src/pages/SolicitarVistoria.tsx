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

  // Helper: produce a nicely formatted address for email / docx
  function formatAddressNice(raw: string) {
    if (!raw) return "";

    // Normalize whitespace and common separators
    let s = String(raw).trim().replace(/\s+/g, " ");
    // Replace various separators with comma to help splitting
    s = s.replace(/\s*-\s*/g, ", ").replace(/\s*\/\s*/g, ", ").replace(/\s*;\s*/g, ", ");

    // Extract CEP if present (xxxxx-xxx or xxxxxxxx)
    let cep = "";
    const cepMatch = s.match(/(\d{5}-\d{3}|\d{8})/);
    if (cepMatch) {
      cep = cepMatch[1];
      s = s.replace(cepMatch[0], "").replace(/\s*,\s*,/g, ",").trim();
    }

    // Try to extract city and UF patterns at the end like "Cidade - UF" or "Cidade, UF" or "Cidade/UF"
    let city = "";
    let uf = "";
    const cityUfMatch = s.match(/,\s*([^,]+?)\s*[, ]+\s*([A-Za-z]{2})$/);
    if (cityUfMatch) {
      city = cityUfMatch[1].trim();
      uf = cityUfMatch[2].trim().toUpperCase();
      s = s.replace(cityUfMatch[0], "").trim();
    } else {
      // alternative pattern: "Cidade - UF"
      const altMatch = s.match(/([^,-]+?)\s*[-\/]\s*([A-Za-z]{2})$/);
      if (altMatch) {
        city = altMatch[1].trim();
        uf = altMatch[2].trim().toUpperCase();
        s = s.replace(altMatch[0], "").trim();
      }
    }

    // Split into parts by commas and trim
    const parts = s.split(",").map(p => p.trim()).filter(Boolean);

    // Identify street line (first part that contains letters) and try to parse type/name/number
    const streetTypes = [
      "rua", "r\\.?","avenida", "av\\.?","alameda","travessa","tv\\.?","trav\\.?","praça","praca","rodovia","estrada","estr\\.?","largo"
    ];
    const streetTypeRegex = new RegExp(`^(${streetTypes.join("|")})\\b`, "i");

    let streetLine = "";
    let number = "";
    let complement = "";
    let neighborhood = "";

    // If first part looks like street, parse it; otherwise try to find a part that looks like street
    let candidateIndex = -1;
    for (let i = 0; i < parts.length; i++) {
      if (streetTypeRegex.test(parts[i].toLowerCase()) || /\d+/.test(parts[i])) {
        candidateIndex = i;
        break;
      }
    }
    if (candidateIndex === -1 && parts.length > 0) candidateIndex = 0;

    if (candidateIndex !== -1) {
      const cand = parts[candidateIndex];
      // Try to extract type (rua/avenida/etc), name and number
      const m = cand.match(/^((?:(?:[Rr]ua|R\.|[Aa]venida|Av\.?|[Aa]lameda|[Tt]ravessa|[Tt]v\.?|[Pp]raça|[Pp]raca|[Rr]odovia|[Ee]strada|[Ll]argo)\b)[\s.:,-]*)?(.*)$/);
      let typePart = "";
      let rest = cand;
      if (m) {
        typePart = (m[1] || "").trim();
        rest = (m[2] || "").trim();
      }

      // Now try to pull number from rest (e.g., "General Osório 123 Apto 12")
      const numMatch = rest.match(/(.*?)\b(\d{1,5}[A-Za-z\-]?)\b(.*)$/);
      if (numMatch) {
        const namePart = numMatch[1].trim();
        number = numMatch[2].trim();
        const afterNum = numMatch[3].trim();
        streetLine = `${typePart ? capitalize(typePart) + " " : ""}${capitalizeWords(namePart)}`;
        if (number) streetLine = `${streetLine}, ${number}`;
        if (afterNum) complement = capitalizeWords(afterNum);
      } else {
        // No explicit number found
        streetLine = `${typePart ? capitalize(typePart) + " " : ""}${capitalizeWords(rest)}`;
      }

      // Neighborhood may be next part (if exists)
      if (parts.length > candidateIndex + 1) {
        // prefer parts that are short and not city/uf
        const next = parts[candidateIndex + 1];
        if (next && next.length < 40 && !/^\d{1,5}/.test(next) && !/^[A-Za-z\s]+,\s*[A-Za-z]{2}$/.test(next)) {
          neighborhood = capitalizeWords(next);
        }
      }

      // Complement may also be in following parts (contains apt/andar/bloco)
      for (let j = candidateIndex + 1; j < parts.length; j++) {
        const p = parts[j];
        if (/(apto|apto\.|apartamento|bloco|sala|andar|complemento|complemento:|cj|conjunto)/i.test(p)) {
          complement = complement ? `${complement} • ${capitalizeWords(p)}` : capitalizeWords(p);
        } else if (!neighborhood) {
          // small heuristic: if short and doesn't look like city, use as neighborhood
          if (p.length < 40 && !/^[A-Za-z\s]+,\s*[A-Za-z]{2}$/.test(p)) {
            neighborhood = capitalizeWords(p);
          } else {
            // otherwise append to complement
            complement = complement ? `${complement} • ${capitalizeWords(p)}` : capitalizeWords(p);
          }
        } else {
          // append to complement
          complement = complement ? `${complement} • ${capitalizeWords(p)}` : capitalizeWords(p);
        }
      }
    }

    // If we still have no streetLine but parts length > 0, use first part as streetLine
    if (!streetLine && parts.length > 0) {
      streetLine = capitalizeWords(parts[0]);
      if (parts.length > 1) complement = capitalizeWords(parts.slice(1).join(", "));
    }

    // Build pretty multiline output
    const lines: string[] = [];
    if (streetLine) lines.push(streetLine);
    if (complement) lines.push(complement);
    if (neighborhood) lines.push(neighborhood);

    const cityUf = [city, uf].filter(Boolean).join(city && uf ? " / " : "");
    if (cityUf) lines.push(cityUf);
    if (cep) lines.push(cep);

    // If nothing useful was extracted, fall back to the raw input
    if (lines.length === 0) return capitalizeWords(raw);

    return lines.join("\n");
  }

  // small helpers
  function capitalize(str: string) {
    if (!str) return "";
    const s = str.replace(/\.$/, "");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function capitalizeWords(input: string) {
    return input
      .split(/\s+/)
      .map((w) => {
        if (w.length === 0) return "";
        // keep case for common abbreviations like 'R.' or 'Av.'
        if (/^[A-Za-z]\.$/.test(w)) return w.toUpperCase();
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      })
      .join(" ")
      .replace(/\s+,/g, ",")
      .trim();
  }

  const buildEmailBody = () => {
    const lines: string[] = [];

    lines.push(`Olá Evelem,\n`);
    lines.push(`Poderia, por gentileza, agendar uma vistoria técnica para atendimento à empresa ${empresa || "NOME_DA_EMPRESA"}, conforme informações abaixo.\n`);

    // Vendedor
    if (vendedor) {
      lines.push(`Vendedor responsável:\n${vendedor}\n`);
    }

    // Empresa block (include only fields that exist)
    if (empresa || cnpj || empresaPhone || empresaEmail) {
      lines.push(`Empresa:`);
      if (empresa) lines.push(`${empresa}`);
      if (cnpj) lines.push(`CNPJ: ${cnpj}`);
      if (empresaPhone) lines.push(`Telefone: ${empresaPhone}`);
      if (empresaEmail) lines.push(`E-mail: ${empresaEmail}`);
      lines.push(""); // empty line
    }

    // Contato responsável block — show only if at least one exists
    if (contatoNome || contatoTelefone) {
      lines.push(`Contato responsável:`);
      if (contatoNome) lines.push(`Nome: ${contatoNome}`);
      if (contatoTelefone) lines.push(`Telefone: ${contatoTelefone}`);
      lines.push("");
    }

    // Endereço bem arrumadinho
    if (endereco) {
      const pretty = formatAddressNice(endereco);
      lines.push(`Endereço para vistoria:`);
      lines.push(pretty);
      lines.push("");
    }

    // Produto e quantidade (quantidade vem depois do produto)
    if (produto) {
      lines.push(`Produto:\n${produto}`);
      if (quantidade) {
        lines.push(`Quantidade: ${quantidade}`);
      }
      lines.push("");
    } else if (quantidade) {
      // If product missing but quantity present, still show quantity
      lines.push(`Quantidade: ${quantidade}`);
      lines.push("");
    }

    // Observações — only show when provided (non-empty after trimming)
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

      // Prepare a nicely formatted address for the DOCX as well
      const prettyAddress = formatAddressNice(endereco);

      // map template variables - ensure your DOCX template has matching tags, for example: {{vendedor}}, {{empresa}}, etc.
      const data = {
        vendedor,
        empresa,
        cnpj,
        empresa_phone: empresaPhone,
        empresa_email: empresaEmail,
        contato_nome: contatoNome,
        contato_telefone: contatoTelefone,
        endereco: prettyAddress,
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