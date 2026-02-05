"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { showSuccess, showError } from "@/utils/toast";

export default function SolicitarVistoria() {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [endereco, setEndereco] = useState("");
  const [dataPreferida, setDataPreferida] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nome || !telefone || !endereco) {
      showError("Por favor, preencha Nome, Telefone e Endereço.");
      return;
    }

    setLoading(true);
    try {
      // Aqui você pode integrar com Supabase ou qualquer API para persistir a solicitação.
      // Por enquanto apenas simulamos o envio.
      await new Promise((res) => setTimeout(res, 700));

      console.log("Solicitação de vistoria enviada", {
        nome,
        telefone,
        endereco,
        dataPreferida,
        observacoes,
      });

      showSuccess("Solicitação de vistoria enviada com sucesso!");

      // limpar formulário
      setNome("");
      setTelefone("");
      setEndereco("");
      setDataPreferida("");
      setObservacoes("");
    } catch (err) {
      console.error(err);
      showError("Erro ao enviar solicitação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Solicitar Vistoria</h1>
      <p className="text-sm text-muted-foreground mb-6">Preencha os dados abaixo para solicitar uma vistoria técnica. Entraremos em contato para confirmar a data e horário.</p>

      <form onSubmit={handleSubmit} className="space-y-4 bg-card p-6 rounded-lg shadow-sm">
        <div>
          <Label className="text-sm">Nome do solicitante</Label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
        </div>

        <div>
          <Label className="text-sm">Telefone</Label>
          <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(00) 0 0000-0000" />
        </div>

        <div>
          <Label className="text-sm">Endereço</Label>
          <Input value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número, bairro, cidade" />
        </div>

        <div>
          <Label className="text-sm">Data preferida</Label>
          <Input type="date" value={dataPreferida} onChange={(e) => setDataPreferida(e.target.value)} />
        </div>

        <div>
          <Label className="text-sm">Observações</Label>
          <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Informações adicionais, acesso, detalhes..." />
        </div>

        <div className="flex items-center justify-end">
          <Button type="submit" disabled={loading}>{loading ? "Enviando..." : "Enviar solicitação"}</Button>
        </div>
      </form>
    </div>
  );
}
