"use client";

import React, { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, ArrowLeft, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import Logo from "@/components/Logo";

type AuthMode = "sign-in" | "sign-up" | "reset-password";

// URL de produção definida para garantir redirecionamentos corretos via e-mail
const PROD_URL = "https://orcamentosacesso.vercel.app";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Parallax state
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      try {
        const resp = await supabase.auth.getSession?.();
        const currentSession = (resp as any)?.data?.session ?? (resp as any)?.session ?? null;
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

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMousePos({ x, y });
  };

  const handleMouseLeave = () => {
    setMousePos({ x: 0, y: 0 });
  };

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
      const redirectTo = `${PROD_URL}/auth-status`;
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

  const handleResetPassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email) {
      toast.error("Informe seu e-mail para continuar.");
      return;
    }
    setLoading(true);
    try {
      const redirectTo = `${PROD_URL}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });

      if (error) {
        toast.error("Erro ao solicitar redefinição: " + error.message);
        return;
      }

      setResetSent(true);
      toast.success("E-mail de recuperação enviado!");
    } catch (err: any) {
      toast.error("Erro: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    if (mode === "sign-in") return void handleSignIn(e);
    if (mode === "sign-up") return void handleSignUp(e);
    return void handleResetPassword(e);
  };

  return (
    <div className="min-h-screen w-full relative bg-background overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2 min-h-screen">
        {/* Lado Esquerdo - Branding com efeito 3D Parallax sutil */}
        <div 
          ref={containerRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="hidden lg:relative lg:flex flex-col justify-between p-16 bg-black text-white overflow-hidden perspective-1000"
        >
          {/* Glowing orbital design */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-gradient-to-br from-indigo-950 via-slate-950 to-black">
            <div 
              className="w-[450px] h-[450px] rounded-full bg-gradient-to-tr from-primary/30 to-violet-500/20 blur-[80px] transition-transform duration-300 ease-out"
              style={{ 
                transform: `
                  translate3d(${mousePos.x * 50}px, ${mousePos.y * 50}px, 0)
                `,
              }}
            />
          </div>

          <div className="relative z-10">
            <div className="inline-block p-4 rounded-xl">
              <Logo forceWhite className="h-8 w-auto" />
            </div>
          </div>
          <div className="relative z-10">
            <h2 className="text-5xl font-extrabold mb-6 leading-tight drop-shadow-lg">Propostas com agilidade e precisão.</h2>
            <p className="text-xl text-gray-300 max-w-lg leading-relaxed drop-shadow-md">
              {mode === "reset-password" 
                ? "Não se preocupe, vamos ajudar você a recuperar o acesso à sua conta rapidamente."
                : "A plataforma definitiva para automação de orçamentos e propostas comerciais dinâmicas."}
            </p>
          </div>
          <div className="relative z-10 text-sm text-gray-500">&copy; {new Date().getFullYear()} Orbital Mais. Todos os direitos reservados.</div>
        </div>

        {/* Lado Direito - Formulário */}
        <div className="flex items-center justify-center p-8 bg-background overflow-y-auto">
          <div className="w-full max-w-[480px]">
            <Card className="proposal-highlight rounded-3xl overflow-hidden border-none shadow-2xl">
              <CardHeader className="bg-primary text-white p-8">
                <div className="flex items-start justify-between">
                  <div>
                    {mode === "reset-password" && (
                      <button 
                        onClick={() => { setMode("sign-in"); setResetSent(false); }}
                        className="mb-2 flex items-center text-xs font-bold text-white/70 hover:text-white transition-colors"
                      >
                        <ArrowLeft className="h-3 w-3 mr-1" /> VOLTAR AO LOGIN
                      </button>
                    )}
                    <CardTitle className="text-2xl font-black">
                      {mode === "sign-in" ? "Acessar Painel" : mode === "sign-up" ? "Criar Conta" : "Recuperar Conta"}
                    </CardTitle>
                    <CardDescription className="text-white/80 mt-1">
                      {mode === "sign-in" ? "Bem-vindo de volta à Orbital Mais" : mode === "sign-up" ? "Junte-se a nós hoje mesmo" : "Enviaremos um link de acesso"}
                    </CardDescription>
                  </div>
                  <div className="hidden sm:block">
                    <Logo forceWhite className="h-8 w-auto opacity-90" />
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-8">
                {mode === "reset-password" && resetSent ? (
                  <div className="text-center space-y-6 py-4 animate-in fade-in zoom-in-95">
                    <div className="flex justify-center">
                      <div className="p-4 bg-primary/10 rounded-full">
                        <Mail className="h-10 w-10 text-primary" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h3 className="font-bold text-lg">E-mail Enviado</h3>
                      <p className="text-sm text-muted-foreground">
                        Verifique sua caixa de entrada (e spam) em <strong>{email}</strong> para redefinir sua senha.
                      </p>
                    </div>
                    <Button 
                      variant="outline" 
                      className="w-full rounded-xl"
                      onClick={() => setResetSent(false)}
                    >
                      Tentar com outro e-mail
                    </Button>
                  </div>
                ) : (
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

                    {mode !== "reset-password" && (
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
                    )}

                    {mode === "sign-in" && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <input id="remember" type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
                          <label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer">Lembrar</label>
                        </div>
                        <button
                          type="button"
                          onClick={() => setMode("reset-password")}
                          className="text-sm text-muted-foreground hover:text-primary transition-colors font-medium"
                        >
                          Esqueceu a senha?
                        </button>
                      </div>
                    )}

                    <div className="flex flex-col gap-2 pt-2">
                      <Button type="submit" className="h-12 text-base font-bold rounded-xl" disabled={loading}>
                        {loading ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : null}
                        {mode === "sign-in" ? "Entrar no Sistema" : mode === "sign-up" ? "Cadastrar Agora" : "Enviar Link de Recuperação"}
                      </Button>

                      <div className="text-center text-sm text-muted-foreground mt-4">
                        {mode === "sign-in" ? (
                          <>Não tem conta? <button type="button" className="underline font-semibold text-primary" onClick={() => setMode("sign-up")}>Criar conta</button></>
                        ) : mode === "sign-up" ? (
                          <>Já tem conta? <button type="button" className="underline font-semibold text-primary" onClick={() => setMode("sign-in")}>Entrar</button></>
                        ) : null}
                      </div>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}