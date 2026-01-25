"use client";

import React, { useEffect } from "react";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    
    const checkSession = async () => {
      try {
        // @ts-ignore
        const resp = await supabase.auth.getSession?.();
        const currentSession = resp?.data?.session ?? resp?.session ?? null;
        if (currentSession && mounted) {
          navigate("/");
        }
      } catch (err) {
        // ignore
      }
    };

    checkSession();

    // @ts-ignore
    const sub = supabase.auth.onAuthStateChange((event: string, payload: any) => {
      if (!mounted) return;
      if (event === "SIGNED_IN") {
        const s = payload?.session ?? null;
        if (s) {
          navigate("/");
        }
      }
    });

    return () => {
      mounted = false;
      try {
        const maybeData = (sub as any)?.data ?? sub;
        if (maybeData?.subscription?.unsubscribe) {
          maybeData.subscription.unsubscribe();
        } else if (typeof (sub as any)?.unsubscribe === "function") {
          (sub as any).unsubscribe();
        }
      } catch (e) {
        // ignore
      }
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-white">
      {/* Coluna da Imagem - Esquerda */}
      <div className="hidden md:flex md:w-1/2 lg:w-2/3 bg-gray-50 items-center justify-center p-12 overflow-hidden border-r">
        <div className="relative w-full max-w-4xl">
          <img 
            src="https://www.controlid.com.br/assets/img/og-image.jpg" 
            alt="Produtos Control iD" 
            className="w-full h-auto object-contain rounded-xl shadow-2xl"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none rounded-xl" />
        </div>
      </div>

      {/* Coluna do Formulário - Direita */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 lg:p-16">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center md:text-left">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Control iD
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Gerador de Propostas e Orçamentos
            </p>
          </div>

          <div className="bg-white rounded-xl">
            <Auth
              supabaseClient={supabase}
              providers={[]}
              appearance={{
                theme: ThemeSupa,
                variables: {
                  default: {
                    colors: {
                      brand: '#000000',
                      brandAccent: '#333333',
                    },
                  },
                },
              }}
              theme="light"
              localization={{
                variables: {
                  sign_in: {
                    email_label: 'E-mail',
                    password_label: 'Senha',
                    button_label: 'Entrar',
                    loading_button_label: 'Entrando...',
                    social_provider_text: 'Entrar com {{provider}}',
                    link_text: 'Já tem uma conta? Entre',
                  },
                  sign_up: {
                    email_label: 'E-mail',
                    password_label: 'Senha',
                    button_label: 'Criar conta',
                    loading_button_label: 'Criando conta...',
                    social_provider_text: 'Criar conta com {{provider}}',
                    link_text: 'Não tem uma conta? Cadastre-se',
                  },
                  forgotten_password: {
                    email_label: 'E-mail',
                    password_label: 'Senha',
                    button_label: 'Recuperar senha',
                    loading_button_label: 'Recuperando...',
                    link_text: 'Esqueceu sua senha?',
                  },
                }
              }}
            />
          </div>
          
          <div className="text-center text-xs text-gray-400 mt-8">
            &copy; {new Date().getFullYear()} Control iD. Todos os direitos reservados.
          </div>
        </div>
      </div>
    </div>
  );
}