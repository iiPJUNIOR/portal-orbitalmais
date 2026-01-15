"use client";

import React, { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/contexts/SessionProvider";
import { toast } from "sonner";

export default function UserMenu() {
  const { user } = useSession();
  const shownRef = useRef(false);

  useEffect(() => {
    if (user && !shownRef.current) {
      const email =
        (user.email as string) ||
        (user.user_metadata && user.user_metadata.email) ||
        "Usuário autenticado";
      toast.success(`${email} autenticado`, { duration: 4000 });
      shownRef.current = true;
    }

    // Reset shown flag when user logs out so toast can show again on next login
    if (!user) {
      shownRef.current = false;
    }
  }, [user]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast("Desconectado", { duration: 3000 });
    } catch (err) {
      console.error("logout failed", err);
      toast.error("Falha ao desconectar");
    }
  };

  // Only render a small logout control (no persistent email text)
  if (!user) {
    return null;
  }

  return (
    <div className="flex items-center space-x-2">
      <Button size="sm" variant="outline" onClick={handleLogout}>
        Logout
      </Button>
    </div>
  );
}