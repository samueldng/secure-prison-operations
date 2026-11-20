import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createAccount, setAccountActive } from "@/lib/users.functions";
import { ROLE_LABEL, type AppRole } from "@/lib/modules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [{ title: "Contas de Acesso — GESTÃO UPSTI" }, { name: "description", content: "Criação e controle de contas pela Direção." }, { property: "og:title", content: "Contas de Acesso — GESTÃO UPSTI" }, { property: "og:description", content: "Criação e controle de contas pela Direção." }] }),
  component: Usuarios,
});

const empty = { login: "", password: "", nome_completo: "", matricula: "", cargo: "", role: "servidor" as AppRole };

function Usuarios() {
  const qc = useQueryClient();
  const create = useServerFn(createAccount);
  const toggle = useServerFn(setAccountActive);
  const [form, setForm] = useState(empty);

  const list = useQuery({
    queryKey: ["contas"],
    queryFn: async () => {
      const [{ data: p, error }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("*").order("nome_completo"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (error) throw error;
      return (p ?? []).map((x) => ({ ...x, roles: (r ?? []).filter((y) => y.user_id === x.id).map((y) => y.role) }));
    },
  });

  const m = useMutation({
    mutationFn: () => create({ data: form }),
    onSuccess: (res) => { toast.success(`Conta criada: ${res.email}`); setForm(empty); qc.invalidateQueries({ queryKey: ["contas"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const t = useMutation({
    mutationFn: (v: { id: string; ativo: boolean }) => toggle({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contas"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Contas de Acesso</h1>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="grid gap-4 rounded-md border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1"><Label>Nome completo</Label><Input value={form.nome_completo} onChange={set("nome_completo")} required /></div>
        <div className="space-y-1"><Label>Usuário ou e-mail</Label><Input value={form.login} onChange={set("login")} required /></div>
        <div className="space-y-1"><Label>Senha inicial (mín. 8)</Label><Input type="password" value={form.password} onChange={set("password")} minLength={8} required /></div>
        <div className="space-y-1"><Label>Matrícula funcional</Label><Input value={form.matricula} onChange={set("matricula")} /></div>
        <div className="space-y-1"><Label>Cargo/função</Label><Input value={form.cargo} onChange={set("cargo")} /></div>
        <div className="space-y-1"><Label>Perfil</Label>
          <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as AppRole })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(ROLE_LABEL) as AppRole[]).map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2 lg:col-span-3"><Button type="submit" disabled={m.isPending}>Criar conta</Button></div>
      </form>

      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-3">Nome</th><th className="p-3">Acesso</th><th className="p-3">Matrícula</th><th className="p-3">Perfil</th><th className="p-3">Situação</th><th className="p-3" /></tr>
          </thead>
          <tbody>
            {list.data?.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-3 font-medium">{u.nome_completo || "—"}</td>
                <td className="p-3 font-mono text-xs">{u.email}</td>
                <td className="p-3">{u.matricula ?? "—"}</td>
                <td className="p-3">{u.roles.map((r) => ROLE_LABEL[r as AppRole]).join(", ") || "—"}</td>
                <td className="p-3">{u.ativo ? <Badge className="bg-success text-success-foreground">Ativa</Badge> : <Badge variant="destructive">Bloqueada</Badge>}</td>
                <td className="p-3 text-right"><Button size="sm" variant="outline" onClick={() => t.mutate({ id: u.id, ativo: !u.ativo })}>{u.ativo ? "Bloquear" : "Reativar"}</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
