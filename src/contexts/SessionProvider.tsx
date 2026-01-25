"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation } from "react-router-dom";

type SessionContextValue = {
  session: any | null;
  user: any | null;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

const NO_BASES_WARN_KEY = "no_bases_warning_shown";

// Add public routes that should be accessible without authentication.
// You can add more paths here if other pages should be public.
const PUBLIC_PATHS = ["/settings"];

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
      // onAuthStateChange returns an object with 'data' containing the subscription
      // @ts-ignore
      const authListener = supabase.auth.onAuthStateChange((event, payload) => {
        // payload.session may be available in many events (including INITIAL_SESSION)
        const s = payload?.session ?? null;

        // Handle INITIAL_SESSION to ensure we restore the session if Supabase provides it.
        // Some environments deliver the current session via this event rather than getSession.
        if (event === "INITIAL_SESSION") {
          // Clear the one-time "no bases" warning flag so the app may show it once for this login
          try {
            sessionStorage.removeItem(NO_BASES_WARN_KEY);
          } catch {}
          setSession(s);
          setUser(s?.user ?? null);
          return;
        }

        // For other events, update session and user
        setSession(s);
        setUser(s?.user ?? null);

        // When user signs in explicitly, clear the one-time warning flag so message may be shown once now
        if (event === "SIGNED_IN") {
          try {
            sessionStorage.removeItem(NO_BASES_WARN_KEY);
          } catch {}
        }

        // Only auto-redirect on explicit sign-out events.
        if (event === "SIGNED_OUT") {
          safeNavigate("/login");
        }

        // Do not force navigation on SIGNED_IN to avoid interrupting user's current flow.
      });

      // Cleanup function: unsubscribe listener properly
      return () => {
        mounted = false;
        try {
          // The supabase client returns { data } with a subscription object that has unsubscribe()
          // In some versions it's authListener.data.subscription.unsubscribe(); handle both shapes safely.
          const maybeData = (authListener as any)?.data ?? authListener;
          if (maybeData?.subscription?.unsubscribe) {
            maybeData.subscription.unsubscribe();
          } else if (typeof maybeData?.unsubscribe === "function") {
            maybeData.unsubscribe();
          } else if (typeof (authListener as any)?.unsubscribe === "function") {
            (authListener as any).unsubscribe();
          }
        } catch (e) {
          // ignore cleanup errors
        }
      };
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After initial check finishes, redirect unauthenticated users to /login (but don't force authenticated users to /)
  useEffect(() => {
    if (initializing) return;

    try {
      const path = location.pathname || "/";

      // If the current path is listed as public, don't force redirect to /login
      const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p + "?") || path.startsWith(p + "#"));

      if (!session && !isPublic && path !== "/login") {
        safeNavigate("/login");
      } else if (session && path === "/login") {
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