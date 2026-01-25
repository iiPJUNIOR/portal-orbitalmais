"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/contexts/SessionProvider";
import { toast } from "sonner";
import { LogOut } from "lucide-react";

export default function UserMenu() {
  const { user } = useSession();

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("Sessão encerrada");
    } catch (err) {
      toast.error("Erro ao sair");
    }
  };

  if (!user) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Button 
        size="sm" 
        variant="outline" 
        onClick={handleLogout} 
        className="bg-white/80 backdrop-blur-sm shadow-sm hover:bg-destructive hover:text-white transition-all group"
      >
        <LogOut className="h-4 w-4 mr-2" />
        Sair
      </Button>
    </div>
  );
}