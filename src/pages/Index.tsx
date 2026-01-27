"use client";

import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ProposalWizard } from "@/components/ProposalWizard";
import { QuoteHistory } from "@/components/QuoteHistory";
import { QuoteDetails } from "@/components/QuoteDetails";
import { generateProposalPPTX } from "@/services/proposalService";
import { toast } from "sonner";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { saveQuote, getQuoteItems } from "@/services/supabaseService";
import { getUserSettings } from "@/services/settingsService";
import { FileText, PlusCircle, History, Settings as SettingsIcon, ArrowLeft } from "lucide-react";
import { Quote, QuoteItem } from "@/types/quote";
import { useSession } from "@/contexts/SessionProvider";

export default function Index() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSession();
  const [step, setStep] = useState<"welcome" | "wizard" | "history" | "details">("welcome");
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [sellerInfo, setSellerInfo] = useState({
    name: "",
    role: "",
    email: "",
    phone: "",
  });

  const PAULO_EMAIL = "paulo.sergio@controlid.com.br";

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

  // If opened via /history or ?view=history, show history by default (but controlled by permission check below)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const view = params.get("view");
    if (location.pathname === "/history" || view === "history") {
      setStep("history");
    }
    // don't include setStep in deps to avoid resetting user navigation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  // React to global navigation events emitted by the sidebar to ensure correct tab/view
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const path = (e as CustomEvent).detail?.path;
        if (!path) return;
        if (path === "/") {
          setStep("welcome");
        } else if (path === "/history") {
          setStep("history");
        } else if (path === "/wizard") {
          setStep("wizard");
        } else {
          // default fallback: show welcome when navigating within app root
          setStep("welcome");
        }
      } catch (err) {
        // ignore
      }
    };
    window.addEventListener("app:navigate", handler as EventListener);
    return () => window.removeEventListener("app:navigate", handler as EventListener);
  }, []);

  // Protect direct navigation to /history for users without access
  useEffect(() => {
    let mounted = true;

    async function ensureHistoryAllowed() {
      try {
        if (location.pathname !== "/history") return;

        // Superadmin bypass
        if (user?.email === PAULO_EMAIL) return;

        // Fetch settings to check can_view_history
        const s = await getUserSettings();
        if (!mounted) return;

        if (!s?.can_view_history) {
          toast.error("Acesso ao histórico restrito. Peça ao administrador para liberar.", { duration: 3000 });
          navigate("/", { replace: true });
          setStep("welcome");
        }
      } catch (err) {
        console.warn("history access check failed", err);
        // On error, be conservative: redirect home
        if (mounted) {
          toast.error("Acesso ao histórico restrito.", { duration: 2000 });
          navigate("/", { replace: true });
          setStep("welcome");
        }
      }
    }

    ensureHistoryAllowed();

    return () => {
      mounted = false;
    };
  }, [location.pathname, user, navigate]);

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

      // Salvar no Supabase (ou fallback local dentro do service)
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
          settings: payload, // Estado completo para regeneração futura
        },
        payload.items.map((it: any) => ({
          sku: it.product.part_number || it.product.description,
          productDescription: it.product.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice || 0,
          priceModel: payload.priceModel,
        }))
      );

      // Download do arquivo
      const dateObj = new Date(payload.date + "T12:00:00");
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const year = dateObj.getFullYear();
      const fileName = `${payload.companyName} - Proposta Plano Premium Access v.${payload.version || '1'}_${month}-${year}.pptx`;

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

  const handleSelectQuote = async (quote: Quote) => {
    setLoadingDetails(true);
    try {
      const items = await getQuoteItems(quote.id);
      setSelectedQuote(quote);
      setQuoteItems(items);
      setStep("details");
    } catch (err) {
      toast.error("Erro ao carregar detalhes do orçamento.");
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleRegenerateQuote = async () => {
    if (!selectedQuote || !selectedQuote.settings) {
      toast.error("Configurações originais não encontradas para este orçamento.");
      return;
    }

    const loadToastId = toast.loading("Regenerando arquivo PPTX...");
    try {
      // Usamos as configurações salvas no momento da criação original
      const blob = await generateProposalPPTX(selectedQuote.settings);
      
      const dateObj = new Date(selectedQuote.proposalDate);
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const year = dateObj.getFullYear();
      const fileName = `${selectedQuote.companyName} - Proposta Regenerada_${month}-${year}.pptx`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("PPTX regenerado com sucesso!", { id: loadToastId });
    } catch (err) {
      console.error(err);
      toast.error("Erro ao regenerar PPTX.", { id: loadToastId });
    }
  };

  // Novo: regenerar diretamente a partir de um item do histórico
  const handleRegenerateFromHistory = async (quote: Quote) => {
    if (!quote || !quote.settings) {
      toast.error("Dados da proposta ausentes. Não é possível regenerar.");
      return;
    }
    const loadToastId = toast.loading("Gerando proposta a partir do histórico...");
    try {
      const blob = await generateProposalPPTX(quote.settings);
      const dateObj = new Date(quote.proposalDate || Date.now());
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const year = dateObj.getFullYear();
      const fileName = `${quote.companyName || "proposta"} - Regenerada_${month}-${year}.pptx`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("PPTX gerado com sucesso a partir do histórico!", { id: loadToastId });
    } catch (err) {
      console.error(err);
      toast.error("Erro ao gerar proposta a partir do histórico.", { id: loadToastId });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 container mx-auto py-10 px-4">
        {step === "welcome" && (
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="text-center space-y-4">
              <h1 className="text-5xl font-black tracking-tight text-neutral-900 dark:text-white">
                Gerador de Propostas <span className="text-neutral-900 dark:text-white">Control iD</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Crie apresentações profissionais em PPTX seguindo o padrão oficial da Control iD em poucos minutos.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-10">
              <button 
                onClick={() => setStep("wizard")}
                className="group p-8 bg-card border-2 border-primary/20 hover:border-primary rounded-3xl text-left transition-all hover:shadow-xl space-y-4 shadow-sm"
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
                className="group p-8 bg-card border-2 border-neutral-100 dark:border-neutral-800 hover:border-neutral-900 dark:hover:border-white rounded-3xl text-left transition-all hover:shadow-xl space-y-4 shadow-sm"
              >
                <div className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-2xl w-fit group-hover:bg-neutral-900 dark:group-hover:bg-white dark:group-hover:text-neutral-900 group-hover:text-white transition-colors">
                  <History className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Histórico</h3>
                  <p className="text-sm text-muted-foreground">Veja e baixe novamente propostas geradas anteriormente.</p>
                </div>
              </button>

              <button 
                onClick={() => navigate("/settings")}
                className="group p-8 bg-card border-2 border-neutral-100 dark:border-neutral-800 hover:border-neutral-900 dark:hover:border-white rounded-3xl text-left transition-all hover:shadow-xl space-y-4 shadow-sm"
              >
                <div className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-2xl w-fit group-hover:bg-neutral-900 dark:group-hover:bg-white dark:group-hover:text-neutral-900 group-hover:text-white transition-colors">
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
            <QuoteHistory onQuoteSelect={handleSelectQuote} onRegenerateFromHistory={handleRegenerateFromHistory} />
          </div>
        )}

        {step === "details" && selectedQuote && (
          <div className="animate-in fade-in duration-500">
            <QuoteDetails 
              quote={selectedQuote} 
              items={quoteItems} 
              onBack={() => setStep("history")} 
              onRegenerate={handleRegenerateQuote}
            />
          </div>
        )}
      </main>

      <footer className="py-6 border-t bg-card">
        <MadeWithDyad />
      </footer>
    </div>
  );
}