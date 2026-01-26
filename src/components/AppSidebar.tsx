"use client";

import React from "react";
import { 
  LayoutTemplate, 
  Settings, 
  LogOut,
  User
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
import { useTheme } from "@/contexts/ThemeProvider";
import { Switch } from "@/components/ui/switch";
import { Trash2 } from "lucide-react";

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSession();
  const { dark, logoDark, toggleDark, toggleLogoDark } = useTheme();

  const menuItems = [
    {
      title: "Gerador Acesso",
      url: "/",
      icon: LayoutTemplate,
    },
    {
      title: "Configurações",
      url: "/settings",
      icon: Settings,
    },
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const headerClass = `p-4 border-b flex items-center justify-center transition-colors ${
    logoDark ? "logo-square-dark" : ""
  }`;

  return (
    <Sidebar>
      <SidebarHeader className={headerClass}>
        <img 
          src="/logo.png" 
          alt="Control iD" 
          className="h-8 w-auto object-contain"
        />
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    onClick={() => navigate(item.url)}
                    isActive={location.pathname === item.url}
                    tooltip={item.title}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t bg-gray-50/50 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm">Modo Noturno</div>
          <Switch checked={dark} onCheckedChange={toggleDark} />
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm">Logo Escuro</div>
          <Switch checked={logoDark} onCheckedChange={toggleLogoDark} />
        </div>

        <SidebarMenu>
          {user && (
            <div className="mb-2 px-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground overflow-hidden">
                <User className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{user.email}</span>
              </div>
            </div>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton 
              onClick={handleLogout}
              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" />
              <span>Sair da conta</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}