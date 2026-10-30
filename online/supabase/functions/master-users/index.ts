import { createClient } from "npm:@supabase/supabase-js@2";

// Configure the exact browser origin(s) in Supabase Edge Function secrets.
// Local default is intentionally limited to the Vite loopback URL; set
// FAVMED_ALLOWED_ORIGIN to the approved deployed app origin before production.
const appUrl = (Deno.env.get("FAVMED_APP_URL") || "https://favmed.vercel.app").trim().replace(/\/$/, "");
const configuredOrigin = (Deno.env.get("FAVMED_ALLOWED_ORIGIN") || "").trim().replace(/\/$/, "");
const allowedOrigin = configuredOrigin.startsWith("https://") ? configuredOrigin : appUrl;
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Vary": "Origin",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedRoles = new Set(["recepcao", "profissional"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req: Request) => {
  const requestOrigin = req.headers.get("Origin");
  if (requestOrigin && requestOrigin !== allowedOrigin) {
    return new Response(JSON.stringify({ error: "Origem não autorizada." }), {
      status: 403,
      headers: { "Content-Type": "application/json; charset=utf-8", "Vary": "Origin" },
    });
  }
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL");

  // Modern Supabase keys are injected as JSON dictionaries keyed by key name.
  // Prefer modern keys; retain legacy fallbacks during the migration window.
  function readKeySet(variable: string): Record<string, string> {
    const raw = Deno.env.get(variable);
    if (!raw) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, string] =>
          typeof entry[1] === "string" && entry[1].length > 0
        ),
      );
    } catch {
      return {};
    }
  }

  const publishableKeys = readKeySet("SUPABASE_PUBLISHABLE_KEYS");
  const secretKeys = readKeySet("SUPABASE_SECRET_KEYS");
  const anonKey = publishableKeys["default"] || Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = secretKeys["default"] || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !anonKey || !serviceRoleKey) {
    return json({ error: "Configuração administrativa incompleta." }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json({ error: "Autenticação necessária." }, 401);

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Authorization is read from the protected database profile, never user_metadata.
  const { data: caller, error: callerError } = await admin
    .from("profiles")
    .select("role, active")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (callerError) return json({ error: "Não foi possível validar as permissões." }, 500);
  if (!caller || caller.role !== "master" || caller.active !== true) {
    return json({ error: "Apenas o Master ativo pode administrar contas." }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo da requisição inválido." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Corpo da requisição inválido." }, 400);
  }

  if (body.action === "list_users") {
    const { data: profiles, error: listError } = await admin
      .from("profiles")
      .select("id, display_name, role, active, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (listError) return json({ error: "Não foi possível listar as contas." }, 500);
    return json({ users: profiles ?? [] });
  }

  if (body.action === "create_user") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
    const role = typeof body.role === "string" ? body.role : "";

    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Informe um e-mail válido." }, 400);
    }
    if (!displayName || displayName.length > 120) {
      return json({ error: "Informe um nome entre 1 e 120 caracteres." }, 400);
    }
    if (!allowedRoles.has(role)) {
      return json({ error: "Perfil inválido. O Master inicial não pode ser criado por esta tela." }, 400);
    }

    const { data: created, error: createError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${appUrl}/` });
    if (createError || !created.user) {
      const errorText = (createError?.message || "").toLowerCase();
      const errorCode = String((createError as { code?: string } | null)?.code || "").toLowerCase();
      const errorStatus = Number((createError as { status?: number } | null)?.status || 0);

      // Do not automatically retry invite sends: Auth email limits are shared
      // and repeated attempts can extend the cooldown.
      if (
        errorStatus === 429 ||
        errorCode.includes("rate_limit") ||
        errorText.includes("rate limit") ||
        errorText.includes("too many requests")
      ) {
        return json({
          error: "Limite de envio de e-mails atingido. Não tente novamente agora. Aguarde o período de liberação do Supabase Auth e confira a configuração SMTP antes de reenviar.",
          code: "INVITE_RATE_LIMITED",
        }, 429);
      }

      if (
        errorStatus === 422 ||
        errorCode.includes("already") ||
        errorText.includes("already been registered") ||
        errorText.includes("already registered") ||
        errorText.includes("already exists")
      ) {
        return json({
          error: "Este e-mail já possui uma conta no Supabase Auth. Atualize a lista de usuários e confira o cadastro existente antes de tentar novamente.",
          code: "INVITE_EMAIL_EXISTS",
        }, 409);
      }

      return json({ error: "Não foi possível enviar o convite. Confira se o e-mail já existe e consulte os limites/configuração SMTP do Supabase." }, 400);
    }

    const { error: profileError } = await admin.from("profiles").insert({
      id: created.user.id,
      display_name: displayName,
      role,
      active: true,
    });

    if (profileError) {
      // Avoid leaving an Auth account without its authorization profile.
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: "Não foi possível criar o perfil; a conta incompleta foi revertida." }, 500);
    }

    return json({ user: { id: created.user.id, email, display_name: displayName, role, active: true } }, 201);
  }

  if (body.action === "set_active") {
    const targetId = typeof body.user_id === "string" ? body.user_id : "";
    const active = body.active;
    if (!targetId || typeof active !== "boolean") {
      return json({ error: "Informe user_id e active (boolean)." }, 400);
    }
    if (targetId === userData.user.id && active === false) {
      return json({ error: "Você não pode bloquear a própria conta Master." }, 400);
    }

    const { data: target, error: targetError } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", targetId)
      .maybeSingle();

    if (targetError) return json({ error: "Não foi possível localizar o perfil." }, 500);
    if (!target) return json({ error: "Perfil não encontrado." }, 404);
    if (target.role === "master") {
      return json({ error: "O bloqueio de contas Master exige um procedimento administrativo separado." }, 403);
    }

    // Ban/unban through Auth Admin so the account cannot start or refresh a session
    // while disabled. Existing access JWTs may remain valid until expiry, so every
    // future operational table must also enforce profiles.active in its RLS policies.
    if (active) {
      const { error: unbanError } = await admin.auth.admin.updateUserById(targetId, {
        ban_duration: "none",
      });
      if (unbanError) return json({ error: "Não foi possível reativar a autenticação da conta." }, 500);

      const { error: activateError } = await admin
        .from("profiles")
        .update({ active: true, updated_at: new Date().toISOString() })
        .eq("id", targetId);

      if (activateError) {
        await admin.auth.admin.updateUserById(targetId, { ban_duration: "876000h" });
        return json({ error: "Não foi possível ativar o perfil; a autenticação permaneceu bloqueada." }, 500);
      }
    } else {
      const { error: deactivateError } = await admin
        .from("profiles")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("id", targetId);

      if (deactivateError) return json({ error: "Não foi possível desativar o perfil." }, 500);

      const { error: banError } = await admin.auth.admin.updateUserById(targetId, {
        ban_duration: "876000h",
      });
      if (banError) {
        await admin.from("profiles")
          .update({ active: true, updated_at: new Date().toISOString() })
          .eq("id", targetId);
        return json({ error: "Não foi possível bloquear a autenticação; o perfil foi restaurado como ativo." }, 500);
      }
    }

    return json({ user_id: targetId, active });
  }

  return json({ error: "Ação não reconhecida." }, 400);
});
