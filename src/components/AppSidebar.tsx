"use client";

import React, { useEffect, useState } from "react";
import { 
  LayoutTemplate, 
  Settings, 
  LogOut,
  User,
  FileText,
  History as HistoryIcon
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { useNavigate, useLocation } from "react-router-dom";
import { useSession } from "@/contexts/SessionProvider";
import { supabase } from "@/integrations/supabase/client";
import Logo from "@/components/Logo";
import { getUserSettings } from "@/services/settingsService";

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSession();

  const [canViewHistory, setCanViewHistory] = useState<boolean>(false);
  const [canAccessSettings, setCanAccessSettings] = useState<boolean>(false);

  const PAULO_EMAIL = "paulo.sergio@controlid.com.br";

  useEffect(() => {
    let mounted = true;

    async function checkAccess() {
      try {
        if (!user) {
          if (mounted) {
            setCanViewHistory(false);
            setCanAccessSettings(false);
          }
          return;
        }

        // Super admin always has access
        if (user.email === PAULO_EMAIL) {
          if (mounted) {
            setCanViewHistory(true);
            setCanAccessSettings(true);
          }
          return;
        }

        // Otherwise consult user settings (granular flags)
        const s = await getUserSettings();
        if (mounted) {
          setCanViewHistory(!!s?.can_view_history);
          setCanAccessSettings(!!s?.can_access_settings);
        }
      } catch (err) {
        console.warn("AppSidebar: failed to load user settings", err);
        if (mounted) {
          setCanViewHistory(false);
          setCanAccessSettings(false);
        }
      }
    }

    checkAccess();

    const onSettingsChanged = () => {
      checkAccess();
    };
    window.addEventListener("user_settings_changed", onSettingsChanged);

    return () => {
      mounted = false;
      window.removeEventListener("user_settings_changed", onSettingsChanged);
    };
  }, [user]);

  const menuItems = [
    {
      title: "Gerador de Propostas",
      url: "/",
      icon: LayoutTemplate,
      show: true,
    },
    {
      title: "Histórico",
      url: "/history",
      icon: HistoryIcon,
      // show only if user has been granted history access or is Paulo
      show: canViewHistory,
    },
    {
      title: "Rascunhos",
      url: "/drafts",
      icon: FileText,
      show: true,
    },
    {
      title: "Configurações",
      url: "/settings",
      icon: Settings,
      // show only if user has been granted settings access or is Paulo
      show: canAccessSettings,
    },
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  // helper to open absolute url in new tab
  const openInNewTab = (path: string) => {
    const origin = window.location.origin;
    const url = origin + path;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Centralized click handler to navigate and broadcast a global event so pages can react
  const handleMenuClick = (url: string) => {
    navigate(url);
    try {
      window.dispatchEvent(new CustomEvent("app:navigate", { detail: { path: url } }));
    } catch (err) {
      // ignore
    }
  };

  return (
    <Sidebar className="border-r">
      <SidebarHeader className="h-14 flex items-center justify-center border-b px-4">
        <button
          onClick={() => handleMenuClick("/")}
          onAuxClick={(e: any) => {
            // middle-click (button === 1) -> open in new tab
            if (e?.button === 1) {
              e.preventDefault();
              openInNewTab("/");
            }
          }}
          aria-label="Ir para Gerador de Propostas"
          className="flex items-center justify-center p-0 m-0 bg-transparent border-0"
        >
          <Logo className="h-7 w-auto object-contain" />
        </button>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-4 text-[10px] uppercase tracking-wider font-bold text-muted-foreground/60">Sistema</SidebarGroupLabel>
          <SidebarGroupContent className="px-2">
            <SidebarMenu>
              {menuItems.filter(mi => mi.show).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    onClick={() => handleMenuClick(item.url)}
                    onAuxClick={(e: any) => {
                      if (e?.button === 1) {
                        e.preventDefault();
                        openInNewTab(item.url);
                      }
                    }}
                    isActive={location.pathname === item.url}
                    tooltip={item.title}
                    className="rounded-lg px-3 py-2 transition-all duration-200 hover:bg-muted"
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="font-medium text-sm">{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 border-t bg-muted/10">
        <div className="mb-2 px-2">
          {user ? (
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="h-3 w-3 text-primary" />
              </div>
              <span className="text-xs font-medium text-muted-foreground truncate">{user.email}</span>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Não autenticado</div>
          )}
        </div>

        <SidebarMenu className="px-2">
          <SidebarMenuItem>
            <SidebarMenuButton 
              onClick={handleLogout}
              className="w-full text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-lg transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sair do sistema</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}