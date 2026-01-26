import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import React, { useEffect } from "react";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Settings from "./pages/Settings";
import TokenScanner from "./pages/TokenScanner";
import Login from "./pages/Login";
import { SessionProvider, useSession } from "@/contexts/SessionProvider";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import ThemeToggle from "@/components/ThemeToggle";
import { getUserSettings } from "@/services/settingsService";

const queryClient = new QueryClient();

const AppContent = () => {
  const { user } = useSession();

  // Aplica o tamanho de fonte global com base nas configurações
  useEffect(() => {
    const applyFontSize = async () => {
      try {
        const s = await getUserSettings();
        const size = s?.font_size || "medium";
        const html = document.documentElement;
        
        // Remove classes de fonte existentes
        html.classList.remove("font-small", "font-medium", "font-large", "font-extra-large");
        // Adiciona a nova
        html.classList.add(`font-${size}`);
      } catch (err) {
        console.warn("Falha ao aplicar tamanho de fonte", err);
      }
    };

    if (user) {
      applyFontSize();
    }

    // Ouve mudanças de configurações
    window.addEventListener("user_settings_changed", applyFontSize);
    return () => window.removeEventListener("user_settings_changed", applyFontSize);
  }, [user]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route 
        path="/*" 
        element={
          <div className="flex h-screen w-full bg-background overflow-hidden">
            <AppSidebar />
            <div className="flex-1 flex flex-col min-w-0">
              <header className="h-14 flex items-center px-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
                <SidebarTrigger className="-ml-1" />
                <div className="h-4 w-[1px] bg-border mx-4" />
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80">Painel Administrativo</span>
                <div className="ml-auto flex items-center gap-4">
                  <ThemeToggle />
                </div>
              </header>
              
              <main className="flex-1 overflow-auto bg-muted/20 dark:bg-background">
                <div className="min-h-full">
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/token-scan" element={<TokenScanner />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </div>
              </main>
            </div>
          </div>
        } 
      />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SessionProvider>
          <SidebarProvider>
            <AppContent />
          </SidebarProvider>
        </SessionProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;