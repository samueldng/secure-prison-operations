import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Shield, Plus, AlertTriangle, CheckCircle, Clock, 
  Wrench, CheckCircle2, XCircle, Search, Filter, Lock 
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { 
  Armamento, CautelaArmamento, ManutencaoArmamento, 
  ArmamentoTipo, EstadoConservacao, ArmamentoStatus, Servidor 
} from "@/types/app-types";
import { ARMAMENTO_TIPOS, ESTADOS_CONSERVACAO } from "@/types/app-types";

interface IntendenciaModuleProps {
  userRole: "diretor" | "chefia" | "intendencia" | "servidor" | null;
  userId: string;
}

export function IntendenciaModule({ userRole, userId }: IntendenciaModuleProps) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("inventario");
  const [novoArmaModalOpen, setNovoArmaModalOpen] = useState(false);
  const [novaCautelaModalOpen, setNovaCautelaModalOpen] = useState(false);
  const [devolverModalOpen, setDevolverModalOpen] = useState(false);
  const [manutencaoModalOpen, setManutencaoModalOpen] = useState(false);
  const [selectedCautela, setSelectedCautela] = useState<CautelaArmamento | null>(null);

  // Form Armamento
  const [armaTipo, setArmaTipo] = useState<ArmamentoTipo>("Pistola");
  const [armaMarca, setArmaMarca] = useState("Taurus");
  const [armaModelo, setArmaModelo] = useState("TH .40");
  const [armaSerie, setArmaSerie] = useState("");
  const [armaPatrimonio, setArmaPatrimonio] = useState("");
  const [armaLocal, setArmaLocal] = useState("Reserva de Armas - Armário 01");
  const [armaConservacao, setArmaConservacao] = useState<EstadoConservacao>("Ótimo");

  // Form Cautela
  const [cautelaArmaId, setCautelaArmaId] = useState("");
  const [cautelaServidorId, setCautelaServidorId] = useState("");
  const [cautelaDevPrevista, setCautelaDevPrevista] = useState(new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16));
  const [cautelaObs, setCautelaObs] = useState("");

  // Form Devolução
  const [estadoDevolucao, setEstadoDevolucao] = useState<EstadoConservacao>("Bom");
  const [obsDevolucao, setObsDevolucao] = useState("");

  // Form Manutenção
  const [manutArmaId, setManutArmaId] = useState("");
  const [manutTipo, setManutTipo] = useState<"Preventiva" | "Corretiva">("Preventiva");
  const [manutDesc, setManutDesc] = useState("");
  const [manutResp, setManutResp] = useState("Armeiro Oficial");

  const isDiretor = userRole === "diretor";
  const isIntendencia = userRole === "intendencia";
  const isChefia = userRole === "chefia";
  const isServidor = userRole === "servidor";
  const canManage = isDiretor || isIntendencia;

  // Chefia não tem acesso à intendência
  if (isChefia) {
    return (
      <div className="space-y-4">
        <PageHeader icon={Shield} title="Intendência e Armamento" description="Gestão bélica e cautelas." />
        <EmptyState
          icon={Lock}
          title="Sem Acesso ao Módulo de Intendência"
          description="O controle do inventário bélico é restrito à Direção e à Intendência (Armaria)."
        />
      </div>
    );
  }

  // Buscar armamentos
  const { data: armamentos = [], isLoading: loadingArmas } = useQuery({
    queryKey: ["armamentos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("armamentos" as any).select("*").order("tipo");
      if (error) return [];
      return (data || []) as Armamento[];
    },
  });

  // Buscar servidores para cautela
  const { data: servidores = [] } = useQuery({
    queryKey: ["servidores-cautela"],
    queryFn: async () => {
      const { data, error } = await supabase.from("servidores" as any).select("*").order("nome_completo");
      if (error) return [];
      return (data || []) as Servidor[];
    },
  });

  const ownServidor = servidores.find((s) => s.user_id === userId);

  // Buscar cautelas
  const { data: cautelas = [], isLoading: loadingCautelas } = useQuery({
    queryKey: ["cautelas-armamento"],
    queryFn: async () => {
      let query = supabase
        .from("cautelas_armamento" as any)
        .select("*, armamento:armamentos(*), servidor:servidores(*)")
        .order("created_at", { ascending: false });

      if (isServidor && ownServidor) {
        query = query.eq("servidor_id", ownServidor.id);
      }

      const { data, error } = await query;
      if (error) return [];
      return (data || []) as CautelaArmamento[];
    },
  });

  // Buscar manutenções
  const { data: manutencoes = [], isLoading: loadingManut } = useQuery({
    queryKey: ["manutencoes-armamento"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manutencoes_armamento" as any)
        .select("*, armamento:armamentos(*)")
        .order("data_entrada", { ascending: false });
      if (error) return [];
      return (data || []) as ManutencaoArmamento[];
    },
  });

  // Indicadores
  const armasDisponiveis = armamentos.filter((a) => a.status === "Disponível").length;
  const armasCauteladas = armamentos.filter((a) => a.status === "Cautelado").length;
  const armasEmManutencao = armamentos.filter((a) => a.status === "Em Manutenção").length;

  // Cautelas em atraso de devolução
  const cautelasAtrasadas = useMemo(() => {
    const now = new Date().getTime();
    return cautelas.filter((c) => {
      if (c.status !== "Ativa" || !c.data_devolucao_prevista) return false;
      return new Date(c.data_devolucao_prevista).getTime() < now;
    });
  }, [cautelas]);

  // Cadastrar Armamento
  const createArmamentoMutation = useMutation({
    mutationFn: async () => {
      if (!armaSerie) throw new Error("O número de série do armamento é obrigatório.");

      const { error } = await supabase.from("armamentos" as any).insert([
        {
          tipo: armaTipo,
          marca: armaMarca,
          modelo: armaModelo,
          numero_serie: armaSerie,
          numero_patrimonio: armaPatrimonio || null,
          localizacao_fisica: armaLocal,
          estado_conservacao: armaConservacao,
          status: "Disponível",
        },
      ]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Armamento incluído no inventário bélico com sucesso.");
      qc.invalidateQueries({ queryKey: ["armamentos"] });
      setNovoArmaModalOpen(false);
      setArmaSerie("");
      setArmaPatrimonio("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Emitir / Autorizar Cautela
  const createCautelaMutation = useMutation({
    mutationFn: async () => {
      if (!cautelaArmaId || !cautelaServidorId) {
        throw new Error("Selecione o armamento disponível e o servidor cautelante.");
      }

      // Checagem prévia no frontend
      const arma = armamentos.find((a) => a.id === cautelaArmaId);
      if (arma?.status !== "Disponível") {
        throw new Error("Este armamento já se encontra cautelado ou em manutenção.");
      }

      const { error } = await supabase.from("cautelas_armamento" as any).insert([
        {
          armamento_id: cautelaArmaId,
          servidor_id: cautelaServidorId,
          status: "Ativa",
          autorizado_por: userId,
          autorizado_em: new Date().toISOString(),
          data_retirada: new Date().toISOString(),
          data_devolucao_prevista: new Date(cautelaDevPrevista).toISOString(),
          observacoes: cautelaObs || null,
        },
      ]);
      if (error) throw error;

      // Atualiza armamento
      await supabase.from("armamentos" as any).update({ status: "Cautelado" }).eq("id", cautelaArmaId);
    },
    onSuccess: () => {
      toast.success("Cautela autorizada e armamento entregue ao servidor.");
      qc.invalidateQueries({ queryKey: ["cautelas-armamento"] });
      qc.invalidateQueries({ queryKey: ["armamentos"] });
      setNovaCautelaModalOpen(false);
      setCautelaObs("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Receber Devolução de Cautela
  const devolverCautelaMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCautela) return;

      const { error } = await supabase
        .from("cautelas_armamento" as any)
        .update({
          status: "Devolvida",
          data_devolucao_efetiva: new Date().toISOString(),
          estado_devolucao: estadoDevolucao,
        })
        .eq("id", selectedCautela.id);
      if (error) throw error;

      // Atualizar armamento para Disponível e estado conferido
      await supabase
        .from("armamentos" as any)
        .update({
          status: "Disponível",
          estado_conservacao: estadoDevolucao,
        })
        .eq("id", selectedCautela.armamento_id);
    },
    onSuccess: () => {
      toast.success("Devolução concluída e armamento reinserido na reserva.");
      qc.invalidateQueries({ queryKey: ["cautelas-armamento"] });
      qc.invalidateQueries({ queryKey: ["armamentos"] });
      setDevolverModalOpen(false);
      setSelectedCautela(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Shield}
        title="Intendência e Controle de Armamento"
        description="Inventário bélico serializado, fluxo de cautela com travas de segurança e conferência de devolução."
        actions={
          canManage && (
            <div className="flex gap-2">
              <Button onClick={() => setNovoArmaModalOpen(true)} variant="outline">
                <Plus className="mr-1.5 h-4 w-4" /> Novo Armamento
              </Button>
              <Button onClick={() => setNovaCautelaModalOpen(true)} className="bg-primary text-primary-foreground">
                <Shield className="mr-1.5 h-4 w-4" /> Registrar Cautela
              </Button>
            </div>
          )
        }
      />

      {/* Cards de Indicadores Bélicos */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground uppercase font-semibold">
            <span>Disponíveis na Reserva</span>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-success">{armasDisponiveis}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Prontos para cautela</p>
        </div>

        <div className="rounded-lg border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground uppercase font-semibold">
            <span>Armas Cauteladas</span>
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-primary">{armasCauteladas}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Em porte operacional de policiais</p>
        </div>

        <div className="rounded-lg border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground uppercase font-semibold">
            <span>Devoluções em Atraso</span>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-destructive">{cautelasAtrasadas.length}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Prazo de plantão expirado</p>
        </div>

        <div className="rounded-lg border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground uppercase font-semibold">
            <span>Em Manutenção</span>
            <Wrench className="h-4 w-4 text-warning" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-warning">{armasEmManutencao}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Indisponíveis temporariamente</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-card border">
          <TabsTrigger value="inventario">Inventário Bélico ({armamentos.length})</TabsTrigger>
          <TabsTrigger value="cautelas">Cautelas Ativas e Histórico ({cautelas.length})</TabsTrigger>
          {canManage && <TabsTrigger value="manutencao">Manutenções ({manutencoes.length})</TabsTrigger>}
        </TabsList>

        {/* Tab Inventário */}
        <TabsContent value="inventario" className="space-y-4">
          <div className="rounded-lg border bg-card overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/70 text-xs uppercase font-semibold text-muted-foreground border-b">
                  <tr>
                    <th className="p-3">Armamento</th>
                    <th className="p-3">Nº de Série</th>
                    <th className="p-3">Patrimônio</th>
                    <th className="p-3">Localização</th>
                    <th className="p-3">Conservação</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {armamentos.map((a) => (
                    <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-medium text-foreground">
                        {a.tipo} — {a.marca} {a.modelo}
                      </td>
                      <td className="p-3 font-mono text-xs font-bold text-foreground">{a.numero_serie}</td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">{a.numero_patrimonio || "—"}</td>
                      <td className="p-3 text-xs text-muted-foreground">{a.localizacao_fisica || "Reserva"}</td>
                      <td className="p-3">
                        <StatusBadge status={a.estado_conservacao} size="sm" />
                      </td>
                      <td className="p-3">
                        <StatusBadge status={a.status} size="sm" />
                      </td>
                    </tr>
                  ))}
                  {armamentos.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground text-xs">
                        Nenhum armamento cadastrado no inventário da intendência.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Tab Cautelas */}
        <TabsContent value="cautelas" className="space-y-4">
          <div className="rounded-lg border bg-card overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/70 text-xs uppercase font-semibold text-muted-foreground border-b">
                  <tr>
                    <th className="p-3">Armamento</th>
                    <th className="p-3">Policial Cautelante</th>
                    <th className="p-3">Retirada</th>
                    <th className="p-3">Devolução Prevista</th>
                    <th className="p-3">Situação</th>
                    {canManage && <th className="p-3 text-right">Ação</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {cautelas.map((c) => {
                    const isAtrasado =
                      c.status === "Ativa" &&
                      c.data_devolucao_prevista &&
                      new Date(c.data_devolucao_prevista).getTime() < Date.now();

                    return (
                      <tr key={c.id} className={`hover:bg-muted/30 transition-colors ${isAtrasado ? "bg-destructive/10" : ""}`}>
                        <td className="p-3">
                          <div className="font-bold text-foreground">
                            {c.armamento?.tipo} {c.armamento?.modelo}
                          </div>
                          <div className="text-xs font-mono text-muted-foreground">
                            Série: {c.armamento?.numero_serie}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-foreground">{c.servidor?.nome_completo || "Servidor"}</div>
                          <div className="text-xs text-muted-foreground font-mono">{c.servidor?.matricula_funcional}</div>
                        </td>
                        <td className="p-3 font-mono text-xs">
                          {c.data_retirada ? new Date(c.data_retirada).toLocaleString("pt-BR") : "—"}
                        </td>
                        <td className="p-3 font-mono text-xs">
                          {c.data_devolucao_prevista ? new Date(c.data_devolucao_prevista).toLocaleString("pt-BR") : "—"}
                          {isAtrasado && (
                            <Badge variant="destructive" className="ml-1 text-[10px]">
                              ATRASO
                            </Badge>
                          )}
                        </td>
                        <td className="p-3">
                          <StatusBadge status={c.status} size="sm" />
                        </td>
                        {canManage && (
                          <td className="p-3 text-right">
                            {c.status === "Ativa" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-success text-success hover:bg-success/10"
                                onClick={() => {
                                  setSelectedCautela(c);
                                  setDevolverModalOpen(true);
                                }}
                              >
                                Receber Devolução
                              </Button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {cautelas.length === 0 && (
                    <tr>
                      <td colSpan={canManage ? 6 : 5} className="p-8 text-center text-muted-foreground text-xs">
                        Nenhuma cautela ativa ou histórica encontrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Tab Manutenções */}
        {canManage && (
          <TabsContent value="manutencao" className="space-y-4">
            <div className="rounded-lg border bg-card overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/70 text-xs uppercase font-semibold text-muted-foreground border-b">
                    <tr>
                      <th className="p-3">Armamento</th>
                      <th className="p-3">Tipo</th>
                      <th className="p-3">Descrição Técnica</th>
                      <th className="p-3">Responsável</th>
                      <th className="p-3">Data Entrada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {manutencoes.map((m) => (
                      <tr key={m.id} className="hover:bg-muted/30">
                        <td className="p-3">
                          <div className="font-bold text-foreground">
                            {m.armamento?.tipo} {m.armamento?.modelo}
                          </div>
                          <div className="font-mono text-xs text-muted-foreground">Série: {m.armamento?.numero_serie}</div>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline">{m.tipo}</Badge>
                        </td>
                        <td className="p-3 text-xs">{m.descricao_tecnica}</td>
                        <td className="p-3 text-xs font-medium">{m.responsavel || "Armeiro"}</td>
                        <td className="p-3 font-mono text-xs">{m.data_entrada}</td>
                      </tr>
                    ))}
                    {manutencoes.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-muted-foreground text-xs">
                          Nenhum registro de manutenção bélica.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Modal: Novo Armamento */}
      <Dialog open={novoArmaModalOpen} onOpenChange={setNovoArmaModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cadastrar Armamento no Inventário</DialogTitle>
            <DialogDescription>
              Inclusão de armamento controlado com número de série único.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo de Item *</Label>
                <Select value={armaTipo} onValueChange={(v: any) => setArmaTipo(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ARMAMENTO_TIPOS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Estado de Conservação</Label>
                <Select value={armaConservacao} onValueChange={(v: any) => setArmaConservacao(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESTADOS_CONSERVACAO.map((e) => (
                      <SelectItem key={e} value={e}>
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Marca *</Label>
                <Input value={armaMarca} onChange={(e) => setArmaMarca(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Modelo *</Label>
                <Input value={armaModelo} onChange={(e) => setArmaModelo(e.target.value)} required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Número de Série *</Label>
                <Input
                  placeholder="Ex: SDZ12345"
                  value={armaSerie}
                  onChange={(e) => setArmaSerie(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Patrimônio (Opcional)</Label>
                <Input
                  placeholder="Ex: PAT-0982"
                  value={armaPatrimonio}
                  onChange={(e) => setArmaPatrimonio(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Localização na Reserva</Label>
              <Input value={armaLocal} onChange={(e) => setArmaLocal(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoArmaModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => createArmamentoMutation.mutate()} disabled={createArmamentoMutation.isPending}>
              {createArmamentoMutation.isPending ? "Cadastrando..." : "Salvar no Inventário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Registrar Cautela */}
      <Dialog open={novaCautelaModalOpen} onOpenChange={setNovaCautelaModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Cautela de Armamento</DialogTitle>
            <DialogDescription>
              Entrega formal de equipamento bélico para plantão ou missão autorizada.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Armamento Disponível *</Label>
              <Select value={cautelaArmaId} onValueChange={setCautelaArmaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o armamento" />
                </SelectTrigger>
                <SelectContent>
                  {armamentos
                    .filter((a) => a.status === "Disponível")
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.tipo} {a.modelo} — Série: {a.numero_serie} ({a.estado_conservacao})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Policial Responsável (Cautelante) *</Label>
              <Select value={cautelaServidorId} onValueChange={setCautelaServidorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o servidor" />
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

            <div className="space-y-1">
              <Label>Previsão de Devolução *</Label>
              <Input
                type="datetime-local"
                value={cautelaDevPrevista}
                onChange={(e) => setCautelaDevPrevista(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Observações / Quantidade de Munições</Label>
              <Input
                placeholder="Ex: Acompanha 3 carregadores e 45 munições intactas"
                value={cautelaObs}
                onChange={(e) => setCautelaObs(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNovaCautelaModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => createCautelaMutation.mutate()} disabled={createCautelaMutation.isPending}>
              {createCautelaMutation.isPending ? "Processando..." : "Confirmar Cautela"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Receber Devolução */}
      <Dialog open={devolverModalOpen} onOpenChange={setDevolverModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Conferência de Devolução</DialogTitle>
            <DialogDescription>
              Vistoria física obrigatória do armamento devolvido pelo policial.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="bg-muted/30 p-3 rounded-md text-xs space-y-1">
              <div className="font-semibold text-foreground">
                Item: {selectedCautela?.armamento?.tipo} {selectedCautela?.armamento?.modelo}
              </div>
              <div className="text-muted-foreground font-mono">
                Série: {selectedCautela?.armamento?.numero_serie} • Cautelante: {selectedCautela?.servidor?.nome_completo}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Estado de Conservação na Devolução *</Label>
              <Select value={estadoDevolucao} onValueChange={(v: any) => setEstadoDevolucao(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS_CONSERVACAO.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Anotações da Conferência</Label>
              <Input
                placeholder="Ex: Limpeza e contagem de munições conferidas sem alterações"
                value={obsDevolucao}
                onChange={(e) => setObsDevolucao(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDevolverModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-success text-success-foreground hover:bg-success/90"
              onClick={() => devolverCautelaMutation.mutate()}
              disabled={devolverCautelaMutation.isPending}
            >
              {devolverCautelaMutation.isPending ? "Conferindo..." : "Efetivar Devolução"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
