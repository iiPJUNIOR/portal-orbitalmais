"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
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

  // guard to avoid repeated navigation to the same target within a short time
  const lastNavigateRef = useRef<{ target: string; at: number } | null>(null);
  const NAV_THROTTLE_MS = 800;

  const safeNavigate = (target: string) => {
    try {
      const now = Date.now();
      const last = lastNavigateRef.current;
      if (location.pathname === target) {
        // already there — no navigation needed
        return;
      }
      if (last && last.target === target && now - last.at < NAV_THROTTLE_MS) {
        // attempted recently — skip
        return;
      }
      lastNavigateRef.current = { target, at: now };
      navigate(target);
    } catch (err) {
      // ignore navigation errors
      // console.warn("safeNavigate failed", err);
    }
  };

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
        // Ignore the INITIAL_SESSION event to avoid double-handling during startup
        if (event === "INITIAL_SESSION") {
          return;
        }

        const s = payload?.session ?? null;
        setSession(s);
        setUser(s?.user ?? null);

        // Only auto-redirect on explicit sign-out events.
        // Avoid forcing navigation to "/" on SIGNED_IN (lets user stay on pages like /settings).
        if (event === "SIGNED_OUT") {
          safeNavigate("/login");
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
        safeNavigate("/login");
      } else if (session && location.pathname === "/login") {
        // If logged in and currently on login page, go to root (only once)
        safeNavigate("/");
      }
    } catch (err) {
      // ignore
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