"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import Logo from "@/components/Logo";

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
        toast.error("Falha ao entrar: " + (error.message || "erro desconhecido"));
        return;
      }

      if (data?.user) {
        toast.success("Login bem-sucedido");
        navigate("/", { replace: true });
      }
    } catch (err: any) {
      toast.error("Erro ao autenticar: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      // Configuramos o redirecionamento para a nossa nova página de status
      const redirectTo = `${window.location.origin}/auth-status`;
      
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: redirectTo,
        }
      });

      if (error) {
        toast.error("Falha ao criar conta: " + (error.message || "erro desconhecido"));
        return;
      }

      toast.success("Conta criada! Verifique seu e-mail para confirmar.");
      setMode("sign-in");
    } catch (err: any) {
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
    <div className="min-h-screen w-full relative bg-background overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2 min-h-screen">
        <div className="hidden lg:relative lg:flex flex-col justify-between p-16 bg-neutral-900 text-white">
          <div 
            className="absolute inset-0 z-0 bg-cover bg-center opacity-40"
            style={{ 
              backgroundImage: "url('https://www.controlid.com.br/assets/img/og-image.jpg')",
            }}
          />
          <div className="relative z-10">
            <div className="inline-block p-4 rounded-xl">
              <Logo forceWhite className="h-8 w-auto" />
            </div>
          </div>
          <div className="relative z-10">
            <h2 className="text-5xl font-extrabold mb-6 leading-tight">Gere propostas com inteligência.</h2>
            <p className="text-xl text-gray-300 max-w-lg leading-relaxed">A plataforma definitiva para automação de orçamentos e controle de acesso profissional.</p>
          </div>
          <div className="relative z-10 text-sm text-gray-500">&copy; {new Date().getFullYear()} Control iD. Inovação Brasileira.</div>
        </div>

        <div className="flex items-center justify-center p-8 bg-background overflow-y-auto">
          <div className="w-full max-w-[480px]">
            <Card className="proposal-highlight rounded-3xl overflow-hidden border-none shadow-2xl">
              <CardHeader className="bg-primary text-white p-8">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-2xl font-black">
                      {mode === "sign-in" ? "Acessar Painel" : "Criar Conta"}
                    </CardTitle>
                    <CardDescription className="text-white/80 mt-1">
                      {mode === "sign-in" ? "Faça login com seu e-mail e senha" : "Crie sua conta para acessar o sistema"}
                    </CardDescription>
                  </div>
                  <div className="hidden sm:block">
                    <Logo forceWhite className="h-8 w-auto opacity-90" />
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-8">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <Label htmlFor="email" className="text-sm font-semibold">E-mail</Label>
                    <div className="mt-2 relative border-b border-neutral-200 focus-within:border-primary transition-colors">
                      <Input
                        id="email"
                        type="email"
                        placeholder="email@empresa.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="bg-transparent border-none px-0 py-3 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none placeholder:text-muted-foreground"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="password" className="text-sm font-semibold">Senha</Label>
                    <div className="mt-2 relative border-b border-neutral-200 pr-12 focus-within:border-primary transition-colors">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Sua senha"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="bg-transparent border-none px-0 py-3 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none placeholder:text-muted-foreground"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-neutral-400 hover:text-primary transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <input id="remember" type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
                      <label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer">Lembrar</label>
                    </div>
                    <button
                      type="button"
                      onClick={() => toast.info("Funcionalidade em desenvolvimento")}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      Esqueceu a senha?
                    </button>
                  </div>

                  <div className="flex flex-col gap-2 pt-2">
                    <Button type="submit" className="h-12 text-base font-bold rounded-xl" disabled={loading}>
                      {loading ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : null}
                      {mode === "sign-in" ? "Entrar no Sistema" : "Cadastrar Agora"}
                    </Button>

                    <div className="text-center text-sm text-muted-foreground mt-4">
                      {mode === "sign-in" ? (
                        <>Não tem conta? <button type="button" className="underline font-semibold text-primary" onClick={() => setMode("sign-up")}>Criar conta</button></>
                      ) : (
                        <>Já tem conta? <button type="button" className="underline font-semibold text-primary" onClick={() => setMode("sign-in")}>Entrar</button></>
                      )}
                    </div>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}