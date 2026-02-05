"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { showSuccess, showError } from "@/utils/toast";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { saveAs } from "file-saver";

export default function SolicitarVistoria() {
  const [destinatario, setDestinatario] = useState("");
  const [cc, setCc] = useState("controladoria@limaoebrasa.com.br");
  const [vendedor, setVendedor] = useState("Paulo Sergio Junior");
  const [empresa, setEmpresa] = useState("VISEU 03 Bar e Restaurante Ltda");
  const [empresaEmail, setEmpresaEmail] = useState("controladoria@limaoebrasa.com.br");
  const [contatoNome, setContatoNome] = useState("Paulo Martinho");
  const [contatoTelefone, setContatoTelefone] = useState("11 96473-7685");
  const [endereco, setEndereco] = useState("Rua Guaipá, 1017\nVila Leopoldina\nSão Paulo – SP\nCEP: 05089-001");
  const [quantidade, setQuantidade] = useState("1");
  const [produto, setProduto] = useState("Kit iDFace PRO + Botoeira + Fechadura C90");
  const [observacoes, setObservacoes] = useState("Cliente ciente de que será necessária a execução de infraestrutura e acabamento.\nO local já possui uma fechadura modelo C90; verificar em vistoria se o cliente deseja realizar a troca ou permanecer com a existente antes da instalação do novo equipamento.");
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);

  const subject = `Solicitação de vistoria técnica presencial – ${empresa}`;

  const buildEmailBody = () => {
    return `Olá Evelem,\n\nPoderia, por gentileza, agendar uma vistoria técnica para atendimento à empresa ${empresa}, conforme informações abaixo.\n\nVendedor responsável:\n${vendedor}\n\nEmpresa:\n${empresa}\n\nE-mail:\n${empresaEmail}\n\nContato responsável:\n\nNome: ${contatoNome}\n\nTelefone: ${contatoTelefone}\n\nEndereço para vistoria:\n${endereco}\n\nNecessidade do cliente / Produto:\n\nQuantidade: ${quantidade}\n\nProduto: ${produto}\n\nObservações:\n\n${observacoes}\n\nAgradeço desde já o suporte e fico à disposição para qualquer esclarecimento adicional.\n\nAtenciosamente,\n\n${vendedor}`;
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
      const to = encodeURIComponent(destinatario);
      const ccEnc = encodeURIComponent(cc || "");
      const subjectEnc = encodeURIComponent(subject);
      const bodyEnc = encodeURIComponent(buildEmailBody());

      let mailto = `mailto:${to}?subject=${subjectEnc}&body=${bodyEnc}`;
      if (cc) mailto += `&cc=${ccEnc}`;

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
      saveAs(out, `Solicitacao_vistoria_${empresa.replace(/[^a-z0-9]/gi, "_")}.docx`);
      showSuccess("Documento DOCX gerado e baixado com sucesso.");
    } catch (err: any) {
      console.error(err);
      showError("Erro ao gerar o DOCX. Verifique se o template possui as tags corretas.");
    } finally {
      setLoadingDoc(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Solicitar Vistoria</h1>
      <p className="text-sm text-muted-foreground mb-6">Preencha os dados abaixo. Você pode gerar um DOCX preenchido a partir do template ou preparar o e-mail automaticamente.</p>

      <div className="space-y-4 bg-card p-6 rounded-lg shadow-sm">
        <div>
          <Label className="text-sm">Destinatário (Para)</Label>
          <Input value={destinatario} onChange={(e) => setDestinatario(e.target.value)} placeholder="email@exemplo.com" />
        </div>

        <div>
          <Label className="text-sm">CC</Label>
          <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="controle@empresa.com.br" />
        </div>

        <div>
          <Label className="text-sm">Vendedor responsável</Label>
          <Input value={vendedor} onChange={(e) => setVendedor(e.target.value)} />
        </div>

        <div>
          <Label className="text-sm">Empresa</Label>
          <Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
        </div>

        <div>
          <Label className="text-sm">E-mail da empresa</Label>
          <Input value={empresaEmail} onChange={(e) => setEmpresaEmail(e.target.value)} />
        </div>

        <div>
          <Label className="text-sm">Contato responsável - Nome</Label>
          <Input value={contatoNome} onChange={(e) => setContatoNome(e.target.value)} />
        </div>

        <div>
          <Label className="text-sm">Contato responsável - Telefone</Label>
          <Input value={contatoTelefone} onChange={(e) => setContatoTelefone(e.target.value)} />
        </div>

        <div>
          <Label className="text-sm">Endereço para vistoria</Label>
          <Textarea value={endereco} onChange={(e) => setEndereco(e.target.value)} rows={4} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-sm">Quantidade</Label>
            <Input value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
          </div>
          <div>
            <Label className="text-sm">Produto</Label>
            <Input value={produto} onChange={(e) => setProduto(e.target.value)} />
          </div>
        </div>

        <div>
          <Label className="text-sm">Observações</Label>
          <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={4} />
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
