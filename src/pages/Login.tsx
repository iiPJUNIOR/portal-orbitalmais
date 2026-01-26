"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      try {
        // @ts-ignore
        const resp = await supabase.auth.getSession?.();
        const currentSession = resp?.data?.session ?? resp?.session ?? null;
        if (currentSession && mounted) {
          navigate("/", { replace: true });
        }
      } catch {
        // ignore
      }
    };

    checkSession();

    // @ts-ignore
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "SIGNED_IN" && session) {
        navigate("/", { replace: true });
      }
    });

    return () => {
      mounted = false;
      try {
        subscription.unsubscribe();
      } catch {}
    };
  }, [navigate]);

  const handleSignIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        console.error("signIn error", error);
        toast.error("Falha ao entrar: " + (error.message || "erro desconhecido"));
        return;
      }

      if (data?.user) {
        toast.success("Login bem-sucedido");
        navigate("/", { replace: true });
      } else {
        toast.success("Verifique seu e-mail para confirmar (se aplicável).");
      }
    } catch (err: any) {
      console.error("signIn exception", err);
      toast.error("Erro ao autenticar: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        console.error("signUp error", error);
        toast.error("Falha ao criar conta: " + (error.message || "erro desconhecido"));
        return;
      }

      toast.success("Conta criada! Verifique seu e-mail para confirmar.");
      setMode("sign-in");
    } catch (err: any) {
      console.error("signUp exception", err);
      toast.error("Erro ao criar conta: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    if (mode === "sign-in") return void handleSignIn(e);
    return void handleSignUp(e);
  };

  return (
    <div className="min-h-screen w-full relative bg-white overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2 min-h-screen">
        {/* Lado Esquerdo: Imagem (Apenas Desktop) */}
        <div className="hidden lg:relative lg:flex flex-col justify-between p-16 bg-neutral-900 text-white">
          <div 
            className="absolute inset-0 z-0 bg-cover bg-center opacity-40"
            style={{ 
              backgroundImage: "url('https://www.controlid.com.br/assets/img/og-image.jpg')",
            }}
          />
          
          <div className="relative z-10">
            <div className="inline-block p-4 rounded-xl">
              <img 
                src="/logo.png" 
                alt="Control iD" 
                className="h-8 w-auto"
              />
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

        {/* Lado Direito: Formulário */}
        <div className="flex items-center justify-center p-8 bg-white overflow-y-auto">
          <div className="w-full max-w-[420px] py-8">
            <div className="lg:hidden flex justify-center mb-8">
              <div className="p-2 rounded-xl">
                <img 
                  src="/logo.png" 
                  alt="Control iD" 
                  className="h-10 w-auto"
                />
              </div>
            </div>

            <div className="mb-6 text-center lg:text-left">
              <h1 className="text-4xl font-black tracking-tighter text-gray-900 mb-2">Login</h1>
              <p className="text-gray-500">Acesse sua conta para continuar.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-xl shadow-sm border">
              {/* Email - minimal input with underline */}
              <div>
                <Label htmlFor="email" className="text-sm">E-mail</Label>
                <div className="mt-2 relative">
                  <div className="border-b border-neutral-200 dark:border-neutral-700">
                    <Input
                      id="email"
                      type="email"
                      placeholder="email@empresa.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="bg-transparent border-none px-0 py-3 focus-visible:ring-0 focus-visible:border-none placeholder:text-muted-foreground"
                    />
                  </div>
                </div>
              </div>

              {/* Password - minimal input + eye button */}
              <div>
                <Label htmlFor="password" className="text-sm">Senha</Label>
                <div className="mt-2 relative">
                  <div className="border-b border-neutral-200 dark:border-neutral-700 pr-10">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Sua senha"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="bg-transparent border-none px-0 py-3 focus-visible:ring-0 focus-visible:border-none placeholder:text-muted-foreground"
                    />
                  </div>

                  <button
                    type="button"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 p-1 rounded-full focus:outline-none"
                  >
                    {/* Icon styling: white in dark, muted in light. EyeOff includes the slash */}
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 text-neutral-600 dark:text-white" />
                    ) : (
                      <Eye className="h-5 w-5 text-neutral-600 dark:text-white" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <input id="remember" type="checkbox" className="h-4 w-4" />
                  <label htmlFor="remember" className="text-sm text-muted-foreground">Lembrar</label>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!email) return toast.error("Preencha o e-mail para recuperar a senha");
                      setLoading(true);
                      supabase.auth.resetPasswordForEmail(email).then(({ data, error }) => {
                        if (error) toast.error("Erro ao enviar link de recuperação: " + (error.message || ""));
                        else toast.success("Link de recuperação enviado para o seu e-mail");
                      }).finally(() => setLoading(false));
                    }}
                    className="text-sm text-muted-foreground underline"
                  >
                    Esqueceu a senha?
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Button type="submit" className="h-11" disabled={loading}>
                  {loading ? <Loader2 className="animate-spin h-4 w-4 mr-2 inline" /> : null}
                  {mode === "sign-in" ? "Acessar Painel" : "Criar Conta"}
                </Button>

                <div className="text-center text-sm text-muted-foreground">
                  {mode === "sign-in" ? (
                    <>
                      Não tem conta?{" "}
                      <button type="button" className="underline" onClick={() => setMode("sign-up")}>Criar conta</button>
                    </>
                  ) : (
                    <>
                      Já tem conta?{" "}
                      <button type="button" className="underline" onClick={() => setMode("sign-in")}>Entrar</button>
                    </>
                  )}
                </div>
              </div>
            </form>

            <div className="mt-6 pt-6 border-t text-center text-sm text-gray-400">
              Precisa de ajuda? <span className="text-black font-semibold cursor-pointer hover:underline">Fale com o suporte</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}