import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  MapPin, Plus, CheckCircle2, Clock, Calendar, Users, 
  ArrowRight, ShieldCheck, AlertCircle, FileText 
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
import { Badge } from "@/components/ui/badge";
import type { MissaoExterna, Servidor } from "@/types/app-types";
import { calcularFolgas } from "@/types/app-types";

interface MissoesModuleProps {
  userRole: "diretor" | "chefia" | "intendencia" | "servidor" | null;
  userId: string;
}

export function MissoesModule({ userRole, userId }: MissoesModuleProps) {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [concluirModalOpen, setConcluirModalOpen] = useState(false);
  const [selectedMissao, setSelectedMissao] = useState<MissaoExterna | null>(null);

  // Form Criação
  const [responsavelId, setResponsavelId] = useState("");
  const [equipeIds, setEquipeIds] = useState<string[]>([]);
  const [dataSaida, setDataSaida] = useState(new Date().toISOString().slice(0, 16));
  const [destino, setDestino] = useState("");
  const [finalidade, setFinalidade] = useState("");

  // Form Conclusão
  const [dataRetorno, setDataRetorno] = useState(new Date().toISOString().slice(0, 16));
  const [horasTrabalhadas, setHorasTrabalhadas] = useState("12");

  const isDiretor = userRole === "diretor";
  const canManage = userRole === "diretor" || userRole === "chefia";
  const isServidor = userRole === "servidor";

  // Buscar servidores
  const { data: servidores = [] } = useQuery({
    queryKey: ["servidores-missoes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("servidores" as any).select("*").order("nome_completo");
      if (error) return [];
      return (data || []) as Servidor[];
    },
  });

  const ownServidor = servidores.find((s) => s.user_id === userId);

  // Buscar missões
  const { data: missoes = [], isLoading } = useQuery({
    queryKey: ["missoes-externas"],
    queryFn: async () => {
      let query = supabase
        .from("missoes_externas" as any)
        .select("*, servidor_responsavel:servidores!servidor_responsavel_id(*)")
        .order("data_saida", { ascending: false });

      if (isServidor && ownServidor) {
        query = query.or(`servidor_responsavel_id.eq.${ownServidor.id},equipe_ids.cs.{${ownServidor.id}}`);
      }

      const { data, error } = await query;
      if (error) return [];
      return (data || []) as MissaoExterna[];
    },
  });

  // Criar Missão
  const createMissaoMutation = useMutation({
    mutationFn: async () => {
      const sId = isServidor ? ownServidor?.id : responsavelId;
      if (!sId || !destino || !finalidade) {
        throw new Error("Preencha o servidor responsável, destino e finalidade.");
      }

      const { error } = await supabase.from("missoes_externas" as any).insert([
        {
          servidor_responsavel_id: sId,
          equipe_ids: equipeIds,
          data_saida: new Date(dataSaida).toISOString(),
          destino,
          finalidade,
          status: isDiretor ? "Autorizada" : "Solicitada",
          autorizado_por: isDiretor ? userId : null,
          autorizado_em: isDiretor ? new Date().toISOString() : null,
        },
      ]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isDiretor ? "Missão externa autorizada!" : "Missão externa solicitada à Direção.");
      qc.invalidateQueries({ queryKey: ["missoes-externas"] });
      setModalOpen(false);
      setDestino("");
      setFinalidade("");
      setEquipeIds([]);
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Atualizar Status (Autorizar / Iniciar)
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: MissaoExterna["status"] }) => {
      const { error } = await supabase
        .from("missoes_externas" as any)
        .update({
          status,
          autorizado_por: isDiretor ? userId : undefined,
          autorizado_em: isDiretor ? new Date().toISOString() : undefined,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast.success(`Missão atualizada para: ${vars.status}`);
      qc.invalidateQueries({ queryKey: ["missoes-externas"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Concluir Missão + Crédito Automático no Folgas Ledger
  const concluirMissaoMutation = useMutation({
    mutationFn: async () => {
      if (!selectedMissao) return;
      const horasNum = Number(horasTrabalhadas) || 12;
      const retornoIso = new Date(dataRetorno).toISOString();

      // Tenta RPC concluir_missao
      const { error: rpcErr } = await supabase.rpc("concluir_missao" as any, {
        p_missao_id: selectedMissao.id,
        p_data_retorno: retornoIso,
        p_horas: horasNum,
      });

      if (rpcErr) {
        console.warn("RPC indisponível, aplicando fallback direto:", rpcErr.message);
        // Fallback: update missão
        await supabase
          .from("missoes_externas" as any)
          .update({
            status: "Concluída",
            data_retorno: retornoIso,
            horas_trabalhadas: horasNum,
          })
          .eq("id", selectedMissao.id);

        // Creditar no ledger de folgas
        await supabase.from("folgas_ledger" as any).insert([
          {
            servidor_id: selectedMissao.servidor_responsavel_id,
            tipo: "credito",
            horas: horasNum,
            origem: "missao_externa",
            referencia_id: selectedMissao.id,
            descricao: `Crédito automático — Missão externa (${selectedMissao.destino})`,
            status: "Aprovada",
            aprovado_por: userId,
            aprovado_em: new Date().toISOString(),
          },
        ]);
      }
    },
    onSuccess: () => {
      const horasNum = Number(horasTrabalhadas) || 12;
      const { folgasInteiras, residuo } = calcularFolgas(horasNum);
      toast.success(
        `Missão concluída! Creditado +${horasNum}h no banco de folgas (${folgasInteiras} folga(s) de 12h gerada(s)).`
      );
      qc.invalidateQueries({ queryKey: ["missoes-externas"] });
      qc.invalidateQueries({ queryKey: ["folgas-ledger"] });
      setConcluirModalOpen(false);
      setSelectedMissao(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleEquipeMember = (srvId: string) => {
    setEquipeIds((prev) =>
      prev.includes(srvId) ? prev.filter((id) => id !== srvId) : [...prev, srvId]
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={MapPin}
        title="Missões Externas"
        description="Deslocamentos operacionais com apuração de horas trabalhadas e conversão automática no Banco de Folgas."
        actions={
          <Button onClick={() => setModalOpen(true)} className="bg-primary text-primary-foreground">
            <Plus className="mr-2 h-4 w-4" /> Solicitar Missão
          </Button>
        }
      />

      {/* Tabela de Missões */}
      <div className="rounded-lg border bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/70 text-xs uppercase font-semibold text-muted-foreground border-b">
              <tr>
                <th className="p-3">Destino & Finalidade</th>
                <th className="p-3">Responsável & Equipe</th>
                <th className="p-3">Saída / Retorno</th>
                <th className="p-3">Carga Horária</th>
                <th className="p-3">Situação</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {missoes.map((m) => {
                const equipeNomes = servidores
                  .filter((s) => m.equipe_ids?.includes(s.id))
                  .map((s) => s.nome_completo)
                  .join(", ");

                return (
                  <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-foreground flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-primary" /> {m.destino}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{m.finalidade}</div>
                    </td>
                    <td className="p-3 text-xs">
                      <div className="font-medium text-foreground">
                        {m.servidor_responsavel?.nome_completo || "Responsável"}
                      </div>
                      {equipeNomes && (
                        <div className="text-[11px] text-muted-foreground truncate max-w-xs">
                          Equipe: {equipeNomes}
                        </div>
                      )}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      <div>Saída: {new Date(m.data_saida).toLocaleString("pt-BR")}</div>
                      {m.data_retorno && (
                        <div className="text-muted-foreground">
                          Retorno: {new Date(m.data_retorno).toLocaleString("pt-BR")}
                        </div>
                      )}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {m.horas_trabalhadas ? (
                        <span className="font-bold text-success">+{m.horas_trabalhadas}h apuradas</span>
                      ) : (
                        <span className="text-muted-foreground">Em apuração</span>
                      )}
                    </td>
                    <td className="p-3">
                      <StatusBadge status={m.status} size="sm" />
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {isDiretor && m.status === "Solicitada" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-success text-success hover:bg-success/10"
                            onClick={() => updateStatusMutation.mutate({ id: m.id, status: "Autorizada" })}
                          >
                            Autorizar
                          </Button>
                        )}
                        {canManage && m.status === "Autorizada" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-info text-info hover:bg-info/10"
                            onClick={() => updateStatusMutation.mutate({ id: m.id, status: "Em Andamento" })}
                          >
                            Iniciar
                          </Button>
                        )}
                        {isDiretor && (m.status === "Autorizada" || m.status === "Em Andamento") && (
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-success text-success-foreground hover:bg-success/90"
                            onClick={() => {
                              setSelectedMissao(m);
                              setConcluirModalOpen(true);
                            }}
                          >
                            Concluir & Creditar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {missoes.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground text-xs">
                    {isLoading ? "Carregando missões..." : "Nenhuma missão externa registrada."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Solicitar Missão */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Solicitar Missão Externa</DialogTitle>
            <DialogDescription>
              Aprovação exclusiva do Diretor. Horas apuradas geram folgas na proporção de 12h = 1 plantão.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {!isServidor && (
              <div className="space-y-1">
                <Label>Servidor Encarregado / Responsável *</Label>
                <Select value={responsavelId} onValueChange={setResponsavelId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o policial responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    {servidores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nome_completo} ({s.matricula_funcional})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label>Destino da Missão *</Label>
              <Input
                placeholder="Ex: São Luís / Fórum / Hospital Regional"
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label>Finalidade Operacional *</Label>
              <Input
                placeholder="Ex: Escolta especializada / Cumprimento de diligência"
                value={finalidade}
                onChange={(e) => setFinalidade(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label>Data e Horário Previsto de Saída *</Label>
              <Input
                type="datetime-local"
                value={dataSaida}
                onChange={(e) => setDataSaida(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Equipe Participante (Selecione os policiais)</Label>
              <div className="max-h-36 overflow-y-auto rounded-md border p-2 space-y-1 text-xs">
                {servidores.map((srv) => (
                  <label key={srv.id} className="flex items-center gap-2 p-1 hover:bg-muted/50 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={equipeIds.includes(srv.id)}
                      onChange={() => toggleEquipeMember(srv.id)}
                      className="rounded border-border"
                    />
                    <span>{srv.nome_completo} (Eq. {srv.equipe})</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => createMissaoMutation.mutate()} disabled={createMissaoMutation.isPending}>
              {createMissaoMutation.isPending ? "Gravando..." : "Registrar Solicitação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Concluir Missão & Creditar no Banco de Folgas */}
      <Dialog open={concluirModalOpen} onOpenChange={setConcluirModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Concluir Missão Externa</DialogTitle>
            <DialogDescription>
              Ao concluir, as horas trabalhadas são creditadas automaticamente no Razão de Folgas do policial.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="bg-muted/30 p-3 rounded-md text-xs space-y-1">
              <div className="font-semibold text-foreground">Missão: {selectedMissao?.destino}</div>
              <div className="text-muted-foreground">
                Responsável: {selectedMissao?.servidor_responsavel?.nome_completo}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Data e Horário Real de Retorno</Label>
              <Input
                type="datetime-local"
                value={dataRetorno}
                onChange={(e) => setDataRetorno(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Total de Horas Trabalhadas Efetivas</Label>
              <Input
                type="number"
                min={1}
                value={horasTrabalhadas}
                onChange={(e) => setHorasTrabalhadas(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Cada 12h = 1 folga inteira. Resíduos permanecem como crédito cumulativo.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConcluirModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-success text-success-foreground hover:bg-success/90"
              onClick={() => concluirMissaoMutation.mutate()}
              disabled={concluirMissaoMutation.isPending}
            >
              {concluirMissaoMutation.isPending ? "Processando..." : "Confirmar Conclusão & Crédito"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
