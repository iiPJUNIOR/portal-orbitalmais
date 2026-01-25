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
    <div className="min-h-screen flex bg-white">
      {/* Lado Esquerdo: Imagem com Overlay */}
      <div className="hidden lg:block lg:w-1/2 relative overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center transition-transform duration-10000 hover:scale-105"
          style={{ 
            backgroundImage: "url('https://www.controlid.com.br/assets/img/og-image.jpg')",
          }}
        />
        {/* Overlay gradiente para sofisticação */}
        <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/20 to-transparent" />
        
        {/* Conteúdo sobre a imagem */}
        <div className="absolute inset-0 flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-8 w-8 text-primary-foreground" />
            <span className="text-2xl font-bold tracking-tight">Control iD</span>
          </div>
          
          <div className="max-w-md">
            <h2 className="text-4xl font-bold mb-4">Inovação em Controle de Acesso</h2>
            <p className="text-lg text-gray-200">
              Gerencie suas propostas de forma ágil e profissional com a plataforma líder em tecnologia.
            </p>
          </div>
          
          <div className="text-sm text-gray-400">
            &copy; {new Date().getFullYear()} Control iD. Tecnologia brasileira.
          </div>
        </div>
      </div>

      {/* Lado Direito: Formulário */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-gray-50/30">
        <div className="w-full max-w-[400px] space-y-8">
          <div className="space-y-2 text-center lg:text-left">
            <div className="lg:hidden flex justify-center mb-6">
               <div className="flex items-center gap-2 font-bold text-2xl text-black">
                <ShieldCheck className="h-8 w-8" />
                <span>Control iD</span>
              </div>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Bem-vindo</h1>
            <p className="text-muted-foreground">Insira suas credenciais para acessar o painel.</p>
          </div>

          <div className="bg-white p-2 rounded-2xl shadow-sm border border-gray-100">
            <Auth
              supabaseClient={supabase}
              providers={[]}
              appearance={{
                theme: ThemeSupa,
                style: {
                  button: { borderRadius: '8px', fontWeight: '600' },
                  input: { borderRadius: '8px' },
                  anchor: { color: '#666', fontSize: '14px' },
                },
                variables: {
                  default: {
                    colors: {
                      brand: '#000000',
                      brandAccent: '#222222',
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
                    button_label: 'Acessar Plataforma',
                    loading_button_label: 'Verificando...',
                    link_text: 'Já possui acesso? Entre aqui',
                  },
                  sign_up: {
                    email_label: 'E-mail',
                    password_label: 'Senha',
                    button_label: 'Solicitar Acesso',
                    link_text: 'Não tem uma conta? Cadastre-se',
                  },
                  forgotten_password: {
                    email_label: 'E-mail',
                    button_label: 'Enviar instruções',
                    link_text: 'Esqueceu sua senha?',
                  },
                }
              }}
            />
          </div>
          
          <p className="text-center text-xs text-muted-foreground px-8">
            Ao continuar, você concorda com nossos Termos de Serviço e Política de Privacidade.
          </p>
        </div>
      </div>
    </div>
  );
}