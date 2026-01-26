"use client";

import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, ArrowRight, Mail } from "lucide-react";
import Logo from "@/components/Logo";

export default function AuthStatus() {
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<"success" | "error" | "loading">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    // O Supabase envia erros via URL fragment (#) ou query string (?)
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace("#", "?"));
    
    const error = params.get("error") || new URLSearchParams(location.search).get("error");
    const errorDescription = params.get("error_description") || new URLSearchParams(location.search).get("error_description");

    if (error) {
      setStatus("error");
      if (error === "access_denied" && errorDescription?.includes("expired")) {
        setMessage("O link de confirmação expirou ou já foi utilizado. Por favor, tente se cadastrar novamente ou solicitar um novo link.");
      } else {
        setMessage(errorDescription || "Ocorreu um erro ao verificar sua conta.");
      }
    } else {
      // Se não há erro e chegamos aqui via redirecionamento de auth, assumimos sucesso ou aguardamos
      setStatus("success");
      setMessage("Sua conta foi verificada com sucesso! Agora você já pode acessar o sistema.");
    }
  }, [location]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-[480px] animate-in fade-in zoom-in-95 duration-500">
        <Card className="proposal-highlight rounded-3xl overflow-hidden border-none shadow-2xl">
          <CardHeader className="bg-primary text-white p-8 text-center">
            <div className="flex justify-center mb-4">
              <Logo forceWhite className="h-8 w-auto" />
            </div>
            <CardTitle className="text-2xl font-black">
              {status === "success" ? "Conta Ativada!" : "Ops! Algo deu errado"}
            </CardTitle>
          </CardHeader>

          <CardContent className="p-10 text-center space-y-6">
            <div className="flex justify-center">
              {status === "success" ? (
                <div className="p-4 bg-green-100 rounded-full">
                  <CheckCircle2 className="h-12 w-12 text-green-600" />
                </div>
              ) : (
                <div className="p-4 bg-red-100 rounded-full">
                  <XCircle className="h-12 w-12 text-red-600" />
                </div>
              )}
            </div>

            <p className="text-muted-foreground leading-relaxed">
              {message}
            </p>

            <div className="pt-4">
              <Button 
                onClick={() => navigate("/login")} 
                className="w-full h-12 text-base font-bold rounded-xl"
              >
                {status === "success" ? "Ir para o Login" : "Voltar para o Login"}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}