import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Settings from "./pages/Settings";
import TokenScanner from "./pages/TokenScanner";
import Login from "./pages/Login";
import { SessionProvider } from "@/contexts/SessionProvider";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import ThemeToggle from "@/components/ThemeToggle";

const queryClient = new QueryClient();

const AppContent = () => (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route 
      path="/*" 
      element={
        <div className="flex h-screen w-full bg-background overflow-hidden">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            {/* Header com altura fixa e borda que se conecta ao sidebar */}
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