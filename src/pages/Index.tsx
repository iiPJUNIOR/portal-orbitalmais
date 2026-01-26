"use client";

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ProposalWizard } from "@/components/ProposalWizard";
import { QuoteHistory } from "@/components/QuoteHistory";
import { generateProposalPPTX } from "@/services/proposalService";
import { toast } from "sonner";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { saveQuote } from "@/services/supabaseService";
import { getUserSettings } from "@/services/settingsService";
import { FileText, PlusCircle, History, Settings as SettingsIcon } from "lucide-react";

export default function Index() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"welcome" | "wizard" | "history">("welcome");
  const [sellerInfo, setSellerInfo] = useState({
    name: "",
    role: "",
    email: "",
    phone: "",
  });

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const s = await getUserSettings();
        if (s) {
          setSellerInfo({
            name: s.seller_name || "",
            role: s.seller_role || "",
            email: s.seller_email || "",
            phone: s.seller_phone || "",
          });
        }
      } catch (err) {
        console.warn("Falha ao carregar dados do vendedor", err);
      }
    };
    loadSettings();
  }, []);

  const handleWizardComplete = async (payload: any) => {
    const loadToastId = toast.loading(`Gerando proposta em PPTX...`);
    try {
      const proposalData = {
        ...payload,
        sellerName: sellerInfo.name,
        sellerRole: sellerInfo.role,
        sellerEmail: sellerInfo.email,
        sellerPhone: sellerInfo.phone,
      };
      
      const blob = await generateProposalPPTX(proposalData);

      // Salvar no Supabase
      await saveQuote(
        {
          cnpj: payload.cnpj,
          companyName: payload.companyName,
          contactName: payload.contactName,
          email: payload.email,
          phone: payload.phone,
          address: payload.address,
          proposalDate: payload.date,
          proposalNumber: payload.proposalNumber,
          priceModel: payload.priceModel,
          totalPrice: payload.totalPrice,
          status: "rascunho",
          observations: payload.observations || "",
          settings: payload,
        },
        payload.items.map((it: any) => ({
          sku: it.product.description,
          productDescription: it.product.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice || 0,
          priceModel: payload.priceModel,
        }))
      );

      // Formatação do nome do arquivo: Nome da empresa - Proposta Plano Premium Access v.XX_Mês-Ano
      const dateObj = new Date(payload.date + "T12:00:00");
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const year = dateObj.getFullYear();
      const fileName = `${payload.companyName} - Proposta Plano Premium Access v.${payload.version}_${month}-${year}.pptx`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Proposta PPTX gerada com sucesso!`, { id: loadToastId });
    } catch (err) {
      console.error(err);
      toast.error(`Erro ao gerar PPTX.`, { id: loadToastId });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <main className="flex-1 container mx-auto py-10 px-4">
        {step === "welcome" && (
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="text-center space-y-4">
              <h1 className="text-5xl font-black tracking-tight text-neutral-900">
                Gerador de Propostas <span className="text-neutral-900">Control iD</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Crie apresentações profissionais em PPTX seguindo o padrão oficial da Control iD em poucos minutos.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-10">
              <button 
                onClick={() => setStep("wizard")}
                className="group p-8 bg-white border-2 border-primary/20 hover:border-primary rounded-3xl text-left transition-all hover:shadow-xl space-y-4"
              >
                <div className="p-3 bg-primary/10 rounded-2xl w-fit group-hover:bg-primary group-hover:text-white transition-colors">
                  <PlusCircle className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Nova Proposta</h3>
                  <p className="text-sm text-muted-foreground">Inicie o assistente guiado para criar um novo orçamento.</p>
                </div>
              </button>

              <button 
                onClick={() => setStep("history")}
                className="group p-8 bg-white border-2 border-neutral-100 hover:border-neutral-900 rounded-3xl text-left transition-all hover:shadow-xl space-y-4"
              >
                <div className="p-3 bg-neutral-100 rounded-2xl w-fit group-hover:bg-neutral-900 group-hover:text-white transition-colors">
                  <History className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Histórico</h3>
                  <p className="text-sm text-muted-foreground">Veja e baixe novamente propostas geradas anteriormente.</p>
                </div>
              </button>

              <button 
                onClick={() => navigate("/settings")}
                className="group p-8 bg-white border-2 border-neutral-100 hover:border-neutral-900 rounded-3xl text-left transition-all hover:shadow-xl space-y-4"
              >
                <div className="p-3 bg-neutral-100 rounded-2xl w-fit group-hover:bg-neutral-900 group-hover:text-white transition-colors">
                  <SettingsIcon className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Configurações</h3>
                  <p className="text-sm text-muted-foreground">Ajuste seus dados de vendedor e bases de produtos.</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {step === "wizard" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <ProposalWizard 
              initialSellerData={sellerInfo}
              onComplete={handleWizardComplete}
              onCancel={() => setStep("welcome")}
            />
          </div>
        )}

        {step === "history" && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-bold">Histórico de Propostas</h2>
              <Button variant="outline" onClick={() => setStep("welcome")}>Voltar</Button>
            </div>
            <QuoteHistory onQuoteSelect={(q) => toast.info(`Orçamento selecionado: ${q.proposalNumber}`)} />
          </div>
        )}
      </main>

      <footer className="py-6 border-t bg-white">
        <MadeWithDyad />
      </footer>
    </div>
  );
}