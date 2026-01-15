"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation } from "react-router-dom";

type SessionContextValue = {
  session: any | null;
  user: any | null;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export const SessionProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<any | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        // Attempt to restore existing session
        // @ts-ignore - getSession may be present depending on supabase version
        const resp = await supabase.auth.getSession?.();
        const currentSession = resp?.data?.session ?? resp?.session ?? null;
        if (!mounted) return;
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
      } catch (err) {
        console.warn("SessionProvider: getSession failed", err);
      }

      // Listen for auth state changes
      // onAuthStateChange returns { data } where data.subscription.unsubscribe() is available
      // @ts-ignore
      const { data } = supabase.auth.onAuthStateChange((event, payload) => {
        const s = payload?.session ?? null;
        setSession(s);
        setUser(s?.user ?? null);

        // Redirects: signed in -> / ; signed out -> /login
        if (event === "SIGNED_IN") {
          try {
            navigate("/");
          } catch {}
        } else if (event === "SIGNED_OUT") {
          try {
            navigate("/login");
          } catch {}
        }
      });

      return () => {
        mounted = false;
        try {
          data?.subscription?.unsubscribe?.();
        } catch {}
      };
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep routing consistent: if not authenticated and not on /login -> push to /login.
  // If authenticated and on /login -> push to /
  useEffect(() => {
    try {
      if (session && location.pathname === "/login") {
        navigate("/");
      } else if (!session && location.pathname !== "/login") {
        navigate("/login");
      }
    } catch (err) {
      // navigation can fail during SSR or early mount; ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, location.pathname]);

  return <SessionContext.Provider value={{ session, user }}>{children}</SessionContext.Provider>;
};

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return ctx;
}