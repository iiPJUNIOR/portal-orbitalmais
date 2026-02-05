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
import { FileText, PlusCircle, History as HistoryIcon, Settings as SettingsIcon, ArrowLeft, ShieldCheck } from "lucide-react";
import { Quote, QuoteItem } from "@/types/quote";
import { useSession } from "@/contexts/SessionProvider";
import DraftsPage from "@/pages/Drafts";

export default function Index() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSession();
  const [step, setStep] = useState<"welcome" | "wizard" | "history" | "details" | "drafts">("welcome");
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [sellerInfo, setSellerInfo] = useState({
    name: "",
    role: "",
    email: "",
    phone: "",
  });

  const [needsSellerProfile, setNeedsSellerProfile] = useState(false);
  const [canViewHistory, setCanViewHistory] = useState(false);
  const [canAccessSettings, setCanAccessSettings] = useState(false);

  const [editInitialData, setEditInitialData] = useState<any | null>(null);

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

          const missing = !(s.seller_name && String(s.seller_name).trim().length > 0 && s.seller_email && String(s.seller_email).trim().length > 0);
          setNeedsSellerProfile(Boolean(missing && user));

          setCanViewHistory(!!s?.can_view_history || user?.email === PAULO_EMAIL);
          setCanAccessSettings(!!s?.can_access_settings || user?.email === PAULO_EMAIL);
        } else {
          setNeedsSellerProfile(Boolean(user));
          setCanViewHistory(user?.email === PAULO_EMAIL);
          setCanAccessSettings(user?.email === PAULO_EMAIL);
        }
      } catch (err) {
        console.warn("Falha ao carregar dados do vendedor", err);
        setNeedsSellerProfile(Boolean(user));
        setCanViewHistory(user?.email === PAULO_EMAIL);
        setCanAccessSettings(user?.email === PAULO_EMAIL);
      }
    };
    loadSettings();
  }, [user]);

  // If opened via /history or ?view=history, show history by default (but access will be validated)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const view = params.get("view");
    if (location.pathname === "/history" || view === "history") {
      // only show if allowed; otherwise redirect to welcome
      (async () => {
        try {
          const s = await getUserSettings();
          const allowed = !!s?.can_view_history || user?.email === PAULO_EMAIL;
          if (allowed) setStep("history");
          else {
            toast.error("Acesso ao histórico restrito.");
            setStep("welcome");
            navigate("/", { replace: true });
          }
        } catch {
          setStep("welcome");
          navigate("/", { replace: true });
        }
      })();
    }
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
          // only allow if permitted
          (async () => {
            try {
              const s = await getUserSettings();
              const allowed = !!s?.can_view_history || user?.email === PAULO_EMAIL;
              if (allowed) setStep("history");
              else {
                toast.error("Acesso ao histórico restrito.");
                setStep("welcome");
                navigate("/", { replace: true });
              }
            } catch {
              setStep("welcome");
            }
          })();
        } else if (path === "/wizard") {
          setStep("wizard");
        } else if (path === "/drafts") {
          setStep("drafts");
        } else {
          setStep("welcome");
        }
      } catch (err) {
        // ignore
      }
    };
    window.addEventListener("app:navigate", handler as EventListener);
    return () => window.removeEventListener("app:navigate", handler as EventListener);
  }, [user, navigate]);

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
          sku: it.product.part_number || it.product.description,
          productDescription: it.product.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice || 0,
          priceModel: payload.priceModel,
        }))
      );

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
    } finally {
      // clear any edit state once wizard finishes
      setEditInitialData(null);
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

  const handleEditQuote = (quote: Quote) => {
    if (!quote || !quote.settings) {
      toast.error("Não há dados para editar nesta proposta.");
      return;
    }
    setEditInitialData(quote.settings);
    setStep("wizard");
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

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-10">
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

              {/* Drafts tile - visible to all users */}
              <button 
                onClick={() => setStep("drafts")}
                className="group p-8 bg-card border-2 border-neutral-100 dark:border-neutral-800 hover:border-neutral-900 dark:hover:border-white rounded-3xl text-left transition-all hover:shadow-xl space-y-4 shadow-sm"
              >
                <div className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-2xl w-fit group-hover:bg-neutral-900 dark:group-hover:bg-white dark:group-hover:text-neutral-900 group-hover:text-white transition-colors">
                  <FileText className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Rascunhos</h3>
                  <p className="text-sm text-muted-foreground">Gerencie rascunhos locais e sincronize para salvar no servidor.</p>
                </div>
              </button>

              <button 
                onClick={() => navigate("/settings")}
                className={`relative group p-8 bg-card border-2 border-neutral-100 dark:border-neutral-800 hover:border-neutral-900 dark:hover:border-white rounded-3xl text-left transition-all hover:shadow-xl space-y-4 shadow-sm ${needsSellerProfile ? "animate-pulse ring-2 ring-primary/40" : ""}`}
                aria-describedby={needsSellerProfile ? "settings-hint" : undefined}
              >
                <div className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-2xl w-fit group-hover:bg-neutral-900 dark:group-hover:bg-white dark:group-hover:text-neutral-900 group-hover:text-white transition-colors">
                  <SettingsIcon className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Configurações</h3>
                  <p className="text-sm text-muted-foreground">Ajuste seus dados de vendedor e bases de produtos.</p>
                </div>

                {needsSellerProfile && (
                  <div id="settings-hint" className="absolute top-3 right-3 bg-yellow-400 text-neutral-900 text-xs font-bold px-2 py-1 rounded shadow">
                    Completar perfil
                  </div>
                )}
              </button>

              <button
                onClick={() => navigate("/solicitar-vistoria")}
                className="group p-8 bg-card border-2 border-neutral-100 hover:border-primary rounded-3xl text-left transition-all hover:shadow-xl space-y-4 shadow-sm"
              >
                <div className="p-3 bg-primary/10 rounded-2xl w-fit group-hover:bg-primary group-hover:text-white transition-colors">
                  <ShieldCheck className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Solicitar Vistoria</h3>
                  <p className="text-sm text-muted-foreground">Agende uma vistoria técnica na sua instalação.</p>
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
              onCancel={() => (editInitialData ? setStep("details") : setStep("welcome"))}
              initialData={editInitialData ?? undefined}
              initialStep={1}
              draftId={selectedQuote?.id ?? undefined}
            />
          </div>
        )}

        {step === "drafts" && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-bold">Rascunhos</h2>
              <Button variant="outline" onClick={() => setStep("welcome")}>Voltar</Button>
            </div>
            <DraftsPage />
          </div>
        )}

        {step === "history" && canViewHistory && (
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
              onBack={() => setStep(canViewHistory ? "history" : "welcome")} 
              onRegenerate={handleRegenerateQuote}
              onEdit={() => handleEditQuote(selectedQuote)}
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