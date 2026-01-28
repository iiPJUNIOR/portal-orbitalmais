import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const PROJECT_URL = "https://brbqsbvuitdxrtzqyopj.supabase.co";
// NOTE: Supabase Edge Functions disallow secret names that start with SUPABASE_
// Use SERVICE_ROLE_KEY (or similar) as the secret name in the Edge Functions Secrets UI.
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

if (!SERVICE_ROLE_KEY) {
  console.error("[grant-permission] SERVICE_ROLE_KEY is not set in Edge Function secrets");
}

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const body = await req.json().catch(() => null);
    const emailRaw = (body?.email || "").toString().trim().toLowerCase();
    const permission = (body?.permission || "both").toString();

    console.log("[grant-permission] request", { email: emailRaw, permission });

    if (!emailRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      return new Response(JSON.stringify({ error: "Invalid email" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (permission === "history") updates.can_view_history = true;
    else if (permission === "settings") updates.can_access_settings = true;
    else {
      updates.can_view_history = true;
      updates.can_access_settings = true;
    }

    // Try to find an existing row by seller_email (case-insensitive)
    const { data: existing, error: selectErr } = await supabase
      .from("user_settings")
      .select("*")
      .ilike("seller_email", emailRaw)
      .maybeSingle();

    if (selectErr) {
      console.error("[grant-permission] select error", { error: selectErr });
      return new Response(JSON.stringify({ error: "Database lookup failed", detail: String(selectErr) }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (existing) {
      // Update existing row (keep user_id if present)
      const payload = { ...updates };
      const { error: updateErr } = await supabase
        .from("user_settings")
        .update(payload)
        .eq("id", existing.id);

      if (updateErr) {
        console.error("[grant-permission] update error", { error: updateErr });
        return new Response(JSON.stringify({ error: "Failed to update settings", detail: String(updateErr) }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      console.log("[grant-permission] updated existing settings row", { id: existing.id });
      return new Response(JSON.stringify({ success: true, action: "updated", id: existing.id }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // No existing row — create a placeholder keyed by email (user_id left null)
    const insertPayload: any = {
      seller_email: emailRaw,
      ...updates,
      created_at: new Date().toISOString(),
    };

    const { data: inserted, error: insertErr } = await supabase
      .from("user_settings")
      .insert(insertPayload)
      .select()
      .single();

    if (insertErr) {
      console.error("[grant-permission] insert error", { error: insertErr });
      return new Response(JSON.stringify({ error: "Failed to create settings", detail: String(insertErr) }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log("[grant-permission] inserted placeholder settings row", { id: inserted.id });
    return new Response(JSON.stringify({ success: true, action: "inserted", id: inserted.id }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    console.error("[grant-permission] unexpected error", { error: String(err) });
    return new Response(JSON.stringify({ error: "Unexpected error", detail: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});