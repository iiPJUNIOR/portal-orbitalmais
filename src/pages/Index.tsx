"use client";

import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ProposalWizard } from "@/components/ProposalWizard";
import { ProposalTypePicker } from "@/components/ProposalTypePicker";
import { QualificationWizard } from "@/components/QualificationWizard";
import { ServiceWizard } from "@/components/ServiceWizard";
import { QuoteHistory } from "@/components/QuoteHistory";
import { QuoteDetails } from "@/components/QuoteDetails";
import { generateProposalDOCX, generateServiceDOCX } from "@/services/proposalService";
import { toast } from "sonner";
import { saveAs } from "file-saver";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { saveQuote, getQuoteItems } from "@/services/supabaseService";
import { getUserSettings } from "@/services/settingsService";
import { FileText, PlusCircle, History as HistoryIcon, Settings as SettingsIcon, ArrowLeft } from "lucide-react";
import { Quote, QuoteItem } from "@/types/quote";
import { useSession } from "@/contexts/SessionProvider";
import DraftsPage from "@/pages/Drafts";

export default function Index() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSession();
  const [step, setStep] = useState<"welcome" | "proposal-type" | "wizard" | "qualification" | "service-wizard" | "history" | "details" | "drafts">("welcome");
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

          setCanViewHistory(true);
          setCanAccessSettings(true);
        } else {
          setNeedsSellerProfile(Boolean(user));
          setCanViewHistory(true);
          setCanAccessSettings(true);
        }
      } catch (err) {
        console.warn("Falha ao carregar dados do vendedor", err);
        setNeedsSellerProfile(Boolean(user));
        setCanViewHistory(true);
        setCanAccessSettings(true);
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
          const allowed = true;
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
              const allowed = true;
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
    const loadToastId = toast.loading(`Gerando proposta em DOCX...`);
    try {
      const proposalData = {
        ...payload,
        sellerName: sellerInfo.name,
        sellerRole: sellerInfo.role,
        sellerEmail: sellerInfo.email,
        sellerPhone: sellerInfo.phone,
      };
      
      const blob = await generateProposalDOCX(proposalData);

      const saveResult = await saveQuote(
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
          status: "enviada",
          observations: payload.observations || "",
          settings: payload,
        },
        payload.items.map((it: any) => ({
          sku: it.product.part_number || it.product.description,
          productDescription: it.bonificado
            ? `${it.product.description} (Bonificado)`
            : it.product.description,
          quantity: it.quantity,
          unitPrice: it.bonificado ? 0 : (it.unitPrice || 0),
          priceModel: payload.priceModel,
          bonificado: !!it.bonificado,
        }))
      );

      const safeProposalNumber = String(payload.proposalNumber || "Orçamento").replace(/[\/\\:*?"<>|]/g, "_");
      const fileName = `${safeProposalNumber}.docx`;
      saveAs(blob, fileName);

      if (saveResult.isRemote) {
        toast.success(`Proposta DOCX gerada com sucesso!`, { id: loadToastId });
      } else {
        const errMsg = saveResult.error?.message || "Erro ao salvar na base remota.";
        toast.error(`Proposta gerada, mas NÃO foi salva no histórico: ${errMsg}`, { 
          id: loadToastId,
          duration: 6000
        });
      }
    } catch (err) {
      console.error(err);
      toast.error(`Erro ao gerar DOCX.`, { id: loadToastId });
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

    const loadToastId = toast.loading("Regenerando arquivo DOCX...");
    try {
      const isService = selectedQuote.settings?.proposalType === "service";
      const blob = isService 
        ? await generateServiceDOCX(selectedQuote.settings)
        : await generateProposalDOCX(selectedQuote.settings);
      
      const safeProposalNumber = String(selectedQuote.proposalNumber || selectedQuote.settings?.proposalNumber || "Orçamento").replace(/[\/\\:*?"<>|]/g, "_");
      const fileName = `${safeProposalNumber}.docx`;
      saveAs(blob, fileName);

      toast.success("DOCX regenerado com sucesso!", { id: loadToastId });
    } catch (err) {
      console.error(err);
      toast.error("Erro ao regenerar DOCX.", { id: loadToastId });
    }
  };

  const handleRegenerateFromHistory = async (quote: Quote) => {
    if (!quote || !quote.settings) {
      toast.error("Dados da proposta ausentes. Não é possível regenerar.");
      return;
    }
    const loadToastId = toast.loading("Gerando proposta a partir do histórico...");
    try {
      const isService = quote.settings?.proposalType === "service";
      const blob = isService 
        ? await generateServiceDOCX(quote.settings)
        : await generateProposalDOCX(quote.settings);
      const safeProposalNumber = String(quote.proposalNumber || quote.settings?.proposalNumber || "Orçamento").replace(/[\/\\:*?"<>|]/g, "_");
      const fileName = `${safeProposalNumber}.docx`;
      saveAs(blob, fileName);

      toast.success("DOCX gerado com sucesso a partir do histórico!", { id: loadToastId });
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
    if (quote.settings.proposalType === "service") {
      setStep("service-wizard");
    } else {
      setStep("wizard");
    }
  };

  return (
    <div className="min-h-full flex flex-col">
      <main className="flex-1 container mx-auto py-10 px-4">
        {step === "welcome" && (
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="text-center space-y-4">
              <h1 className="text-5xl font-black tracking-tight text-neutral-900 dark:text-white">
                Gerador de Propostas <span className="text-neutral-900 dark:text-white">Orbital Mais</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Crie apresentações profissionais e propostas em poucos minutos para seus clientes.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-10">
              <button 
                id="btn-nova-proposta"
                onClick={() => setStep("proposal-type")}
                className="group p-8 bg-card border-2 border-primary/20 hover:border-primary rounded-3xl text-left transition-all hover:shadow-xl space-y-4 shadow-sm"
              >
                <div className="p-3 bg-primary/10 rounded-2xl w-fit group-hover:bg-primary group-hover:text-white transition-colors">
                  <PlusCircle className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Nova Proposta</h3>
                  <p className="text-sm text-muted-foreground">Proposta de serviço ou qualificação.</p>
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
            </div>
          </div>
        )}

        {step === "proposal-type" && (
          <ProposalTypePicker
            onSelectService={() => setStep("service-wizard")}
            onSelectQualification={() => setStep("wizard")}
            onBack={() => setStep("welcome")}
          />
        )}

        {step === "wizard" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <ProposalWizard 
              initialSellerData={sellerInfo}
              onComplete={handleWizardComplete}
              onCancel={() => (editInitialData ? setStep("details") : setStep("proposal-type"))}
              initialData={editInitialData ?? undefined}
              initialStep={1}
              draftId={selectedQuote?.id ?? undefined}
            />
          </div>
        )}

        {step === "service-wizard" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <ServiceWizard
              onCancel={() => (editInitialData ? setStep("details") : setStep("proposal-type"))}
              initialData={editInitialData ?? undefined}
              draftId={selectedQuote?.id ?? undefined}
              onComplete={() => {
                setEditInitialData(null);
                setSelectedQuote(null);
              }}
            />
          </div>
        )}

        {step === "qualification" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex justify-center">
            <QualificationWizard onCancel={() => setStep("proposal-type")} />
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
            <QuoteHistory 
              onQuoteSelect={handleSelectQuote} 
              onRegenerateFromHistory={handleRegenerateFromHistory} 
            />
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
    </div>
  );
}
