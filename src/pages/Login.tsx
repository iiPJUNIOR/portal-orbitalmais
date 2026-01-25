"use client";

import React, { useEffect } from "react";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function Login() {
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    let intervalId: number | null = null;

    // One-off check + short polling fallback to catch session when it appears
    const checkSession = async () => {
      try {
        // @ts-ignore - supabase.auth.getSession may exist depending on version
        const resp = await supabase.auth.getSession?.();
        const currentSession = resp?.data?.session ?? resp?.session ?? null;
        if (currentSession && mounted) {
          navigate("/");
        }
      } catch (err) {
        // ignore
      }
    };

    // initial immediate check
    checkSession();

    // Poll every 500ms for up to ~10s to catch delayed session appearances (e.g. after clearing cache or redirect flows)
    let attempts = 0;
    intervalId = window.setInterval(async () => {
      attempts += 1;
      try {
        // @ts-ignore
        const resp = await supabase.auth.getSession?.();
        const currentSession = resp?.data?.session ?? resp?.session ?? null;
        if (currentSession && mounted) {
          if (intervalId) {
            window.clearInterval(intervalId);
            intervalId = null;
          }
          navigate("/");
        } else if (attempts > 20) {
          // stop after ~10s
          if (intervalId) {
            window.clearInterval(intervalId);
            intervalId = null;
          }
        }
      } catch {
        if (attempts > 20 && intervalId) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
      }
    }, 500);

    // Also listen to auth state changes to navigate immediately on SIGNED_IN
    // @ts-ignore
    const sub = supabase.auth.onAuthStateChange((event: string, payload: any) => {
      if (!mounted) return;
      if (event === "SIGNED_IN") {
        const s = payload?.session ?? null;
        if (s) {
          try {
            if (intervalId) {
              window.clearInterval(intervalId);
              intervalId = null;
            }
          } catch {}
          navigate("/");
        }
      } else if (event === "SIGNED_OUT") {
        // Keep user on login page if sign out occurs here
        try {
          if (intervalId) {
            window.clearInterval(intervalId);
            intervalId = null;
          }
        } catch {}
      }
    });

    return () => {
      mounted = false;
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
      try {
        const maybeData = (sub as any)?.data ?? sub;
        if (maybeData?.subscription?.unsubscribe) {
          maybeData.subscription.unsubscribe();
        } else if (typeof maybeData?.unsubscribe === "function") {
          maybeData.unsubscribe();
        } else if (typeof (sub as any)?.unsubscribe === "function") {
          (sub as any).unsubscribe();
        }
      } catch (e) {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the Auth UI render as before
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-full max-w-md p-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Entrar</h2>
          <Auth
            supabaseClient={supabase}
            providers={[]}
            appearance={{
              theme: ThemeSupa,
            }}
            theme="light"
          />
          <div className="text-sm text-muted-foreground mt-3">
            Se a autenticação demorar, aguarde alguns segundos — o sistema redirecionará automaticamente.
          </div>
        </div>
      </div>
    </div>
  );
}