"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { syncLocalDrafts } from "@/services/draftService";
import { toast } from "sonner";

type SessionContextValue = {
  session: any | null;
  user: any | null;
  initializing: boolean;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export const SessionProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<any | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [initializing, setInitializing] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const lastNavigateRef = useRef<{ target: string; at: number } | null>(null);
  const NAV_THROTTLE_MS = 800;

  const safeNavigate = (target: string) => {
    const now = Date.now();
    const last = lastNavigateRef.current;
    if (location.pathname === target) return;
    if (last && last.target === target && now - last.at < NAV_THROTTLE_MS) return;
    lastNavigateRef.current = { target, at: now };
    navigate(target, { replace: true });
  };

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const hash = window.location.hash;

        if (hash.includes("type=recovery")) {
          console.log("[SessionProvider] Detectado link de RECUPERAÇÃO via Hash");
          setTimeout(() => {
            if (mounted) safeNavigate("/reset-password");
          }, 100);
        } else if (hash.includes("type=signup")) {
          console.log("[SessionProvider] Detectado link de CONFIRMAÇÃO de cadastro");
          if (location.pathname !== "/auth-status") {
            setTimeout(() => {
              if (mounted) safeNavigate("/auth-status");
            }, 100);
          }
        }

        const resp = await supabase.auth.getSession();
        const currentSession = resp?.data?.session ?? null;

        if (mounted) {
          setSession(currentSession);
          setUser(currentSession?.user ?? null);
          setInitializing(false);
        }
      } catch (err) {
        console.warn("[SessionProvider] Erro ao inicializar auth", err);
        if (mounted) setInitializing(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, s) => {
      if (!mounted) return;

      console.log("[SessionProvider] Evento de Auth:", event);
      setSession(s);
      setUser(s?.user ?? null);

      if (event === "PASSWORD_RECOVERY") {
        safeNavigate("/reset-password");
      } else if (event === "SIGNED_OUT") {
        safeNavigate("/login");
      } else if (event === "SIGNED_IN") {
        // Try to sync local drafts automatically when the user signs in
        try {
          const tId = toast.loading("Sincronizando rascunhos locais...");
          const result = await syncLocalDrafts();
          if (result.synced.length > 0) {
            toast.success(`Sincronizados ${result.synced.length} rascunho(s).`, { id: tId });
          } else {
            // If none synced but also no failures, just dismiss
            if (result.failed.length === 0) {
              toast.dismiss(tId);
            } else {
              toast.error(`Falha ao sincronizar ${result.failed.length} rascunho(s).`, { id: tId });
            }
          }
        } catch (err) {
          console.warn("Auto-sync drafts failed", err);
          toast.error("Erro ao sincronizar rascunhos locais");
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (initializing) return;

    const path = location.pathname;
    const hash = window.location.hash;

    if (
      hash.includes("type=recovery") ||
      hash.includes("type=signup") ||
      path === "/reset-password" ||
      path === "/auth-status"
    ) {
      return;
    }

    if (!session && path !== "/login") {
      safeNavigate("/login");
    } else if (session && path === "/login") {
      safeNavigate("/");
    }
  }, [session, location.pathname, initializing]);

  if (initializing) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-white">
        <div className="flex flex-col items-center space-y-4">
          <div className="p-4 bg-neutral-900 rounded-2xl shadow-lg">
            <ShieldCheck className="h-10 w-10 text-white" />
          </div>
          <div className="flex items-center gap-2 text-gray-500 animate-pulse">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm font-medium">Autenticando...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SessionContext.Provider value={{ session, user, initializing }}>
      {children}
    </SessionContext.Provider>
  );
};

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}