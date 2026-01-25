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

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSession();

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

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b flex items-center justify-center">
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

      <SidebarFooter className="p-4 border-t bg-gray-50/50">
        <SidebarMenu>
          {user && (
            <SidebarMenuItem className="mb-2 px-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground overflow-hidden">
                <User className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{user.email}</span>
              </div>
            </SidebarMenuItem>
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