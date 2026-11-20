import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/auditoria")({
  head: () => ({ meta: [{ title: "Auditoria — GESTÃO UPSTI" }, { name: "description", content: "Registro imutável de ações no sistema." }, { property: "og:title", content: "Auditoria — GESTÃO UPSTI" }, { property: "og:description", content: "Registro imutável de ações no sistema." }] }),
  component: Auditoria,
});

const tone: Record<string, string> = {
  CREATE: "bg-success text-success-foreground", UPDATE: "bg-info text-info-foreground",
  DELETE: "bg-destructive text-destructive-foreground", AUTHORIZE: "bg-primary text-primary-foreground", CANCEL: "bg-warning text-warning-foreground",
};

function Auditoria() {
  const [f, setF] = useState("");
  const q = useQuery({
    queryKey: ["audit", f],
    queryFn: async () => {
      let s = supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200);
      if (f) s = s.ilike("entity", `%${f}%`);
      const { data, error } = await s;
      if (error) throw error;
      return data;
    },
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Auditoria</h1><p className="text-sm text-muted-foreground">Registros somente-inclusão; não podem ser alterados nem apagados.</p></div>
        <Input placeholder="Filtrar por entidade…" value={f} onChange={(e) => setF(e.target.value)} className="max-w-xs" />
      </div>
      {q.error && <p className="text-sm text-destructive">Sem permissão para consultar a auditoria.</p>}
      <div className="space-y-2">
        {q.data?.map((l) => (
          <details key={l.id} className="rounded-md border bg-card p-3 text-sm">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2">
              <Badge className={tone[l.action]}>{l.action}</Badge>
              <span className="font-mono">{l.entity}</span>
              <span className="text-muted-foreground">{l.user_role ?? "sistema"}</span>
              <span className="ml-auto font-mono text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString("pt-BR")}</span>
            </summary>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <pre className="overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(l.old_data, null, 2)}</pre>
              <pre className="overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(l.new_data, null, 2)}</pre>
            </div>
          </details>
        ))}
        {q.data?.length === 0 && <p className="text-sm text-muted-foreground">Nenhum registro.</p>}
      </div>
    </div>
  );
}
