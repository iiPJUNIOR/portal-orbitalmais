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
  const [initializing, setInitializing] = useState(true);
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
      } finally {
        // Mark that initial session check finished (prevents redirect flicker)
        if (mounted) setInitializing(false);
      }

      // Listen for auth state changes
      // onAuthStateChange returns { data } where data.subscription.unsubscribe() is available
      // @ts-ignore
      const { data } = supabase.auth.onAuthStateChange((event, payload) => {
        const s = payload?.session ?? null;
        setSession(s);
        setUser(s?.user ?? null);

        // Only auto-redirect on explicit sign-out events.
        // Avoid forcing navigation to "/" on SIGNED_IN (lets user stay on pages like /settings).
        if (event === "SIGNED_OUT") {
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

  // After initial check finishes, redirect unauthenticated users to /login (but don't force authenticated users to /)
  useEffect(() => {
    if (initializing) return;

    try {
      if (!session && location.pathname !== "/login") {
        navigate("/login");
      }
      // If there is a session and the user is on /login, send them to root
      if (session && location.pathname === "/login") {
        navigate("/");
      }
    } catch (err) {
      // navigation can fail during SSR or early mount; ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, location.pathname, initializing]);

  return <SessionContext.Provider value={{ session, user }}>{children}</SessionContext.Provider>;
};

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return ctx;
}