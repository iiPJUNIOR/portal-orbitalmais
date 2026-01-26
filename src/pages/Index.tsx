"use client";

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ProposalWizard } from "@/components/ProposalWizard";
import { QuoteHistory } from "@/components/QuoteHistory";
import { generateProposalPPTX, generateProposalPDF } from "@/services/proposalService";
import { toast } from "sonner";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { saveQuote } from "@/services/supabaseService";
import { getUserSettings } from "@/services/settingsService";
import { PlusCircle, History, Settings as SettingsIcon } from "lucide-react";

export default function Index() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"welcome" | "wizard" | "history">("welcome");
  const [sellerInfo, setSellerInfo] = useState({ name: "", role: "", email: "", phone: "" });

  useEffect(() => {
    getUserSettings().then(s => {
      if (s) setSellerInfo({ name: s.seller_name || "", role: s.seller_role || "", email: s.seller_email || "", phone: s.seller_phone || "" });
    });
  }, []);

  const handleWizardComplete = async (payload: any, type: 'pptx' | 'pdf') => {
    const loadToastId = toast.loading(`Gerando proposta ${type.toUpperCase()}...`);
    try {
      const data = { ...payload, ...sellerInfo };
      const blob = type === 'pptx' ? await generateProposalPPTX(data) : await generateProposalPDF(data);
      
      const fileName = `${payload.companyName} - Proposta.${type}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("Sucesso!", { id: loadToastId });
    } catch (err) {
      toast.error("Erro ao gerar arquivo.", { id: loadToastId });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col p-4">
      {step === "welcome" && (
        <div className="max-w-4xl mx-auto text-center space-y-10 pt-20">
          <h1 className="text-5xl font-black">Gerador de Propostas</h1>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Button className="h-40 rounded-3xl text-xl font-bold flex flex-col gap-4" onClick={() => setStep("wizard")}><PlusCircle className="h-10 w-10" /> Nova Proposta</Button>
            <Button variant="outline" className="h-40 rounded-3xl text-xl font-bold flex flex-col gap-4" onClick={() => setStep("history")}><History className="h-10 w-10" /> Histórico</Button>
            <Button variant="ghost" className="h-40 rounded-3xl text-xl font-bold flex flex-col gap-4" onClick={() => navigate("/settings")}><SettingsIcon className="h-10 w-10" /> Configurações</Button>
          </div>
        </div>
      )}
      {step === "wizard" && <ProposalWizard initialSellerData={sellerInfo} onComplete={handleWizardComplete} onCancel={() => setStep("welcome")} />}
      {step === "history" && <QuoteHistory onQuoteSelect={() => {}} />}
    </div>
  );
}