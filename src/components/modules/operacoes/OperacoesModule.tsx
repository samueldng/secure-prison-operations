import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Truck, Gavel, Calendar, Clock, Plus, CheckCircle2, 
  XCircle, FileText, Gauge, AlertCircle, Shield, ChevronRight 
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import type { OperacaoJudicial, OperacaoTipo, OperacaoStatus, Servidor, Interno } from "@/types/app-types";

interface OperacoesModuleProps {
  userRole: "diretor" | "chefia" | "intendencia" | "servidor" | null;
  userId: string;
  defaultTipo?: "Escolta" | "JuriAudiencia";
}

export function OperacoesModule({ userRole, userId, defaultTipo = "Escolta" }: OperacoesModuleProps) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>(
    defaultTipo === "JuriAudiencia" ? "Tribunal do Júri" : "Escolta"
  );
  const [modalOpen, setNovoModalOpen] = useState(false);
  const [concluirModalOpen, setConcluirModalOpen] = useState(false);
  const [execucaoModalOpen, setExecucaoModalOpen] = useState(false);
  const [selectedOperacao, setSelectedOperacao] = useState<OperacaoJudicial | null>(null);

  // Form Nova Operação
  const [tipoOperacao, setTipoOperacao] = useState<OperacaoTipo>(
    defaultTipo === "JuriAudiencia" ? "Tribunal do Júri" : "Escolta"
  );
  const [internosSelecionados, setInternosSelecionados] = useState<string[]>([]);
  const [processoJudicial, setProcessoJudicial] = useState("");
  const [unidadeDestino, setUnidadeDestino] = useState("");
  const [dataProgramada, setDataProgramada] = useState(new Date().toISOString().slice(0, 16));
  const [equipeIds, setEquipeIds] = useState<string[]>([]);
  const [viatura, setViatura] = useState("");
  const [obsOperacao, setObsOperacao] = useState("");

  // Form Execução (KM e Horários)
  const [kmSaida, setKmSaida] = useState("");
  const [kmRetorno, setKmRetorno] = useState("");
  const [horarioSaida, setHorarioSaida] = useState("");
  const [horarioChegada, setHorarioChegada] = useState("");

  // Form Conclusão (Relatório Final)
  const [relatorioFinal, setRelatorioFinal] = useState("");

  const isDiretor = userRole === "diretor";
  const canManage = userRole === "diretor" || userRole === "chefia";
  const isServidor = userRole === "servidor";

  // Buscar servidores ativos
  const { data: servidores = [] } = useQuery({
    queryKey: ["servidores-ops"],
    queryFn: async () => {
      const { data, error } = await supabase.from("servidores" as any).select("*").order("nome_completo");
      if (error) return [];
      return (data || []) as Servidor[];
    },
  });

  const ownServidor = servidores.find((s) => s.user_id === userId);

  // Buscar internos custodiados
  const { data: internos = [] } = useQuery({
    queryKey: ["internos-ops"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("internos" as any)
        .select("*")
        .eq("status", "Custodiado")
        .order("nome_completo");
      if (error) return [];
      return (data || []) as Interno[];
    },
  });

  // Buscar operações judiciais
  const { data: operacoes = [], isLoading } = useQuery({
    queryKey: ["operacoes-judiciais"],
    queryFn: async () => {
      let query = supabase
        .from("operacoes_judiciais" as any)
        .select("*")
        .order("data_programada", { ascending: true });

      if (isServidor && ownServidor) {
        query = query.contains("equipe_ids", [ownServidor.id]);
      }

      const { data, error } = await query;
      if (error) return [];
      return (data || []) as OperacaoJudicial[];
    },
  });

  // Criar Operação
  const createOperacaoMutation = useMutation({
    mutationFn: async () => {
      if (!processoJudicial || !unidadeDestino || internosSelecionados.length === 0) {
        throw new Error("Preencha o processo, destino e selecione ao menos um interno custodiado.");
      }

      const { error } = await supabase.from("operacoes_judiciais" as any).insert([
        {
          tipo: tipoOperacao,
          internos_ids: internosSelecionados,
          numero_processo: processoJudicial,
          unidade_destino: unidadeDestino,
          data_programada: new Date(dataProgramada).toISOString(),
          equipe_ids: equipeIds,
          viatura: viatura || null,
          status: isDiretor ? "Autorizada" : "Programada",
          autorizado_por: isDiretor ? userId : null,
          autorizado_em: isDiretor ? new Date().toISOString() : null,
          observacoes: obsOperacao || null,
        },
      ]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isDiretor ? "Operação autorizada com sucesso!" : "Operação programada e enviada à Direção.");
      qc.invalidateQueries({ queryKey: ["operacoes-judiciais"] });
      setNovoModalOpen(false);
      setProcessoJudicial("");
      setUnidadeDestino("");
      setInternosSelecionados([]);
      setEquipeIds([]);
      setViatura("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Atualizar Status (Autorizar / Iniciar / Cancelar)
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OperacaoStatus }) => {
      const { error } = await supabase
        .from("operacoes_judiciais" as any)
        .update({
          status,
          autorizado_por: isDiretor && status === "Autorizada" ? userId : undefined,
          autorizado_em: isDiretor && status === "Autorizada" ? new Date().toISOString() : undefined,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast.success(`Situação da operação: ${vars.status}`);
      qc.invalidateQueries({ queryKey: ["operacoes-judiciais"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Atualizar Execução (KM e Horários)
  const updateExecucaoMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOperacao) return;

      const kmS = kmSaida ? Number(kmSaida) : null;
      const kmR = kmRetorno ? Number(kmRetorno) : null;

      if (kmS !== null && kmR !== null && kmR < kmS) {
        throw new Error("O KM de retorno deve ser maior ou igual ao KM de saída.");
      }

      const { error } = await supabase
        .from("operacoes_judiciais" as any)
        .update({
          km_saida: kmS,
          km_retorno: kmR,
          horario_saida: horarioSaida ? new Date(horarioSaida).toISOString() : null,
          horario_chegada: horarioChegada ? new Date(horarioChegada).toISOString() : null,
        })
        .eq("id", selectedOperacao.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dados de viatura e quilometragem registrados.");
      qc.invalidateQueries({ queryKey: ["operacoes-judiciais"] });
      setExecucaoModalOpen(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Concluir Operação com Relatório Final Obrigatório
  const concluirOperacaoMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOperacao) return;
      if (!relatorioFinal.trim()) {
        throw new Error("O Relatório Final da Operação é estritamente obrigatório para concluir.");
      }

      const { error } = await supabase
        .from("operacoes_judiciais" as any)
        .update({
          status: "Concluída",
          relatorio_final: relatorioFinal,
          horario_chegada: new Date().toISOString(),
        })
        .eq("id", selectedOperacao.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Operação concluída e relatório final homologado.");
      qc.invalidateQueries({ queryKey: ["operacoes-judiciais"] });
      setConcluirModalOpen(false);
      setRelatorioFinal("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Filtrar operações da aba ativa
  const operacoesAba = useMemo(() => {
    return operacoes.filter((op) => {
      if (defaultTipo === "JuriAudiencia") {
        return op.tipo === activeTab;
      }
      return op.tipo === "Escolta";
    });
  }, [operacoes, activeTab, defaultTipo]);

  const toggleInterno = (intId: string) => {
    setInternosSelecionados((prev) =>
      prev.includes(intId) ? prev.filter((id) => id !== intId) : [...prev, intId]
    );
  };

  const toggleEquipe = (srvId: string) => {
    setEquipeIds((prev) =>
      prev.includes(srvId) ? prev.filter((id) => id !== srvId) : [...prev, srvId]
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={defaultTipo === "JuriAudiencia" ? Gavel : Truck}
        title={defaultTipo === "JuriAudiencia" ? "Tribunal do Júri e Audiências Judiciais" : "Escoltas Prisionais"}
        description="Agenda judicial, designação de equipe, controle de viatura com KM e relatório final obrigatório."
        actions={
          <Button onClick={() => setNovoModalOpen(true)} className="bg-primary text-primary-foreground">
            <Plus className="mr-2 h-4 w-4" /> Nova Operação
          </Button>
        }
      />

      {defaultTipo === "JuriAudiencia" && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-card border">
            <TabsTrigger value="Tribunal do Júri">Tribunal do Júri</TabsTrigger>
            <TabsTrigger value="Audiência">Audiências de Instrução e Custódia</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {/* Agenda Operacional / Tabela */}
      <div className="rounded-lg border bg-card overflow-hidden shadow-xs">
        <div className="p-3 bg-muted/40 border-b flex items-center justify-between">
          <h3 className="font-semibold text-sm">Operações Programadas e em Andamento</h3>
          <span className="text-xs text-muted-foreground">{operacoesAba.length} operação(ões)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/70 text-xs uppercase font-semibold text-muted-foreground border-b">
              <tr>
                <th className="p-3">Data / Hora</th>
                <th className="p-3">Destino & Processo</th>
                <th className="p-3">Internos Custodiados</th>
                <th className="p-3">Equipe & Viatura</th>
                <th className="p-3">Situação</th>
                <th className="p-3 text-right">Ações Operacionais</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {operacoesAba.map((op) => {
                const nomesInternos = internos
                  .filter((i) => op.internos_ids?.includes(i.id))
                  .map((i) => `${i.nome_completo} (${i.matricula_siisp})`)
                  .join("; ");

                const nomesEquipe = servidores
                  .filter((s) => op.equipe_ids?.includes(s.id))
                  .map((s) => s.nome_completo)
                  .join(", ");

                return (
                  <tr key={op.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-mono text-xs">
                      <div className="font-bold text-foreground">
                        {new Date(op.data_programada).toLocaleDateString("pt-BR")}
                      </div>
                      <div className="text-muted-foreground">
                        {new Date(op.data_programada).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-foreground">{op.unidade_destino}</div>
                      <div className="text-xs font-mono text-muted-foreground mt-0.5">Proc: {op.numero_processo}</div>
                    </td>
                    <td className="p-3 text-xs max-w-xs">
                      <div className="line-clamp-2 text-foreground font-medium">{nomesInternos || "Nenhum vinculado"}</div>
                    </td>
                    <td className="p-3 text-xs">
                      <div className="font-medium text-foreground truncate max-w-xs">{nomesEquipe || "Sem equipe"}</div>
                      <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                        Vtr: {op.viatura || "Não informada"}{" "}
                        {op.km_saida ? `• KM: ${op.km_saida}${op.km_retorno ? ` a ${op.km_retorno}` : ""}` : ""}
                      </div>
                    </td>
                    <td className="p-3">
                      <StatusBadge status={op.status} size="sm" />
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {isDiretor && op.status === "Programada" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-success text-success hover:bg-success/10"
                            onClick={() => updateStatusMutation.mutate({ id: op.id, status: "Autorizada" })}
                          >
                            Autorizar
                          </Button>
                        )}

                        {canManage && op.status === "Autorizada" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-info text-info hover:bg-info/10"
                            onClick={() => updateStatusMutation.mutate({ id: op.id, status: "Em Andamento" })}
                          >
                            Iniciar Saída
                          </Button>
                        )}

                        {canManage && (op.status === "Autorizada" || op.status === "Em Andamento") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => {
                              setSelectedOperacao(op);
                              setKmSaida(op.km_saida ? String(op.km_saida) : "");
                              setKmRetorno(op.km_retorno ? String(op.km_retorno) : "");
                              setHorarioSaida(op.horario_saida ? op.horario_saida.slice(0, 16) : "");
                              setHorarioChegada(op.horario_chegada ? op.horario_chegada.slice(0, 16) : "");
                              setExecucaoModalOpen(true);
                            }}
                          >
                            <Gauge className="h-3.5 w-3.5 mr-1" /> Viatura / KM
                          </Button>
                        )}

                        {canManage && op.status === "Em Andamento" && (
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-success text-success-foreground hover:bg-success/90"
                            onClick={() => {
                              setSelectedOperacao(op);
                              setConcluirModalOpen(true);
                            }}
                          >
                            <FileText className="h-3.5 w-3.5 mr-1" /> Concluir com Relatório
                          </Button>
                        )}

                        {op.status === "Concluída" && op.relatorio_final && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => {
                              toast.info(`Relatório Final da Operação:\n\n${op.relatorio_final}`);
                            }}
                          >
                            Ver Relatório
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {operacoesAba.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground text-xs">
                    {isLoading ? "Carregando operações judiciais..." : "Nenhuma operação registrada para este filtro."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Nova Operação */}
      <Dialog open={modalOpen} onOpenChange={setNovoModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Programar Operação Judicial</DialogTitle>
            <DialogDescription>
              Escolta, audiência ou júri popular com vinculação de internos e equipe policial.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo de Operação</Label>
                <Select value={tipoOperacao} onValueChange={(v: any) => setTipoOperacao(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Escolta">Escolta Prisional</SelectItem>
                    <SelectItem value="Tribunal do Júri">Tribunal do Júri</SelectItem>
                    <SelectItem value="Audiência">Audiência Judicial</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Data e Hora Programada *</Label>
                <Input
                  type="datetime-local"
                  value={dataProgramada}
                  onChange={(e) => setDataProgramada(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Número do Processo Judicial *</Label>
              <Input
                placeholder="Ex: 0801234-56.2025.8.10.0001"
                value={processoJudicial}
                onChange={(e) => setProcessoJudicial(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label>Unidade ou Fórum de Destino *</Label>
              <Input
                placeholder="Ex: Fórum de Santa Inês / Hospital Regional"
                value={unidadeDestino}
                onChange={(e) => setUnidadeDestino(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label>Interno(s) Vinculado(s) à Operação *</Label>
              <div className="max-h-36 overflow-y-auto rounded-md border p-2 space-y-1 text-xs">
                {internos.map((i) => (
                  <label key={i.id} className="flex items-center gap-2 p-1 hover:bg-muted/50 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={internosSelecionados.includes(i.id)}
                      onChange={() => toggleInterno(i.id)}
                      className="rounded border-border"
                    />
                    <span>
                      {i.nome_completo} (SIISP: {i.matricula_siisp})
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Equipe Policial Designada</Label>
              <div className="max-h-36 overflow-y-auto rounded-md border p-2 space-y-1 text-xs">
                {servidores.map((srv) => (
                  <label key={srv.id} className="flex items-center gap-2 p-1 hover:bg-muted/50 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={equipeIds.includes(srv.id)}
                      onChange={() => toggleEquipe(srv.id)}
                      className="rounded border-border"
                    />
                    <span>{srv.nome_completo} (Eq. {srv.equipe})</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Viatura Utilizada (Prefixo/Placa)</Label>
                <Input placeholder="Ex: VP-04 / Hilux" value={viatura} onChange={(e) => setViatura(e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label>Observações Gerais</Label>
                <Input placeholder="Recomendações especiais" value={obsOperacao} onChange={(e) => setObsOperacao(e.target.value)} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => createOperacaoMutation.mutate()} disabled={createOperacaoMutation.isPending}>
              {createOperacaoMutation.isPending ? "Gravando..." : "Programar Operação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Execução (KM e Horários) */}
      <Dialog open={execucaoModalOpen} onOpenChange={setExecucaoModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registro de Viatura e Deslocamento</DialogTitle>
            <DialogDescription>
              Validação estrita de quilometragem e horários reais da operação.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>KM de Saída</Label>
                <Input
                  type="number"
                  placeholder="Ex: 45200"
                  value={kmSaida}
                  onChange={(e) => setKmSaida(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label>KM de Retorno</Label>
                <Input
                  type="number"
                  placeholder="Ex: 45280"
                  value={kmRetorno}
                  onChange={(e) => setKmRetorno(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Horário Efetivo de Saída</Label>
                <Input
                  type="datetime-local"
                  value={horarioSaida}
                  onChange={(e) => setHorarioSaida(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label>Horário Efetivo de Chegada</Label>
                <Input
                  type="datetime-local"
                  value={horarioChegada}
                  onChange={(e) => setHorarioChegada(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setExecucaoModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => updateExecucaoMutation.mutate()} disabled={updateExecucaoMutation.isPending}>
              {updateExecucaoMutation.isPending ? "Salvando..." : "Salvar Dados de Viatura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Concluir com Relatório Final Obrigatório */}
      <Dialog open={concluirModalOpen} onOpenChange={setConcluirModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Conclusão e Relatório Final da Operação</DialogTitle>
            <DialogDescription>
              O preenchimento do relatório circunstanciado é indispensável para homologar a conclusão.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Relatório Final Circunstanciado *</Label>
              <Textarea
                rows={5}
                placeholder="Descreva detalhadamente o desenrolar da operação, ocorrências durante a custódia, entrega no fórum e retorno seguro da equipe à UPSTI..."
                value={relatorioFinal}
                onChange={(e) => setRelatorioFinal(e.target.value)}
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConcluirModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-success text-success-foreground hover:bg-success/90"
              onClick={() => concluirOperacaoMutation.mutate()}
              disabled={concluirOperacaoMutation.isPending}
            >
              {concluirOperacaoMutation.isPending ? "Finalizando..." : "Homologar Conclusão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
