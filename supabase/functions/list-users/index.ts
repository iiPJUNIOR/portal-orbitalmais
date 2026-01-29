import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const PROJECT_URL = "https://brbqsbvuitdxrtzqyopj.supabase.co";
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

if (!SERVICE_ROLE_KEY) {
  console.error("[list-users] SERVICE_ROLE_KEY is not set in Edge Function secrets");
}

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "GET") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Use the proper Admin API to list users
    const { data: { users: authUsers }, error: authErr } = await supabase.auth.admin.listUsers();

    if (authErr) {
      console.error("[list-users] auth.admin.listUsers error", authErr);
      return new Response(JSON.stringify({ error: "Failed to read auth users", detail: String(authErr) }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Fetch user_settings rows from public schema
    const { data: settingsRows, error: settingsErr } = await supabase
      .from("user_settings")
      .select("user_id, seller_name, seller_email, can_view_history, can_access_settings");

    if (settingsErr) {
      console.error("[list-users] user_settings select error", settingsErr);
    }

    const settingsMap: Record<string, any> = {};
    (settingsRows || []).forEach((r: any) => {
      if (!r) return;
      const uid = String(r.user_id || "");
      settingsMap[uid] = r;
    });

    // Combine auth users with their specific settings
    const result = (authUsers || []).map((u: any) => {
      const s = settingsMap[u.id] || null;
      return {
        user_id: u.id,
        email: u.email,
        created_at: u.created_at,
        seller_name: s?.seller_name || null,
        seller_email: s?.seller_email || u.email,
        can_view_history: !!s?.can_view_history,
        can_access_settings: !!s?.can_access_settings,
      };
    });

    return new Response(JSON.stringify({ users: result }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    console.error("[list-users] unexpected error", String(err));
    return new Response(JSON.stringify({ error: "Unexpected error", detail: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});