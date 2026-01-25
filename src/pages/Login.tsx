"use client";

import React, { useEffect } from "react";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";

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
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-2 bg-white overflow-hidden">
      {/* Lado Esquerdo: Imagem e Conteúdo (Apenas Desktop) */}
      <div className="hidden lg:relative lg:flex flex-col justify-between p-16 bg-neutral-900 text-white">
        {/* Imagem de Fundo com Opacidade para Leitura */}
        <div 
          className="absolute inset-0 z-0 bg-cover bg-center opacity-40"
          style={{ 
            backgroundImage: "url('https://www.controlid.com.br/assets/img/og-image.jpg')",
          }}
        />
        
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-10 w-10 text-white" />
            <span className="text-2xl font-bold tracking-tight">Control iD</span>
          </div>
        </div>

        <div className="relative z-10">
          <h2 className="text-5xl font-extrabold mb-6 leading-tight">
            Gere propostas <br />
            com inteligência.
          </h2>
          <p className="text-xl text-gray-300 max-w-lg leading-relaxed">
            A plataforma definitiva para automação de orçamentos e controle de acesso profissional.
          </p>
        </div>

        <div className="relative z-10 text-sm text-gray-500">
          &copy; {new Date().getFullYear()} Control iD. Inovação Brasileira.
        </div>
      </div>

      {/* Lado Direito: Formulário de Login */}
      <div className="flex items-center justify-center p-8 bg-white overflow-y-auto">
        <div className="w-full max-w-[420px] py-8">
          {/* Logo visível apenas no Mobile */}
          <div className="lg:hidden flex justify-center mb-8">
            <div className="flex items-center gap-2 font-bold text-3xl text-black">
              <ShieldCheck className="h-10 w-10" />
              <span>Control iD</span>
            </div>
          </div>

          <div className="mb-10 text-center lg:text-left">
            <h1 className="text-4xl font-black tracking-tighter text-gray-900 mb-2">Login</h1>
            <p className="text-gray-500">Bem-vindo de volta! Acesse sua conta.</p>
          </div>

          <div className="auth-ui-wrapper">
            <Auth
              supabaseClient={supabase}
              providers={[]}
              appearance={{
                theme: ThemeSupa,
                style: {
                  button: { 
                    borderRadius: '8px', 
                    padding: '12px',
                    fontSize: '15px',
                    fontWeight: '600',
                  },
                  input: { 
                    borderRadius: '8px',
                    padding: '10px',
                    fontSize: '15px',
                  },
                  label: {
                    fontSize: '14px',
                    fontWeight: '500',
                    marginBottom: '4px'
                  },
                },
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
                    email_label: 'Endereço de e-mail',
                    password_label: 'Sua senha',
                    button_label: 'Acessar Painel',
                    loading_button_label: 'Entrando...',
                  },
                  sign_up: {
                    email_label: 'E-mail',
                    password_label: 'Senha',
                    button_label: 'Criar conta',
                  },
                  forgotten_password: {
                    email_label: 'E-mail',
                    button_label: 'Recuperar senha',
                  },
                }
              }}
            />
          </div>
          
          <div className="mt-12 pt-8 border-t border-gray-100 text-center text-sm text-gray-400">
            Precisa de ajuda? <span className="text-black font-semibold cursor-pointer hover:underline">Fale com o suporte</span>
          </div>
        </div>
      </div>
    </div>
  );
}