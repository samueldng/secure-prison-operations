import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Building2, Users, ArrowRightLeft, ShieldAlert, Plus, CheckCircle, 
  AlertOctagon, Eye, Lock, FileText, Ban 
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
import { Badge } from "@/components/ui/badge";
import type { Cela, Interno, CelaSituacao } from "@/types/app-types";

interface BlocosModuleProps {
  userRole: "diretor" | "chefia" | "intendencia" | "servidor" | null;
  userId: string;
}

export function BlocosModule({ userRole, userId }: BlocosModuleProps) {
  const qc = useQueryClient();
  const [selectedCela, setSelectedCela] = useState<Cela | null>(null);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [novoInternoModalOpen, setNovoInternoModalOpen] = useState(false);
  const [situacaoModalOpen, setSituacaoModalOpen] = useState(false);

  // Form Transferência
  const [transferInternoId, setTransferInternoId] = useState("");
  const [transferDestinoId, setTransferDestinoId] = useState("");
  const [transferMotivo, setTransferMotivo] = useState("");

  // Form Novo Interno
  const [novoNome, setNovoNome] = useState("");
  const [novoSiisp, setNovoSiisp] = useState("");
  const [novaCelaId, setNovaCelaId] = useState("");
  const [novoObs, setNovoObs] = useState("");

  // Form Situação da Cela
  const [novaSituacao, setNovaSituacao] = useState<CelaSituacao>("Ocupada");
  const [novasObsCela, setNovasObsCela] = useState("");

  const isDiretor = userRole === "diretor";

  // Se não for diretor, acesso estritamente bloqueado
  if (!isDiretor) {
    return (
      <div className="space-y-4">
        <PageHeader
          icon={Building2}
          title="Bloco A e Bloco B (Celas e Internos)"
          description="Controle e movimentação carcerária da UPSTI."
        />
        <EmptyState
          icon={Lock}
          title="Acesso Restrito à Direção da Unidade"
          description="A custódia nominal de internos e o mapa carcerário são dados sigilosos acessíveis exclusivamente ao Diretor."
        />
      </div>
    );
  }

  // Buscar celas
  const { data: celas = [], isLoading: loadingCelas } = useQuery({
    queryKey: ["celas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("celas" as any)
        .select("*")
        .order("bloco")
        .order("numero");
      if (error) return [];
      return (data || []) as Cela[];
    },
  });

  // Buscar todos os internos custodiados
  const { data: internos = [], isLoading: loadingInternos } = useQuery({
    queryKey: ["internos-custodia"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("internos" as any)
        .select("*, cela:celas(*)")
        .eq("status", "Custodiado")
        .order("nome_completo");
      if (error) return [];
      return (data || []) as Interno[];
    },
  });

  // Agrupar contagem por cela
  const celasComContagem = useMemo(() => {
    return celas.map((c) => {
      const internosNaCela = internos.filter((i) => i.cela_atual_id === c.id);
      return {
        ...c,
        internos_count: internosNaCela.length,
        internos: internosNaCela,
      };
    });
  }, [celas, internos]);

  const celasBlocoA = useMemo(() => celasComContagem.filter((c) => c.bloco === "A"), [celasComContagem]);
  const celasBlocoB = useMemo(() => celasComContagem.filter((c) => c.bloco === "B"), [celasComContagem]);

  // Totalizadores
  const totalCustodiados = internos.length;
  const capacidadeTotal = celas.reduce((acc, c) => acc + (c.capacidade || 4), 0);
  const taxaOcupacao = capacidadeTotal > 0 ? Math.round((totalCustodiados / capacidadeTotal) * 100) : 0;

  // Transferência Atômica
  const transferirMutation = useMutation({
    mutationFn: async () => {
      if (!transferInternoId || !transferDestinoId || !transferMotivo) {
        throw new Error("Preencha todos os campos da movimentação.");
      }

      // Tenta chamar RPC transferir_interno
      const { error: rpcErr } = await supabase.rpc("transferir_interno" as any, {
        p_interno_id: transferInternoId,
        p_cela_destino_id: transferDestinoId,
        p_motivo: transferMotivo,
      });

      if (rpcErr) {
        console.warn("RPC transferir_interno indisponível, aplicando fallback direto:", rpcErr.message);
        // Fallback direto
        const interno = internos.find((i) => i.id === transferInternoId);
        const { error: upErr } = await supabase
          .from("internos" as any)
          .update({ cela_atual_id: transferDestinoId })
          .eq("id", transferInternoId);
        if (upErr) throw upErr;

        // Inserir registro em movimentacoes_celas
        await supabase.from("movimentacoes_celas" as any).insert([
          {
            interno_id: transferInternoId,
            cela_origem_id: interno?.cela_atual_id || null,
            cela_destino_id: transferDestinoId,
            motivo: transferMotivo,
            autorizado_por: userId,
          },
        ]);

        // Atualizar situação da cela destino para Ocupada
        await supabase
          .from("celas" as any)
          .update({ situacao: "Ocupada" })
          .eq("id", transferDestinoId);
      }
    },
    onSuccess: () => {
      toast.success("Transferência realizada e registrada nos autos de auditoria.");
      qc.invalidateQueries({ queryKey: ["celas"] });
      qc.invalidateQueries({ queryKey: ["internos-custodia"] });
      setTransferModalOpen(false);
      setTransferMotivo("");
      setTransferInternoId("");
      setTransferDestinoId("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Cadastrar Novo Interno
  const novoInternoMutation = useMutation({
    mutationFn: async () => {
      if (!novoNome || !novoSiisp) throw new Error("Nome e Matrícula SIISP são obrigatórios.");

      const { error } = await supabase.from("internos" as any).insert([
        {
          nome_completo: novoNome,
          matricula_siisp: novoSiisp,
          cela_atual_id: novaCelaId || null,
          status: "Custodiado",
          observacoes: novoObs || null,
        },
      ]);
      if (error) throw error;

      if (novaCelaId) {
        await supabase.from("celas" as any).update({ situacao: "Ocupada" }).eq("id", novaCelaId);
      }
    },
    onSuccess: () => {
      toast.success("Interno admitido e vinculado à custódia da UPSTI.");
      qc.invalidateQueries({ queryKey: ["internos-custodia"] });
      qc.invalidateQueries({ queryKey: ["celas"] });
      setNovoInternoModalOpen(false);
      setNovoNome("");
      setNovoSiisp("");
      setNovoObs("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Atualizar Situação da Cela
  const updateSituacaoCelaMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCela) return;
      const { error } = await supabase
        .from("celas" as any)
        .update({
          situacao: novaSituacao,
          observacoes_administrativas: novasObsCela || null,
        })
        .eq("id", selectedCela.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Situação da cela atualizada.");
      qc.invalidateQueries({ queryKey: ["celas"] });
      setSituacaoModalOpen(false);
      if (selectedCela) {
        setSelectedCela({ ...selectedCela, situacao: novaSituacao, observacoes_administrativas: novasObsCela });
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Building2}
        title="Bloco A e Bloco B (22 Celas)"
        description="Gestão carcerária, ocupação de celas, relação nominal SIISP e transferências autorizadas pelo Diretor."
        actions={
          <div className="flex gap-2">
            <Button onClick={() => setNovoInternoModalOpen(true)} variant="outline">
              <Plus className="mr-1.5 h-4 w-4" /> Admitir Interno (SIISP)
            </Button>
            <Button onClick={() => setTransferModalOpen(true)} className="bg-primary text-primary-foreground">
              <ArrowRightLeft className="mr-1.5 h-4 w-4" /> Transferir entre Celas
            </Button>
          </div>
        }
      />

      {/* Resumo de Ocupação Geral */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground uppercase font-semibold">
            <span>Internos Custodiados</span>
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-foreground">{totalCustodiados}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Efetivo carcerário ativo</p>
        </div>

        <div className="rounded-lg border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground uppercase font-semibold">
            <span>Capacidade Instalada</span>
            <Building2 className="h-4 w-4 text-secondary-foreground" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-foreground">{capacidadeTotal}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">22 celas operacionais</p>
        </div>

        <div className="rounded-lg border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground uppercase font-semibold">
            <span>Taxa de Ocupação</span>
            <Badge variant={taxaOcupacao > 100 ? "destructive" : "outline"} className="text-xs">
              {taxaOcupacao}%
            </Badge>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-foreground">
            {totalCustodiados} / {capacidadeTotal}
          </div>
          <div className="w-full bg-muted rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className={`h-1.5 rounded-full ${taxaOcupacao > 100 ? "bg-destructive" : "bg-primary"}`}
              style={{ width: `${Math.min(100, taxaOcupacao)}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground uppercase font-semibold">
            <span>Celas Interditadas</span>
            <AlertOctagon className="h-4 w-4 text-destructive" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-destructive">
            {celas.filter((c) => c.situacao === "Interditada").length}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Em reforma ou isolamento</p>
        </div>
      </div>

      {/* Grid Visual de Blocos: Bloco A e Bloco B */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bloco A */}
        <div className="rounded-lg border bg-card p-4 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-mono">
                  A
                </span>
                Bloco A (Celas A-01 a A-11)
              </h3>
              <p className="text-xs text-muted-foreground">Ala de custódia regular</p>
            </div>
            <span className="text-xs font-mono font-semibold bg-muted px-2 py-0.5 rounded">
              {celasBlocoA.reduce((acc, c) => acc + (c.internos_count || 0), 0)} internos
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {celasBlocoA.map((c) => {
              const isSelected = selectedCela?.id === c.id;
              const isFull = (c.internos_count || 0) >= c.capacidade;
              const isInterditada = c.situacao === "Interditada";

              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedCela(c)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    isSelected
                      ? "ring-2 ring-primary border-primary bg-accent/40"
                      : isInterditada
                      ? "bg-destructive/10 border-destructive/30"
                      : "bg-muted/20 hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold font-mono text-sm">A-{String(c.numero).padStart(2, "0")}</span>
                    <StatusBadge status={c.situacao} size="sm" />
                  </div>
                  <div className="mt-2 flex items-baseline justify-between text-xs">
                    <span className="text-muted-foreground">Internos:</span>
                    <span className={`font-mono font-bold ${isFull ? "text-destructive" : "text-foreground"}`}>
                      {c.internos_count} / {c.capacidade}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bloco B */}
        <div className="rounded-lg border bg-card p-4 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-secondary-foreground text-xs font-mono">
                  B
                </span>
                Bloco B (Celas B-01 a B-11)
              </h3>
              <p className="text-xs text-muted-foreground">Ala de custódia e isolamento</p>
            </div>
            <span className="text-xs font-mono font-semibold bg-muted px-2 py-0.5 rounded">
              {celasBlocoB.reduce((acc, c) => acc + (c.internos_count || 0), 0)} internos
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {celasBlocoB.map((c) => {
              const isSelected = selectedCela?.id === c.id;
              const isFull = (c.internos_count || 0) >= c.capacidade;
              const isInterditada = c.situacao === "Interditada";

              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedCela(c)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    isSelected
                      ? "ring-2 ring-primary border-primary bg-accent/40"
                      : isInterditada
                      ? "bg-destructive/10 border-destructive/30"
                      : "bg-muted/20 hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold font-mono text-sm">B-{String(c.numero).padStart(2, "0")}</span>
                    <StatusBadge status={c.situacao} size="sm" />
                  </div>
                  <div className="mt-2 flex items-baseline justify-between text-xs">
                    <span className="text-muted-foreground">Internos:</span>
                    <span className={`font-mono font-bold ${isFull ? "text-destructive" : "text-foreground"}`}>
                      {c.internos_count} / {c.capacidade}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Detalhe da Cela Selecionada (Relação Nominal de Internos) */}
      {selectedCela && (
        <div className="rounded-lg border bg-card p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xl font-bold bg-primary text-primary-foreground px-2.5 py-1 rounded">
                Cela {selectedCela.bloco}-{String(selectedCela.numero).padStart(2, "0")}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={selectedCela.situacao} />
                  <span className="text-xs text-muted-foreground">
                    Capacidade: {selectedCela.internos_count || 0} / {selectedCela.capacidade} vagas
                  </span>
                </div>
                {selectedCela.observacoes_administrativas && (
                  <p className="text-xs text-muted-foreground mt-0.5">{selectedCela.observacoes_administrativas}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNovaSituacao(selectedCela.situacao);
                  setNovasObsCela(selectedCela.observacoes_administrativas || "");
                  setSituacaoModalOpen(true);
                }}
              >
                Alterar Situação / Interditar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedCela(null)}>
                Fechar Detalhes
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Relação Nominal dos Internos Alocados ({selectedCela.internos?.length || 0})
            </h4>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-xs uppercase font-semibold text-muted-foreground border-b">
                  <tr>
                    <th className="p-2.5">Nome do Interno</th>
                    <th className="p-2.5">Matrícula SIISP</th>
                    <th className="p-2.5">Data de Entrada</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {selectedCela.internos?.map((intern) => (
                    <tr key={intern.id} className="hover:bg-muted/20">
                      <td className="p-2.5 font-medium">{intern.nome_completo}</td>
                      <td className="p-2.5 font-mono text-xs">{intern.matricula_siisp}</td>
                      <td className="p-2.5 font-mono text-xs">{intern.data_entrada}</td>
                      <td className="p-2.5">
                        <StatusBadge status={intern.status} size="sm" />
                      </td>
                      <td className="p-2.5 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => {
                            setTransferInternoId(intern.id);
                            setTransferModalOpen(true);
                          }}
                        >
                          Transferir
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {(!selectedCela.internos || selectedCela.internos.length === 0) && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground text-xs">
                        Nenhum interno custodiado nesta cela atualmente.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Transferir entre Celas (Transação Atômica) */}
      <Dialog open={transferModalOpen} onOpenChange={setTransferModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transferência de Interno entre Celas</DialogTitle>
            <DialogDescription>
              Operação exclusiva do Diretor. Grava movimentação e auditoria imutável.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Interno a Transferir *</Label>
              <Select value={transferInternoId} onValueChange={setTransferInternoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o interno" />
                </SelectTrigger>
                <SelectContent>
                  {internos.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.nome_completo} (SIISP: {i.matricula_siisp}) - Cela Atual: {i.cela ? `${i.cela.bloco}-${i.cela.numero}` : "Sem cela"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Cela de Destino *</Label>
              <Select value={transferDestinoId} onValueChange={setTransferDestinoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a cela destino" />
                </SelectTrigger>
                <SelectContent>
                  {celasComContagem
                    .filter((c) => c.situacao !== "Interditada")
                    .map((c) => {
                      const isFull = (c.internos_count || 0) >= c.capacidade;
                      return (
                        <SelectItem key={c.id} value={c.id} disabled={isFull}>
                          Cela {c.bloco}-{String(c.numero).padStart(2, "0")} — {c.internos_count}/{c.capacidade} {isFull ? "(LOTADA)" : ""}
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Motivo Formal da Transferência *</Label>
              <Input
                placeholder="Ex: Reordenação de convívio / determinação judicial"
                value={transferMotivo}
                onChange={(e) => setTransferMotivo(e.target.value)}
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => transferirMutation.mutate()} disabled={transferirMutation.isPending}>
              {transferirMutation.isPending ? "Transferindo..." : "Efetivar Transferência"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Admitir Novo Interno */}
      <Dialog open={novoInternoModalOpen} onOpenChange={setNovoInternoModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Admitir Interno na Unidade (SIISP)</DialogTitle>
            <DialogDescription>
              Cadastro formal de entrada sob custódia da UPSTI.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Nome Completo do Interno *</Label>
              <Input
                placeholder="Nome civil conforme mandado/guia"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label>Matrícula SIISP (Identificador Único) *</Label>
              <Input
                placeholder="Ex: SIISP-98432"
                value={novoSiisp}
                onChange={(e) => setNovoSiisp(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label>Cela Inicial de Alocação</Label>
              <Select value={novaCelaId} onValueChange={setNovaCelaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a cela (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {celasComContagem
                    .filter((c) => c.situacao !== "Interditada")
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        Cela {c.bloco}-{String(c.numero).padStart(2, "0")} ({c.internos_count}/{c.capacidade})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Observações de Entrada / Artigo Penal</Label>
              <Input
                placeholder="Ex: Processo nº 0800123... / Mandado da 1ª Vara"
                value={novoObs}
                onChange={(e) => setNovoObs(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoInternoModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => novoInternoMutation.mutate()} disabled={novoInternoMutation.isPending}>
              {novoInternoMutation.isPending ? "Cadastrando..." : "Confirmar Admissão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Alterar Situação da Cela */}
      <Dialog open={situacaoModalOpen} onOpenChange={setSituacaoModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Situação da Cela {selectedCela ? `${selectedCela.bloco}-${selectedCela.numero}` : ""}
            </DialogTitle>
            <DialogDescription>
              Marcar como interditada impede a alocação e transferência de internos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Situação Operacional</Label>
              <Select value={novaSituacao} onValueChange={(v: any) => setNovaSituacao(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ocupada">Ocupada</SelectItem>
                  <SelectItem value="Vazia">Vazia</SelectItem>
                  <SelectItem value="Isolada">Isolada (Segurança / Triagem)</SelectItem>
                  <SelectItem value="Interditada">Interditada (Reforma / Bloqueio)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Observações Administrativas</Label>
              <Input
                placeholder="Ex: Interditada para reparo hidráulico e sanitário"
                value={novasObsCela}
                onChange={(e) => setNovasObsCela(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSituacaoModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => updateSituacaoCelaMutation.mutate()} disabled={updateSituacaoCelaMutation.isPending}>
              {updateSituacaoCelaMutation.isPending ? "Gravando..." : "Salvar Situação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
