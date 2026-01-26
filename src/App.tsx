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
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <main className="flex-1 overflow-auto bg-gray-50">
            <div className="p-4 flex items-center border-b bg-white sticky top-0 z-40">
              <SidebarTrigger />
              <span className="ml-4 font-semibold">Menu</span>
              <div className="ml-auto">
                <ThemeToggle />
              </div>
            </div>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/token-scan" element={<TokenScanner />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
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