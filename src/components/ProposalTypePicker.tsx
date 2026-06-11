"use client";

import React from "react";
import { ArrowLeft, ClipboardList, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProposalTypePickerProps {
  onSelectService: () => void;
  onSelectQualification: () => void;
  onBack: () => void;
}

export function ProposalTypePicker({
  onSelectService,
  onSelectQualification,
  onBack,
}: ProposalTypePickerProps) {
  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="rounded-xl -ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
      </div>

      <div className="text-center space-y-3">
        <h1 className="text-4xl font-black tracking-tight">
          Nova Proposta
        </h1>
        <p className="text-muted-foreground text-lg max-w-md mx-auto">
          Escolha o tipo de proposta que deseja criar para o seu cliente.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
        {/* Proposta de Qualificação */}
        <button
          id="btn-proposal-qualification"
          onClick={onSelectQualification}
          className="group relative p-8 bg-card border-2 border-neutral-200 dark:border-neutral-700 hover:border-[#f47321] rounded-3xl text-left transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 space-y-5 shadow-md overflow-hidden"
        >
          {/* Gradient glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-3xl" />

          <div className="relative">
            <div className="p-4 bg-orange-100 dark:bg-orange-500/15 rounded-2xl w-fit group-hover:bg-[#f47321] transition-colors duration-300">
              <ClipboardList className="h-10 w-10 text-[#f47321] group-hover:text-white transition-colors duration-300" />
            </div>
          </div>

          <div className="relative space-y-2">
            <h3 className="text-2xl font-black">Proposta de Qualificação</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Assistente completo para criar orçamentos com seleção de produtos,
              precificação e geração de documento em DOCX.
            </p>
          </div>

          <div className="relative flex items-center gap-2 pt-2">
            <span className="text-xs font-bold uppercase tracking-widest text-[#f47321] bg-orange-100 dark:bg-orange-500/15 px-3 py-1 rounded-full">
              Gera DOCX
            </span>
          </div>
        </button>

        {/* Proposta de Serviço */}
        <button
          id="btn-proposal-service"
          onClick={onSelectService}
          className="group relative p-8 bg-card border-2 border-primary/20 hover:border-primary rounded-3xl text-left transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 space-y-5 shadow-md overflow-hidden"
        >
          {/* Gradient glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-3xl" />

          <div className="relative">
            <div className="p-4 bg-primary/10 rounded-2xl w-fit group-hover:bg-primary transition-colors duration-300">
              <Presentation className="h-10 w-10 text-primary group-hover:text-white transition-colors duration-300" />
            </div>
          </div>

          <div className="relative space-y-2">
            <h3 className="text-2xl font-black">Proposta de Serviço</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Gere uma proposta de serviço com novos passos e telas para detalhamento técnico e comercial.
            </p>
          </div>

          <div className="relative flex items-center gap-2 pt-2">
            <span className="text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-3 py-1 rounded-full">
              Gera DOCX
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}
