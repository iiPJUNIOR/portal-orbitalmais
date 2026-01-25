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
    <div className="min-h-screen flex bg-white font-sans">
      {/* Lado Esquerdo: Imagem Imersiva */}
      <div className="hidden lg:block lg:w-1/2 relative">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ 
            backgroundImage: "url('https://www.controlid.com.br/assets/img/og-image.jpg')",
          }}
        />
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
        
        <div className="absolute inset-0 flex flex-col justify-between p-16 text-white">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-lg backdrop-blur-md">
              <ShieldCheck className="h-8 w-8 text-white" />
            </div>
            <span className="text-2xl font-bold tracking-tight">Control iD</span>
          </div>
          
          <div>
            <h2 className="text-5xl font-extrabold mb-6 leading-tight">
              Gerencie propostas <br />
              com inteligência.
            </h2>
            <p className="text-xl text-gray-200 max-w-lg leading-relaxed">
              A plataforma definitiva para automação de orçamentos e controle de acesso profissional.
            </p>
          </div>
          
          <div className="text-sm font-medium text-gray-300">
            &copy; {new Date().getFullYear()} Control iD. Inovação Brasileira.
          </div>
        </div>
      </div>

      {/* Lado Direito: Área de Login */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 bg-white">
        <div className="w-full max-w-[420px]">
          <div className="mb-10 text-center lg:text-left">
            <div className="lg:hidden flex justify-center mb-8">
               <div className="flex items-center gap-2 font-bold text-3xl text-black">
                <ShieldCheck className="h-10 w-10" />
                <span>Control iD</span>
              </div>
            </div>
            <h1 className="text-4xl font-black tracking-tighter text-gray-900 mb-3">Login</h1>
            <p className="text-gray-500 text-lg">Bem-vindo de volta! Acesse sua conta.</p>
          </div>

          <div className="auth-container">
            <Auth
              supabaseClient={supabase}
              providers={[]}
              appearance={{
                theme: ThemeSupa,
                style: {
                  button: { 
                    borderRadius: '12px', 
                    padding: '12px',
                    fontSize: '16px',
                    fontWeight: '700',
                    marginTop: '10px'
                  },
                  input: { 
                    borderRadius: '12px',
                    padding: '12px',
                    fontSize: '16px',
                    backgroundColor: '#f9fafb',
                    border: '1px solid #e5e7eb'
                  },
                  label: {
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '6px'
                  },
                  anchor: { 
                    color: '#4b5563', 
                    fontSize: '14px',
                    textDecoration: 'none',
                    fontWeight: '500'
                  },
                },
                variables: {
                  default: {
                    colors: {
                      brand: '#000000',
                      brandAccent: '#111827',
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
                    loading_button_label: 'Autenticando...',
                    link_text: 'Já tem conta? Entre aqui',
                  },
                  sign_up: {
                    email_label: 'E-mail',
                    password_label: 'Senha',
                    button_label: 'Cadastrar',
                    link_text: 'Criar uma nova conta',
                  },
                  forgotten_password: {
                    email_label: 'E-mail',
                    button_label: 'Recuperar senha',
                    link_text: 'Esqueceu sua senha?',
                  },
                }
              }}
            />
          </div>
          
          <div className="mt-12 pt-8 border-t border-gray-100 text-center">
            <p className="text-sm text-gray-400">
              Precisa de ajuda? <a href="#" className="text-black font-semibold hover:underline">Fale com o suporte</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}