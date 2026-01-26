"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, ShieldCheck, KeyRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import Logo from "@/components/Logo";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // O Supabase lida com a sessão automaticamente quando o usuário clica no link
  // Precisamos apenas garantir que ele esteja autenticado temporariamente por esse link
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Link de redefinição inválido ou expirado.");
        navigate("/login");
      }
    };
    checkSession();
  }, [navigate]);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        toast.error("Erro ao atualizar senha: " + error.message);
        return;
      }

      toast.success("Senha atualizada com sucesso!");
      // O logout garante que ele tenha que logar com a nova senha para validar
      await supabase.auth.signOut();
      navigate("/login");
    } catch (err: any) {
      toast.error("Erro inesperado: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-[480px] animate-in fade-in zoom-in-95 duration-500">
        <Card className="proposal-highlight rounded-3xl overflow-hidden border-none shadow-2xl">
          <CardHeader className="bg-primary text-white p-8 text-center">
            <div className="flex justify-center mb-4">
              <Logo forceWhite className="h-8 w-auto" />
            </div>
            <CardTitle className="text-2xl font-black">Nova Senha</CardTitle>
            <CardDescription className="text-white/80">
              Escolha uma senha forte para sua segurança.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-10 space-y-6">
            <div className="flex justify-center mb-2">
              <div className="p-4 bg-primary/10 rounded-full">
                <KeyRound className="h-8 w-8 text-primary" />
              </div>
            </div>

            <form onSubmit={handleUpdatePassword} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="password">Nova Senha</Label>
                  <div className="mt-2 relative border-b border-neutral-200 pr-12 focus-within:border-primary transition-colors">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Mínimo 6 caracteres"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="bg-transparent border-none px-0 py-3 focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-neutral-400 hover:text-primary transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                  <div className="mt-2 relative border-b border-neutral-200 focus-within:border-primary transition-colors">
                    <Input
                      id="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      placeholder="Repita sua nova senha"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="bg-transparent border-none px-0 py-3 focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                  </div>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 text-base font-bold rounded-xl"
                disabled={loading}
              >
                {loading ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : null}
                Atualizar Senha
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}