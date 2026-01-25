"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";

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
        // @ts-ignore
        const resp = await supabase.auth.getSession?.();
        const currentSession = resp?.data?.session ?? resp?.session ?? null;
        
        if (mounted) {
          setSession(currentSession);
          setUser(currentSession?.user ?? null);
          setInitializing(false);
        }
      } catch (err) {
        console.warn("Auth init error", err);
        if (mounted) setInitializing(false);
      }
    };

    initializeAuth();

    // @ts-ignore
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mounted) return;
      
      setSession(s);
      setUser(s?.user ?? null);
      
      if (event === "SIGNED_OUT") {
        safeNavigate("/login");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Efeito de Redirecionamento Protegido
  useEffect(() => {
    if (initializing) return;

    const path = location.pathname;
    const isLoginPage = path === "/login";

    if (!session && !isLoginPage) {
      safeNavigate("/login");
    } else if (session && isLoginPage) {
      safeNavigate("/");
    }
  }, [session, location.pathname, initializing]);

  // Enquanto estiver inicializando, mostra uma tela de splash elegante
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