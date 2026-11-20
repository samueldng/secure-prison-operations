import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { INTERNAL_DOMAIN } from "@/lib/login";

const schema = z.object({
  login: z.string().trim().min(3).max(120),
  password: z.string().min(8).max(72),
  nome_completo: z.string().trim().min(3).max(150),
  matricula: z.string().trim().max(40).optional(),
  cargo: z.string().trim().max(80).optional(),
  role: z.enum(["diretor", "chefia", "intendencia", "servidor"]),
});

export const createAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    // Verifica no banco (com a sessão do chamador, incluindo 2FA) se é Diretor.
    const { data: ok, error: rErr } = await context.supabase.rpc("is_diretor");
    if (rErr || !ok) throw new Error("Apenas o Diretor (com 2FA ativo) pode criar contas.");

    const v = data.login.toLowerCase();
    const email = v.includes("@") ? v : `${v.replace(/[^a-z0-9._-]/g, "")}@${INTERNAL_DOMAIN}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { nome_completo: data.nome_completo },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Falha ao criar conta");
    const id = created.user.id;

    await supabaseAdmin.from("profiles").update({
      nome_completo: data.nome_completo,
      matricula: data.matricula || null,
      cargo: data.cargo || null,
    }).eq("id", id);
    const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({ user_id: id, role: data.role });
    if (roleErr) throw new Error(roleErr.message);

    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      user_role: "diretor",
      action: "CREATE",
      entity: "contas_acesso",
      entity_id: id,
      new_data: { email, role: data.role, nome_completo: data.nome_completo, matricula: data.matricula ?? null },
    });
    return { id, email };
  });

export const setAccountActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), ativo: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("is_diretor");
    if (!ok) throw new Error("Sem permissão.");
    if (data.id === context.userId) throw new Error("Você não pode desativar a própria conta.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Bloqueia login no Auth e marca o perfil
    await supabaseAdmin.auth.admin.updateUserById(data.id, { ban_duration: data.ativo ? "none" : "876000h" });
    const { error } = await context.supabase.from("profiles").update({ ativo: data.ativo }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
