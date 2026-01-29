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

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);

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

    // Fetch auth users (service role required)
    const { data: authUsers, error: authErr } = await supabase
      .from("auth.users")
      .select("id, email, created_at");

    if (authErr) {
      console.error("[list-users] auth.users select error", authErr);
      return new Response(JSON.stringify({ error: "Failed to read auth.users", detail: String(authErr) }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Fetch user_settings rows
    const { data: settingsRows, error: settingsErr } = await supabase
      .from("user_settings")
      .select("user_id, seller_name, seller_email, can_view_history, can_access_settings");

    if (settingsErr) {
      console.error("[list-users] user_settings select error", settingsErr);
      return new Response(JSON.stringify({ error: "Failed to read user_settings", detail: String(settingsErr) }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Map settings by user_id for quick lookup
    const settingsMap: Record<string, any> = {};
    (settingsRows || []).forEach((r: any) => {
      if (!r) return;
      const uid = String(r.user_id || "");
      settingsMap[uid] = r;
    });

    // Build combined list
    const combined = (authUsers || []).map((u: any) => {
      const uid = String(u.id || "");
      const s = settingsMap[uid] || null;
      return {
        user_id: uid,
        email: u.email || null,
        created_at: u.created_at || null,
        seller_name: s?.seller_name || null,
        seller_email: s?.seller_email || null,
        can_view_history: !!s?.can_view_history,
        can_access_settings: !!s?.can_access_settings,
      };
    });

    // Additionally include any user_settings rows that reference an email but no matching auth.user (edge cases)
    const extraSettings = (settingsRows || []).filter((r: any) => {
      const uid = String(r.user_id || "");
      return !(authUsers || []).some((u: any) => String(u.id) === uid);
    }).map((r: any) => ({
      user_id: r.user_id || null,
      email: r.seller_email || null,
      created_at: null,
      seller_name: r.seller_name || null,
      seller_email: r.seller_email || null,
      can_view_history: !!r.can_view_history,
      can_access_settings: !!r.can_access_settings,
    }));

    const result = [...combined, ...extraSettings];

    return new Response(JSON.stringify({ users: result }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    console.error("[list-users] unexpected error", { error: String(err) });
    return new Response(JSON.stringify({ error: "Unexpected error", detail: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});