"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/contexts/SessionProvider";

export default function UserMenu() {
  const { user } = useSession();

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("logout failed", err);
    }
  };

  if (!user) {
    return null;
  }

  const email = (user.email as string) || (user.user_metadata && user.user_metadata.email) || "";

  return (
    <div className="flex items-center space-x-3 bg-white/90 backdrop-blur-sm border rounded px-3 py-2 shadow-sm">
      <div className="text-sm">
        <div className="font-medium">{email ? email : "Usuário"}</div>
        <div className="text-xs text-muted-foreground">Autenticado</div>
      </div>
      <div>
        <Button size="sm" variant="outline" onClick={handleLogout}>Logout</Button>
      </div>
    </div>
  );
}