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

    // No existing settings row — attempt to resolve an auth user by email and attach.
    // Because user_settings.user_id is NOT NULL, we must supply a valid user_id that exists in auth.users.
    // We'll try to query the auth.users table (service-role key allows this).
    try {
      const { data: authUsers, error: authErr } = await supabase
        .from("auth.users")
        .select("id")
        .ilike("email", emailRaw);

      if (authErr) {
        // If we cannot query auth.users for some reason, return helpful error.
        console.error("[grant-permission] auth.users lookup error", { error: authErr });
        return new Response(JSON.stringify({
          error: "Failed to lookup auth user by email",
          detail: String(authErr),
        }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const foundUser = Array.isArray(authUsers) && authUsers.length > 0 ? (authUsers[0] as any) : null;

      if (!foundUser || !foundUser.id) {
        // No registered auth user for this email — cannot create a user_settings row because user_id is required.
        console.warn("[grant-permission] no auth user found for email", { email: emailRaw });
        return new Response(JSON.stringify({
          error: "No matching authenticated user found for the provided email",
          detail: "The user must have an authenticated account (auth.users) before permissions can be granted; ask them to sign up or create their account in Supabase first.",
        }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Build payload including resolved user_id
      const insertPayload: any = {
        user_id: foundUser.id,
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

      console.log("[grant-permission] inserted settings row attached to user", { id: inserted.id, user_id: foundUser.id });
      return new Response(JSON.stringify({ success: true, action: "inserted", id: inserted.id }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } catch (innerErr) {
      console.error("[grant-permission] unexpected error while resolving user or inserting", { error: String(innerErr) });
      return new Response(JSON.stringify({ error: "Unexpected error", detail: String(innerErr) }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  } catch (err) {
    console.error("[grant-permission] unexpected error", { error: String(err) });
    return new Response(JSON.stringify({ error: "Unexpected error", detail: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});