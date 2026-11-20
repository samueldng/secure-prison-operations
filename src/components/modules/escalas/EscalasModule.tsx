import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  CalendarDays, ChevronLeft, ChevronRight, Wand2, CheckSquare, 
  Users, UserCheck, AlertTriangle, ShieldAlert, Clock, Filter, Plus
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { Servidor, EscalaPlantao } from "@/types/app-types";

interface EscalasModuleProps {
  userRole: "diretor" | "chefia" | "intendencia" | "servidor" | null;
  userId: string;
}

export function EscalasModule({ userRole, userId }: EscalasModuleProps) {
  const qc = useQueryClient();
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1); // 1-12
  const [selectedDay, setSelectedDay] = useState<number>(today.getDate());
  const [selectedTurno, setSelectedTurno] = useState<"Diurno" | "Noturno">("Diurno");
  const [selectedEquipeFilter, setSelectedEquipeFilter] = useState<string>("todos");
  const [generatorModalOpen, setGeneratorModalOpen] = useState(false);
  const [genEquipe, setGenEquipe] = useState<"Alpha" | "Beta">("Alpha");
  const [genRegime, setGenRegime] = useState<"24x72" | "12x36">("24x72");
  const [genPrimeiroDia, setGenPrimeiroDia] = useState<number>(1);

  const canManage = userRole === "diretor" || userRole === "chefia";

  // Buscar todos os servidores ativos
  const { data: servidores = [] } = useQuery({
    queryKey: ["servidores-ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("servidores" as any)
        .select("*")
        .order("nome_completo");
      if (error) return [];
      return (data || []) as Servidor[];
    },
  });

  // Mês formatado YYYY-MM
  const monthStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
  const startDateStr = `${monthStr}-01`;
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const endDateStr = `${monthStr}-${String(daysInMonth).padStart(2, "0")}`;

  // Buscar escalas do mês
  const { data: escalas = [], isLoading } = useQuery({
    queryKey: ["escalas-mes", monthStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("escalas_plantao" as any)
        .select("*, servidor:servidores(*)")
        .gte("data", startDateStr)
        .lte("data", endDateStr);
      if (error) return [];
      return (data || []) as EscalaPlantao[];
    },
  });

  // Buscar afastamentos (férias, atestados) do mês para detectar indisponibilidade
  const { data: afastamentos = [] } = useQuery({
    queryKey: ["afastamentos-mes", monthStr],
    queryFn: async () => {
      const [feriasRes, atestadosRes] = await Promise.all([
        supabase.from("ferias_licencas" as any).select("*").in("status", ["Aprovada", "Em Vigor"]),
        supabase.from("atestados" as any).select("*"),
      ]);
      const list: Array<{ servidor_id: string; data_inicio: string; data_fim: string; motivo: string }> = [];
      (feriasRes.data || []).forEach((f: any) => {
        list.push({ servidor_id: f.servidor_id, data_inicio: f.data_inicio, data_fim: f.data_fim, motivo: f.tipo });
      });
      (atestadosRes.data || []).forEach((a: any) => {
        const start = new Date(a.data_inicio);
        const end = new Date(start);
        end.setDate(end.getDate() + (a.dias_afastamento || 1) - 1);
        list.push({
          servidor_id: a.servidor_id,
          data_inicio: a.data_inicio,
          data_fim: end.toISOString().split("T")[0],
          motivo: `Atestado (${a.cid || "Médico"})`,
        });
      });
      return list;
    },
  });

  // Mutação para atualizar status da escala (Presença / Ausência)
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: EscalaPlantao["status"] }) => {
      const { error } = await supabase
        .from("escalas_plantao" as any)
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Presença atualizada com sucesso.");
      qc.invalidateQueries({ queryKey: ["escalas-mes"] });
    },
  });

  // Mutação: Gerador de Projeção Mensal
  const gerarProjecaoMutation = useMutation({
    mutationFn: async () => {
      // Filtrar servidores da equipe selecionada
      const alvos = servidores.filter(
        (s) => s.equipe === genEquipe && s.regime_escala === genRegime && s.status === "Ativo"
      );

      if (alvos.length === 0) {
        throw new Error(`Nenhum servidor ativo encontrado na Equipe ${genEquipe} com regime ${genRegime}.`);
      }

      const novasEscalas: any[] = [];
      const intervalDays = genRegime === "24x72" ? 4 : 2; // 24x72 = a cada 4 dias, 12x36 = a cada 2 dias

      for (let day = genPrimeiroDia; day <= daysInMonth; day += intervalDays) {
        const dStr = `${monthStr}-${String(day).padStart(2, "0")}`;
        alvos.forEach((srv) => {
          novasEscalas.push({
            servidor_id: srv.id,
            data: dStr,
            turno: srv.turno_padrao || "Diurno",
            tipo: "Regular",
            status: "Escalado",
          });
        });
      }

      const { error } = await supabase
        .from("escalas_plantao" as any)
        .upsert(novasEscalas, { onConflict: "servidor_id,data,turno" });

      if (error) throw error;
      return novasEscalas.length;
    },
    onSuccess: (count) => {
      toast.success(`Projeção mensal gerada: ${count} plantões projetados.`);
      qc.invalidateQueries({ queryKey: ["escalas-mes"] });
      setGeneratorModalOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao gerar projeção");
    },
  });

  const selectedDateStr = `${monthStr}-${String(selectedDay).padStart(2, "0")}`;

  // Cálculos do dia selecionado
  const plantaoDia = useMemo(() => {
    return escalas.filter((e) => e.data === selectedDateStr && e.turno === selectedTurno);
  }, [escalas, selectedDateStr, selectedTurno]);

  const escaladosIds = new Set(plantaoDia.map((p) => p.servidor_id));

  // Ausências no dia selecionado (férias/licença/atestado)
  const ausentesNoDia = useMemo(() => {
    const list: Array<{ servidor: Servidor; motivo: string }> = [];
    afastamentos.forEach((af) => {
      if (selectedDateStr >= af.data_inicio && selectedDateStr <= af.data_fim) {
        const srv = servidores.find((s) => s.id === af.servidor_id);
        if (srv && !list.some((item) => item.servidor.id === srv.id)) {
          list.push({ servidor: srv, motivo: af.motivo });
        }
      }
    });
    return list;
  }, [afastamentos, selectedDateStr, servidores]);

  const ausentesIds = new Set(ausentesNoDia.map((a) => a.servidor.id));

  // Servidores disponíveis para cobertura (ativos, não escalados e sem afastamento no dia)
  const disponiveisParaCobertura = useMemo(() => {
    return servidores.filter(
      (s) => s.status === "Ativo" && !escaladosIds.has(s.id) && !ausentesIds.has(s.id)
    );
  }, [servidores, escaladosIds, ausentesIds]);

  const prevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const monthName = new Date(currentYear, currentMonth - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CalendarDays}
        title="Escalas, Plantões e Painel de Efetivo"
        description="Controle mensal segregado por Equipes Alpha/Beta, plantões 24x72 e 12x36, com checagem de presença."
        actions={
          canManage && (
            <Button onClick={() => setGeneratorModalOpen(true)} className="bg-primary text-primary-foreground">
              <Wand2 className="mr-2 h-4 w-4" /> Gerar Projeção Mensal
            </Button>
          )
        }
      />

      {/* Controles de Mês e Filtros Rápidos */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-4 rounded-lg border shadow-xs">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-bold text-base capitalize min-w-40 text-center">{monthName}</span>
          <Button variant="outline" size="icon" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Filtro Equipe:</span>
            <Select value={selectedEquipeFilter} onValueChange={setSelectedEquipeFilter}>
              <SelectTrigger className="h-8 text-xs w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                <SelectItem value="Alpha">Equipe Alpha</SelectItem>
                <SelectItem value="Beta">Equipe Beta</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Grid de Dias do Calendário Mensal */}
      <div className="rounded-lg border bg-card p-4 shadow-xs">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Selecione o Dia para Visualização Operacional ({daysInMonth} dias)
        </h3>
        <div className="grid grid-cols-7 sm:grid-cols-10 md:grid-cols-16 gap-1.5 text-center">
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
            const dateStr = `${monthStr}-${String(d).padStart(2, "0")}`;
            const totalEscalados = escalas.filter((e) => e.data === dateStr).length;
            const isToday =
              today.getFullYear() === currentYear &&
              today.getMonth() + 1 === currentMonth &&
              today.getDate() === d;
            const isSelected = selectedDay === d;

            return (
              <button
                key={d}
                onClick={() => setSelectedDay(d)}
                className={`flex flex-col items-center justify-center p-2 rounded-md border text-xs transition-all ${
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary font-bold shadow-xs scale-105"
                    : isToday
                    ? "border-info/80 bg-info/10 text-foreground font-semibold"
                    : "border-border bg-card/60 hover:bg-muted text-foreground"
                }`}
              >
                <span>{d}</span>
                <span
                  className={`text-[10px] mt-0.5 px-1 rounded ${
                    isSelected ? "bg-primary-foreground/20 text-white" : "text-muted-foreground font-mono"
                  }`}
                >
                  {totalEscalados > 0 ? `${totalEscalados}p` : "—"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Painel Operacional do Plantão do Dia Selecionado */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              Plantão de {new Date(selectedDateStr + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
            </h2>
            <p className="text-xs text-muted-foreground">Efetivo escalado, registro de presença e disponibilidade para cobertura.</p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={selectedTurno === "Diurno" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedTurno("Diurno")}
              className="text-xs"
            >
              Turno Diurno
            </Button>
            <Button
              variant={selectedTurno === "Noturno" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedTurno("Noturno")}
              className="text-xs"
            >
              Turno Noturno
            </Button>
          </div>
        </div>

        {/* Resumo em Cards das Forças */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border bg-card p-3.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Efetivo Escalado</span>
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-1 text-2xl font-bold">{plantaoDia.length}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Policiais designados</div>
          </div>

          <div className="rounded-md border bg-card p-3.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Efetivo Presente</span>
              <UserCheck className="h-4 w-4 text-success" />
            </div>
            <div className="mt-1 text-2xl font-bold text-success">
              {plantaoDia.filter((p) => p.status === "Presente").length}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Confirmados no posto</div>
          </div>

          <div className="rounded-md border bg-card p-3.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Ausências no Dia</span>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            <div className="mt-1 text-2xl font-bold text-destructive">
              {ausentesNoDia.length}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Férias / Atestados</div>
          </div>

          <div className="rounded-md border bg-card p-3.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Livres para Cobertura</span>
              <Clock className="h-4 w-4 text-info" />
            </div>
            <div className="mt-1 text-2xl font-bold text-info">
              {disponiveisParaCobertura.length}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">De folga sem impedimento</div>
          </div>
        </div>

        {/* Listas do Dia: Escalados + Cobertura */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Tabela de Escalados no Turno */}
          <div className="lg:col-span-8 rounded-lg border bg-card overflow-hidden shadow-xs">
            <div className="p-3 bg-muted/50 border-b flex items-center justify-between">
              <h3 className="font-semibold text-sm">Escalados no Plantão ({selectedTurno})</h3>
              <span className="text-xs text-muted-foreground">{plantaoDia.length} servidor(es)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/30 text-xs uppercase font-semibold text-muted-foreground border-b">
                  <tr>
                    <th className="p-3">Servidor</th>
                    <th className="p-3">Equipe</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">Status</th>
                    {canManage && <th className="p-3 text-right">Confirmar Presença</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {plantaoDia.map((e) => (
                    <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <div className="font-medium text-foreground">{e.servidor?.nome_completo || "Servidor"}</div>
                        <div className="text-xs text-muted-foreground font-mono">{e.servidor?.matricula_funcional}</div>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-xs">
                          {e.servidor?.equipe || "—"}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs">{e.tipo}</td>
                      <td className="p-3">
                        <StatusBadge status={e.status} size="sm" />
                      </td>
                      {canManage && (
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {e.status !== "Presente" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-success text-success hover:bg-success/10"
                                onClick={() => updateStatusMutation.mutate({ id: e.id, status: "Presente" })}
                              >
                                Presente
                              </Button>
                            )}
                            {e.status !== "Ausente" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-destructive text-destructive hover:bg-destructive/10"
                                onClick={() => updateStatusMutation.mutate({ id: e.id, status: "Ausente" })}
                              >
                                Ausente
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {plantaoDia.length === 0 && (
                    <tr>
                      <td colSpan={canManage ? 5 : 4} className="p-8 text-center text-muted-foreground text-xs">
                        Nenhum servidor escalado neste plantão ({selectedDateStr} - {selectedTurno}).
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Painel Lateral: Ausências e Banco de Cobertura */}
          <div className="lg:col-span-4 space-y-4">
            {/* Ausências */}
            <div className="rounded-lg border bg-card p-4 shadow-xs space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-destructive flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4" /> Ausências Justificadas no Dia
              </h4>
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {ausentesNoDia.map((item) => (
                  <div key={item.servidor.id} className="p-2 rounded bg-destructive/10 border border-destructive/20 text-xs">
                    <div className="font-semibold text-foreground">{item.servidor.nome_completo}</div>
                    <div className="text-[11px] text-destructive">{item.motivo}</div>
                  </div>
                ))}
                {ausentesNoDia.length === 0 && (
                  <p className="text-muted-foreground text-xs py-2 text-center">Nenhum afastamento ou atestado nesta data.</p>
                )}
              </div>
            </div>

            {/* Servidores para Cobertura */}
            <div className="rounded-lg border bg-card p-4 shadow-xs space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-info flex items-center gap-1.5">
                <UserCheck className="h-4 w-4" /> Prontos para Cobertura / Extra
              </h4>
              <p className="text-[11px] text-muted-foreground">
                Servidores de folga regulamentar elegíveis para acionamento.
              </p>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {disponiveisParaCobertura.slice(0, 8).map((srv) => (
                  <div key={srv.id} className="p-2 rounded bg-muted/40 border text-xs flex items-center justify-between">
                    <div>
                      <div className="font-medium text-foreground">{srv.nome_completo}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        Eq. {srv.equipe} • {srv.telefone || "Sem tel"}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {srv.regime_escala}
                    </Badge>
                  </div>
                ))}
                {disponiveisParaCobertura.length === 0 && (
                  <p className="text-muted-foreground text-xs py-2 text-center">Nenhum servidor livre para cobertura.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Gerador de Projeção Mensal */}
      <Dialog open={generatorModalOpen} onOpenChange={setGeneratorModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerador Automático de Escala Mensal</DialogTitle>
            <DialogDescription>
              Projeta a rotina da escala conforme o regime e equipe para todo o mês de {monthName}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Equipe a Escalar</Label>
              <Select value={genEquipe} onValueChange={(val: any) => setGenEquipe(val)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Alpha">Equipe Alpha</SelectItem>
                  <SelectItem value="Beta">Equipe Beta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Regime de Escala</Label>
              <Select value={genRegime} onValueChange={(val: any) => setGenRegime(val)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24x72">24x72 (Plantão a cada 4 dias)</SelectItem>
                  <SelectItem value="12x36">12x36 (Plantão a cada 2 dias)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Primeiro Dia de Plantão no Mês (Dia 1 a {daysInMonth})</Label>
              <Input
                type="number"
                min={1}
                max={daysInMonth}
                value={genPrimeiroDia}
                onChange={(e) => setGenPrimeiroDia(Number(e.target.value) || 1)}
              />
              <p className="text-[11px] text-muted-foreground">
                Exemplo: Dia 1 iniciará o ciclo de 24h com folga de 72h subsequente.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setGeneratorModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => gerarProjecaoMutation.mutate()}
              disabled={gerarProjecaoMutation.isPending}
            >
              {gerarProjecaoMutation.isPending ? "Projetando..." : "Gerar e Aplicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
