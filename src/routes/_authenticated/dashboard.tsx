import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { 
  Users, AlertTriangle, Building2, Shield, History, 
  CalendarDays, Truck, CheckCircle2, Clock, ArrowRight, ShieldAlert 
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { meQuery } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/modules";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard Operacional — GESTÃO UPSTI" },
      { name: "description", content: "Visão operacional integrada da Unidade Prisional de Santa Inês." },
      { property: "og:title", content: "Dashboard Operacional — GESTÃO UPSTI" },
    ],
  }),
  component: Dashboard,
});

interface StatCardProps {
  icon: any;
  label: string;
  value: string | number;
  hint: string;
  badge?: string;
  badgeVariant?: "default" | "destructive" | "outline";
  to?: string;
}

function StatCard({ icon: Icon, label, value, hint, badge, badgeVariant = "outline", to }: StatCardProps) {
  const content = (
    <div className="rounded-lg border bg-card p-4.5 shadow-xs hover:border-primary/40 transition-all flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span>{label}</span>
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <div className="text-3xl font-bold font-mono tracking-tight text-foreground">{value}</div>
          {badge && <Badge variant={badgeVariant} className="text-[10px]">{badge}</Badge>}
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
        <span>{hint}</span>
        {to && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60" />}
      </div>
    </div>
  );

  return to ? <Link to={to as any} className="block">{content}</Link> : content;
}

function Dashboard() {
  const me = useQuery(meQuery).data;
  const role = me?.role ?? null;
  const userId = me?.user?.id ?? "";

  const isDiretor = role === "diretor";
  const isChefia = role === "chefia";
  const isIntendencia = role === "intendencia";
  const isServidor = role === "servidor";
  const canManage = isDiretor || isChefia;

  const todayStr = new Date().toISOString().split("T")[0];

  // 1. Efetivo Escalado Hoje
  const { data: escaladosHoje = 0 } = useQuery({
    queryKey: ["dash-escalados-hoje", todayStr],
    queryFn: async () => {
      const { count } = await supabase
        .from("escalas_plantao" as any)
        .select("id", { count: "exact", head: true })
        .eq("data", todayStr);
      return count ?? 0;
    },
  });

  // 2. Servidores Ativos Totais
  const { data: totalServidores = 0 } = useQuery({
    queryKey: ["dash-servidores-total"],
    enabled: canManage,
    queryFn: async () => {
      const { count } = await supabase
        .from("servidores" as any)
        .select("id", { count: "exact", head: true })
        .eq("status", "Ativo");
      return count ?? 0;
    },
  });

  // 3. Pendências Totais de Autorização (Diretor / Chefia)
  const { data: pendencias = { total: 0, folgas: 0, permutas: 0, missoes: 0, ops: 0 } } = useQuery({
    queryKey: ["dash-pendencias-autorizacao"],
    enabled: canManage,
    queryFn: async () => {
      const [folgasRes, permutasRes, missoesRes, opsRes] = await Promise.all([
        supabase.from("folgas_ledger" as any).select("id", { count: "exact", head: true }).eq("status", "Pendente"),
        supabase.from("permutas" as any).select("id", { count: "exact", head: true }).eq("status", "Aceita"),
        supabase.from("missoes_externas" as any).select("id", { count: "exact", head: true }).eq("status", "Solicitada"),
        supabase.from("operacoes_judiciais" as any).select("id", { count: "exact", head: true }).eq("status", "Programada"),
      ]);

      const f = folgasRes.count ?? 0;
      const p = permutasRes.count ?? 0;
      const m = missoesRes.count ?? 0;
      const o = opsRes.count ?? 0;

      return {
        total: f + p + m + o,
        folgas: f,
        permutas: p,
        missoes: m,
        ops: o,
      };
    },
  });

  // 4. Ocupação de Celas (Diretor)
  const { data: ocupacaoCarceraria = { ocupados: 0, capacidade: 88, taxa: 0 } } = useQuery({
    queryKey: ["dash-ocupacao-celas"],
    enabled: isDiretor,
    queryFn: async () => {
      const [{ count: ocupados }, { data: celas }] = await Promise.all([
        supabase.from("internos" as any).select("id", { count: "exact", head: true }).eq("status", "Custodiado"),
        supabase.from("celas" as any).select("capacidade"),
      ]);
      const cap = (celas || []).reduce((acc: number, c: any) => acc + (c.capacidade || 4), 0) || 88;
      const o = ocupados ?? 0;
      const taxa = cap > 0 ? Math.round((o / cap) * 100) : 0;
      return { ocupados: o, capacidade: cap, taxa };
    },
  });

  // 5. Armamentos Cautelados e Atrasos (Diretor / Intendência)
  const { data: dadosBelicos = { cautelados: 0, atrasados: 0 } } = useQuery({
    queryKey: ["dash-dados-belicos"],
    enabled: isDiretor || isIntendencia,
    queryFn: async () => {
      const { data: cautelas } = await supabase
        .from("cautelas_armamento" as any)
        .select("id, status, data_devolucao_prevista")
        .eq("status", "Ativa");

      const now = Date.now();
      const cautelados = cautelas?.length ?? 0;
      const atrasados =
        cautelas?.filter((c: any) => c.data_devolucao_prevista && new Date(c.data_devolucao_prevista).getTime() < now).length ?? 0;

      return { cautelados, atrasados };
    },
  });

  // 6. Dados do Servidor Logado (Próximo Plantão e Saldo de Folgas)
  const { data: servidorMe } = useQuery({
    queryKey: ["dash-me-servidor", userId],
    enabled: isServidor,
    queryFn: async () => {
      const { data: srv } = await supabase.from("servidores" as any).select("*").eq("user_id", userId).maybeSingle();
      if (!srv) return null;

      const [escalaRes, folgasRes] = await Promise.all([
        supabase
          .from("escalas_plantao" as any)
          .select("*")
          .eq("servidor_id", srv.id)
          .gte("data", todayStr)
          .order("data", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase.from("folgas_ledger" as any).select("tipo, horas, status").eq("servidor_id", srv.id),
      ]);

      let saldoHoras = 0;
      (folgasRes.data || []).forEach((fl: any) => {
        if (fl.status === "Aprovada") {
          if (fl.tipo === "credito") saldoHoras += Number(fl.horas);
          if (fl.tipo === "debito") saldoHoras -= Number(fl.horas);
        }
      });

      return {
        servidor: srv,
        proximoPlantao: escalaRes.data,
        saldoFolgas: Math.max(0, saldoHoras),
        folgasProntas: Math.floor(Math.max(0, saldoHoras) / 12),
      };
    },
  });

  // 7. Operações e Escoltas de Hoje
  const { data: operacoesHoje = [] } = useQuery({
    queryKey: ["dash-operacoes-hoje", todayStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("operacoes_judiciais" as any)
        .select("*")
        .gte("data_programada", `${todayStr}T00:00:00`)
        .lte("data_programada", `${todayStr}T23:59:59`)
        .order("data_programada", { ascending: true });
      return data || [];
    },
  });

  // 8. Últimos Registros de Auditoria (Diretor)
  const { data: logsRecentes = [] } = useQuery({
    queryKey: ["audit-recent-dash"],
    enabled: isDiretor,
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_logs")
        .select("id, action, entity, user_role, created_at")
        .order("created_at", { ascending: false })
        .limit(6);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Unidade e Boas-Vindas */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">
              Olá, {me?.profile?.nome_completo?.split(" ")[0] || "servidor"}
            </h1>
            <Badge variant="outline" className="text-xs bg-muted">
              {role ? ROLE_LABEL[role] : "—"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}{" "}
            • Unidade Prisional de Santa Inês (UPSTI)
          </p>
        </div>

        <div className="flex items-center gap-2 mt-2 sm:mt-0">
          <Link to={"/modulo/escalas" as any}>
            <Button variant="outline" size="sm" className="text-xs">
              <CalendarDays className="mr-1.5 h-3.5 w-3.5" /> Ver Escala de Hoje
            </Button>
          </Link>
        </div>
      </div>

      {/* Grid de KPIs Operacionais Dinâmicos */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {canManage && (
          <StatCard
            icon={Users}
            label="Plantão de Hoje"
            value={escaladosHoje}
            hint="Efetivo escalado na data de hoje"
            badge={`${totalServidores} ativos no total`}
            to="/modulo/escalas"
          />
        )}

        {canManage && (
          <StatCard
            icon={AlertTriangle}
            label="Pendências de Autorização"
            value={pendencias.total}
            hint={pendencias.total > 0 ? "Requer decisão da Direção" : "Nenhuma pendência"}
            badge={pendencias.total > 0 ? "Ação Requerida" : "Em dia"}
            badgeVariant={pendencias.total > 0 ? "destructive" : "default"}
            to="/modulo/folgas"
          />
        )}

        {isDiretor && (
          <StatCard
            icon={Building2}
            label="Ocupação de Celas"
            value={`${ocupacaoCarceraria.ocupados}/${ocupacaoCarceraria.capacidade}`}
            hint={`Taxa de ocupação: ${ocupacaoCarceraria.taxa}% (Blocos A e B)`}
            badge={ocupacaoCarceraria.taxa > 100 ? "Superlotação" : "Capacidade"}
            badgeVariant={ocupacaoCarceraria.taxa > 100 ? "destructive" : "outline"}
            to="/modulo/blocos"
          />
        )}

        {(isDiretor || isIntendencia) && (
          <StatCard
            icon={Shield}
            label="Armamento Cautelado"
            value={dadosBelicos.cautelados}
            hint={
              dadosBelicos.atrasados > 0
                ? `${dadosBelicos.atrasados} devolução(ões) em atraso!`
                : "Cautelas dentro do prazo"
            }
            badge={dadosBelicos.atrasados > 0 ? "Atrasos" : "Normal"}
            badgeVariant={dadosBelicos.atrasados > 0 ? "destructive" : "outline"}
            to="/modulo/intendencia"
          />
        )}

        {isServidor && (
          <StatCard
            icon={CalendarDays}
            label="Meu Próximo Plantão"
            value={servidorMe?.proximoPlantao?.data ? new Date(servidorMe.proximoPlantao.data + "T00:00:00").toLocaleDateString("pt-BR") : "Aguardando escala"}
            hint={servidorMe?.proximoPlantao?.turno ? `Turno: ${servidorMe.proximoPlantao.turno}` : "Consulte a chefia"}
            to="/modulo/escalas"
          />
        )}

        {isServidor && (
          <StatCard
            icon={Clock}
            label="Saldo de Folgas"
            value={`${servidorMe?.saldoFolgas || 0}h`}
            hint={`${servidorMe?.folgasProntas || 0} folga(s) de 12h disponíveis`}
            badge="Banco de Folgas"
            to="/modulo/folgas"
          />
        )}
      </div>

      {/* Seção Central: Agenda do Dia e Pendências Rápidas */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Operações e Escoltas de Hoje */}
        <div className={canManage ? "lg:col-span-7 space-y-4" : "lg:col-span-12 space-y-4"}>
          <div className="rounded-lg border bg-card overflow-hidden shadow-xs">
            <div className="p-4 border-b bg-muted/40 flex items-center justify-between">
              <h2 className="text-sm font-bold flex items-center gap-2">
                <Truck className="h-4 w-4 text-primary" /> Operações Judiciais e Escoltas do Dia
              </h2>
              <Link to={"/modulo/escoltas" as any} className="text-xs text-primary hover:underline">
                Ver Agenda Completa
              </Link>
            </div>
            <div className="p-4 space-y-3">
              {operacoesHoje.map((op: any) => (
                <div key={op.id} className="p-3 rounded-md border bg-muted/20 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-foreground flex items-center gap-2">
                      <span>{op.tipo}</span>
                      <StatusBadge status={op.status} size="sm" />
                    </div>
                    <div className="text-muted-foreground mt-0.5">Destino: {op.unidade_destino} • Proc: {op.numero_processo}</div>
                    <div className="text-[11px] font-mono text-muted-foreground">
                      Horário: {new Date(op.data_programada).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <Link to={"/modulo/escoltas" as any}>
                    <Button variant="outline" size="sm" className="h-7 text-xs">Detalhes</Button>
                  </Link>
                </div>
              ))}
              {operacoesHoje.length === 0 && (
                <p className="text-muted-foreground text-xs text-center py-6">
                  Nenhuma escolta ou audiência judicial programada para hoje.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Resumo de Pendências Operacionais (Diretor / Chefia) */}
        {canManage && (
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-lg border bg-card p-4 shadow-xs space-y-3">
              <h2 className="text-sm font-bold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" /> Pendências Aguardando Despacho
              </h2>
              <div className="space-y-2 text-xs">
                <Link
                  to={"/modulo/folgas" as any}
                  className="flex items-center justify-between p-2.5 rounded-md border bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <span>Solicitações de Folga / Gozo</span>
                  <Badge variant={pendencias.folgas > 0 ? "destructive" : "outline"}>
                    {pendencias.folgas} pendente(s)
                  </Badge>
                </Link>

                <Link
                  to={"/modulo/permutas" as any}
                  className="flex items-center justify-between p-2.5 rounded-md border bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <span>Permutas Aceitas (Aguardando Direção)</span>
                  <Badge variant={pendencias.permutas > 0 ? "destructive" : "outline"}>
                    {pendencias.permutas} pendente(s)
                  </Badge>
                </Link>

                <Link
                  to={"/modulo/missoes" as any}
                  className="flex items-center justify-between p-2.5 rounded-md border bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <span>Missões Externas Solicitadas</span>
                  <Badge variant={pendencias.missoes > 0 ? "destructive" : "outline"}>
                    {pendencias.missoes} pendente(s)
                  </Badge>
                </Link>

                <Link
                  to={"/modulo/escoltas" as any}
                  className="flex items-center justify-between p-2.5 rounded-md border bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <span>Operações Judiciais Programadas</span>
                  <Badge variant={pendencias.ops > 0 ? "destructive" : "outline"}>
                    {pendencias.ops} pendente(s)
                  </Badge>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Auditoria Recente Imutável (Exclusivo Diretor) */}
      {isDiretor && (
        <div className="rounded-lg border bg-card overflow-hidden shadow-xs">
          <div className="flex items-center justify-between border-b p-4 bg-muted/30">
            <h2 className="flex items-center gap-2 font-semibold text-sm">
              <History className="h-4 w-4 text-primary" /> Trilha de Auditoria Recente (Append-Only)
            </h2>
            <Link to="/auditoria" className="text-xs text-primary underline">
              Ver trilha completa
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 uppercase font-semibold text-muted-foreground border-b">
                <tr>
                  <th className="p-3">Data / Hora</th>
                  <th className="p-3">Ação</th>
                  <th className="p-3">Entidade Afetada</th>
                  <th className="p-3">Perfil Responsável</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logsRecentes.map((r: any) => (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="p-3 font-mono text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {r.action}
                      </Badge>
                    </td>
                    <td className="p-3 font-mono text-foreground font-medium">{r.entity}</td>
                    <td className="p-3 text-muted-foreground">{r.user_role || "sistema"}</td>
                  </tr>
                ))}
                {logsRecentes.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground">
                      Nenhum registro recente de auditoria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
