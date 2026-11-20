import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Plane, Plus, CheckCircle, XCircle, AlertTriangle, Calendar, FileText 
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
import type { FeriasLicenca, FeriasLicencaTipo, Servidor } from "@/types/app-types";
import { FERIAS_TIPOS } from "@/types/app-types";

interface FeriasModuleProps {
  userRole: "diretor" | "chefia" | "intendencia" | "servidor" | null;
  userId: string;
}

export function FeriasModule({ userRole, userId }: FeriasModuleProps) {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [servidorFilter, setServidorFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState("todos");

  // Form State
  const [formServidorId, setFormServidorId] = useState("");
  const [formTipo, setFormTipo] = useState<FeriasLicencaTipo>("Férias");
  const [formPeriodoAquisitivo, setFormPeriodoAquisitivo] = useState(`${new Date().getFullYear() - 1}/${new Date().getFullYear()}`);
  const [formDataInicio, setFormDataInicio] = useState(new Date().toISOString().split("T")[0]);
  const [formDataFim, setFormDataFim] = useState(new Date().toISOString().split("T")[0]);
  const [formObs, setFormObs] = useState("");

  const isDiretor = userRole === "diretor";
  const canManage = userRole === "diretor" || userRole === "chefia";
  const isServidor = userRole === "servidor";

  // Buscar servidores
  const { data: servidores = [] } = useQuery({
    queryKey: ["servidores-ferias"],
    queryFn: async () => {
      let query = supabase.from("servidores" as any).select("*").order("nome_completo");
      if (isServidor) query = query.eq("user_id", userId);
      const { data, error } = await query;
      if (error) return [];
      return (data || []) as Servidor[];
    },
  });

  const ownServidor = servidores.find((s) => s.user_id === userId);

  // Buscar férias e licenças
  const { data: periodos = [], isLoading } = useQuery({
    queryKey: ["ferias-lista"],
    queryFn: async () => {
      let query = supabase
        .from("ferias_licencas" as any)
        .select("*, servidor:servidores(*)")
        .order("data_inicio", { ascending: false });

      if (isServidor && ownServidor) query = query.eq("servidor_id", ownServidor.id);
      const { data, error } = await query;
      if (error) return [];
      return (data || []) as FeriasLicenca[];
    },
  });

  // Criar solicitação / cadastro de férias
  const createFeriasMutation = useMutation({
    mutationFn: async () => {
      const sId = isServidor ? ownServidor?.id : formServidorId;
      if (!sId) throw new Error("Selecione o servidor.");

      if (new Date(formDataFim) < new Date(formDataInicio)) {
        throw new Error("A data de término deve ser posterior à data de início.");
      }

      const { error } = await supabase.from("ferias_licencas" as any).insert([
        {
          servidor_id: sId,
          tipo: formTipo,
          periodo_aquisitivo: formPeriodoAquisitivo,
          data_inicio: formDataInicio,
          data_fim: formDataFim,
          status: isDiretor ? "Aprovada" : "Solicitada",
          aprovado_por: isDiretor ? userId : null,
          aprovado_em: isDiretor ? new Date().toISOString() : null,
          observacoes: formObs || null,
        },
      ]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isDiretor ? "Período cadastrado e deferido." : "Solicitação de férias enviada.");
      qc.invalidateQueries({ queryKey: ["ferias-lista"] });
      setModalOpen(false);
      setFormObs("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Atualizar status (Diretor aprova / inicia / conclui / cancela)
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, servidorId, tipo }: { id: string; status: FeriasLicenca["status"]; servidorId: string; tipo: string }) => {
      const { error } = await supabase
        .from("ferias_licencas" as any)
        .update({
          status,
          aprovado_por: userId,
          aprovado_em: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;

      // Sincronizar status do servidor
      if (status === "Em Vigor") {
        const novoStatus = tipo === "Férias" || tipo === "Recesso" ? "Férias" : "Licença";
        await supabase.from("servidores" as any).update({ status: novoStatus }).eq("id", servidorId);
      } else if (status === "Concluída" || status === "Cancelada") {
        await supabase.from("servidores" as any).update({ status: "Ativo" }).eq("id", servidorId);
      }
    },
    onSuccess: (_, vars) => {
      toast.success(`Situação atualizada para: ${vars.status}`);
      qc.invalidateQueries({ queryKey: ["ferias-lista"] });
      qc.invalidateQueries({ queryKey: ["servidores"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const filteredPeriodos = useMemo(() => {
    return periodos.filter((p) => {
      const matchServidor = servidorFilter === "todos" || p.servidor_id === servidorFilter;
      const matchStatus = statusFilter === "todos" || p.status === statusFilter;
      return matchServidor && matchStatus;
    });
  }, [periodos, servidorFilter, statusFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Plane}
        title="Férias, Recessos e Licenças"
        description="Planejamento anual, períodos aquisitivos e sincronização automática de impedimento na escala."
        actions={
          <Button onClick={() => setModalOpen(true)} className="bg-primary text-primary-foreground">
            <Plus className="mr-2 h-4 w-4" /> {isServidor ? "Solicitar Período" : "Cadastrar Período"}
          </Button>
        }
      />

      {/* Filtros */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 bg-card p-4 rounded-lg border shadow-xs">
        {!isServidor && (
          <div>
            <Select value={servidorFilter} onValueChange={setServidorFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por Servidor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Servidores</SelectItem>
                {servidores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome_completo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Situação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as Situações</SelectItem>
              <SelectItem value="Solicitada">Solicitada</SelectItem>
              <SelectItem value="Aprovada">Aprovada</SelectItem>
              <SelectItem value="Em Vigor">Em Vigor (Atualmente afastado)</SelectItem>
              <SelectItem value="Concluída">Concluída</SelectItem>
              <SelectItem value="Cancelada">Cancelada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center text-xs text-muted-foreground px-2">
          <span>Registros encontrados: <b>{filteredPeriodos.length}</b></span>
        </div>
      </div>

      {/* Tabela de Períodos */}
      <div className="rounded-lg border bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/70 text-xs uppercase font-semibold text-muted-foreground border-b">
              <tr>
                <th className="p-3">Servidor</th>
                <th className="p-3">Tipo</th>
                <th className="p-3">Período Aquisitivo</th>
                <th className="p-3">Data Início / Fim</th>
                <th className="p-3">Situação</th>
                {isDiretor && <th className="p-3 text-right">Controle do Diretor</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredPeriodos.map((p) => {
                const start = new Date(p.data_inicio + "T00:00:00");
                const end = new Date(p.data_fim + "T00:00:00");
                const diasTotal = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

                return (
                  <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium text-foreground">
                      {p.servidor?.nome_completo || "Servidor"}
                      <div className="text-[11px] text-muted-foreground font-mono">{p.servidor?.matricula_funcional}</div>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-xs">
                        {p.tipo}
                      </Badge>
                    </td>
                    <td className="p-3 font-mono text-xs">{p.periodo_aquisitivo || "—"}</td>
                    <td className="p-3 font-mono text-xs">
                      <div>{p.data_inicio} até {p.data_fim}</div>
                      <div className="text-[11px] text-muted-foreground font-sans">({diasTotal} dias)</div>
                    </td>
                    <td className="p-3">
                      <StatusBadge status={p.status} size="sm" />
                    </td>
                    {isDiretor && (
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {p.status === "Solicitada" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-success text-success hover:bg-success/10"
                                onClick={() =>
                                  updateStatusMutation.mutate({
                                    id: p.id,
                                    status: "Aprovada",
                                    servidorId: p.servidor_id,
                                    tipo: p.tipo,
                                  })
                                }
                              >
                                Deferir
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-destructive text-destructive hover:bg-destructive/10"
                                onClick={() =>
                                  updateStatusMutation.mutate({
                                    id: p.id,
                                    status: "Cancelada",
                                    servidorId: p.servidor_id,
                                    tipo: p.tipo,
                                  })
                                }
                              >
                                Indeferir
                              </Button>
                            </>
                          )}
                          {p.status === "Aprovada" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-info text-info hover:bg-info/10"
                              onClick={() =>
                                updateStatusMutation.mutate({
                                  id: p.id,
                                  status: "Em Vigor",
                                  servidorId: p.servidor_id,
                                  tipo: p.tipo,
                                })
                              }
                            >
                              Iniciar Gozo
                            </Button>
                          )}
                          {p.status === "Em Vigor" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-muted-foreground text-foreground hover:bg-muted"
                              onClick={() =>
                                updateStatusMutation.mutate({
                                  id: p.id,
                                  status: "Concluída",
                                  servidorId: p.servidor_id,
                                  tipo: p.tipo,
                                })
                              }
                            >
                              Concluir Período
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filteredPeriodos.length === 0 && (
                <tr>
                  <td colSpan={isDiretor ? 6 : 5} className="p-8 text-center text-muted-foreground text-xs">
                    {isLoading ? "Carregando..." : "Nenhum período de férias ou licença encontrado."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Cadastro de Férias */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isServidor ? "Solicitar Período de Afastamento" : "Cadastrar Férias / Licença"}</DialogTitle>
            <DialogDescription>
              O período aprovado sincroniza automaticamente o bloqueio do servidor nas escalas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {!isServidor && (
              <div className="space-y-1">
                <Label>Servidor *</Label>
                <Select value={formServidorId} onValueChange={setFormServidorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o policial/servidor" />
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo de Afastamento</Label>
                <Select value={formTipo} onValueChange={(v: any) => setFormTipo(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FERIAS_TIPOS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Período Aquisitivo</Label>
                <Input
                  value={formPeriodoAquisitivo}
                  onChange={(e) => setFormPeriodoAquisitivo(e.target.value)}
                  placeholder="Ex: 2024/2025"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Data de Início *</Label>
                <Input type="date" value={formDataInicio} onChange={(e) => setFormDataInicio(e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label>Data de Término *</Label>
                <Input type="date" value={formDataFim} onChange={(e) => setFormDataFim(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Observações / Portaria de Concessão</Label>
              <Input
                placeholder="Ex: Portaria nº 123/2025 publicada em DOE"
                value={formObs}
                onChange={(e) => setFormObs(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => createFeriasMutation.mutate()} disabled={createFeriasMutation.isPending}>
              {createFeriasMutation.isPending ? "Processando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
