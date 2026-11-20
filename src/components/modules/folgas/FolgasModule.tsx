import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  CalendarCheck, Plus, CheckCircle2, XCircle, ArrowUpRight, 
  ArrowDownLeft, Clock, ShieldCheck, Filter, FileText 
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
import type { FolgaLedger, Servidor } from "@/types/app-types";
import { calcularFolgas } from "@/types/app-types";

interface FolgasModuleProps {
  userRole: "diretor" | "chefia" | "intendencia" | "servidor" | null;
  userId: string;
}

export function FolgasModule({ userRole, userId }: FolgasModuleProps) {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [servidorFilter, setServidorFilter] = useState<string>("todos");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [origemFilter, setOrigemFilter] = useState<string>("todos");

  // Form State
  const [formServidorId, setFormServidorId] = useState("");
  const [formTipo, setFormTipo] = useState<"credito" | "debito">("debito");
  const [formHoras, setFormHoras] = useState("12");
  const [formOrigem, setFormOrigem] = useState<"gozo" | "compensacao" | "regulamentar">("gozo");
  const [formDataRef, setFormDataRef] = useState(new Date().toISOString().split("T")[0]);
  const [formDescricao, setFormDescricao] = useState("");

  const isDiretor = userRole === "diretor";
  const isChefia = userRole === "chefia";
  const isServidor = userRole === "servidor";

  // Buscar servidores para os selects
  const { data: servidores = [] } = useQuery({
    queryKey: ["servidores-folgas"],
    queryFn: async () => {
      let query = supabase.from("servidores" as any).select("*").order("nome_completo");
      if (isServidor) {
        query = query.eq("user_id", userId);
      }
      const { data, error } = await query;
      if (error) return [];
      return (data || []) as Servidor[];
    },
  });

  const ownServidor = servidores.find((s) => s.user_id === userId);

  // Buscar lançamentos do ledger
  const { data: lancamentos = [], isLoading } = useQuery({
    queryKey: ["folgas-ledger"],
    queryFn: async () => {
      let query = supabase
        .from("folgas_ledger" as any)
        .select("*, servidor:servidores(*)")
        .order("created_at", { ascending: false });

      if (isServidor && ownServidor) {
        query = query.eq("servidor_id", ownServidor.id);
      }
      const { data, error } = await query;
      if (error) return [];
      return (data || []) as FolgaLedger[];
    },
  });

  // Mutação: Novo Lançamento / Solicitação de Folga
  const createLancamentoMutation = useMutation({
    mutationFn: async () => {
      const targetServidorId = isServidor ? ownServidor?.id : formServidorId;
      if (!targetServidorId) throw new Error("Selecione um servidor válido.");

      const payload = {
        servidor_id: targetServidorId,
        tipo: formTipo,
        horas: Number(formHoras),
        origem: formOrigem,
        data_referencia: formDataRef,
        descricao: formDescricao || (formTipo === "debito" ? "Solicitação de gozo de folga" : "Crédito regulamentar"),
        status: isDiretor ? "Aprovada" : "Pendente",
        aprovado_por: isDiretor ? userId : null,
        aprovado_em: isDiretor ? new Date().toISOString() : null,
      };

      const { error } = await supabase.from("folgas_ledger" as any).insert([payload]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isDiretor ? "Lançamento efetuado e aprovado!" : "Solicitação de folga enviada à Direção.");
      qc.invalidateQueries({ queryKey: ["folgas-ledger"] });
      setModalOpen(false);
      setFormDescricao("");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao registrar folga.");
    },
  });

  // Mutação: Aprovar / Rejeitar Folga (Exclusivo Diretor)
  const decisaoMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "Aprovada" | "Rejeitada" }) => {
      const { error } = await supabase
        .from("folgas_ledger" as any)
        .update({
          status,
          aprovado_por: userId,
          aprovado_em: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast.success(`Folga marcada como ${vars.status}.`);
      qc.invalidateQueries({ queryKey: ["folgas-ledger"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Cálculos contábeis agregados
  const saldosGerais = useMemo(() => {
    let creditosTotal = 0;
    let debitosTotal = 0;

    lancamentos.forEach((l) => {
      if (l.status === "Aprovada" || l.status === "Gozada") {
        if (l.tipo === "credito") creditosTotal += Number(l.horas);
        if (l.tipo === "debito") debitosTotal += Number(l.horas);
      }
    });

    const saldoLiquido = Math.max(0, creditosTotal - debitosTotal);
    const { folgasInteiras, residuo } = calcularFolgas(saldoLiquido);

    return { creditosTotal, debitosTotal, saldoLiquido, folgasInteiras, residuo };
  }, [lancamentos]);

  // Filtros
  const filteredLancamentos = useMemo(() => {
    return lancamentos.filter((l) => {
      const matchServidor = servidorFilter === "todos" || l.servidor_id === servidorFilter;
      const matchStatus = statusFilter === "todos" || l.status === statusFilter;
      const matchOrigem = origemFilter === "todos" || l.origem === origemFilter;
      return matchServidor && matchStatus && matchOrigem;
    });
  }, [lancamentos, servidorFilter, statusFilter, origemFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CalendarCheck}
        title="Folgas Regulamentares e Compensações"
        description="Razão contábil (crédito/débito) de horas acumuladas por missões e compensações. Regra: 12h acumuladas = 1 folga de 12h."
        actions={
          <Button onClick={() => setModalOpen(true)} className="bg-primary text-primary-foreground">
            <Plus className="mr-2 h-4 w-4" /> {isServidor ? "Solicitar Gozo de Folga" : "Lançar no Razão"}
          </Button>
        }
      />

      {/* Cards de Saldo Contábil */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground uppercase font-semibold">
            <span>Total de Créditos</span>
            <ArrowUpRight className="h-4 w-4 text-success" />
          </div>
          <div className="mt-2 text-2xl font-bold text-success font-mono">+{saldosGerais.creditosTotal}h</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Missões e compensações aprovadas</p>
        </div>

        <div className="rounded-lg border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground uppercase font-semibold">
            <span>Folgas Usufruídas</span>
            <ArrowDownLeft className="h-4 w-4 text-destructive" />
          </div>
          <div className="mt-2 text-2xl font-bold text-destructive font-mono">-{saldosGerais.debitosTotal}h</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Débitos efetivados em gozo</p>
        </div>

        <div className="rounded-lg border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground uppercase font-semibold">
            <span>Saldo Líquido</span>
            <Clock className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground font-mono">{saldosGerais.saldoLiquido}h</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Horas ativas no banco</p>
        </div>

        <div className="rounded-lg border bg-card p-4 shadow-xs bg-primary/5 border-primary/20">
          <div className="flex items-center justify-between text-xs text-primary font-bold uppercase">
            <span>Folgas de 12h Prontas</span>
            <ShieldCheck className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold text-primary font-mono">
            {saldosGerais.folgasInteiras} <span className="text-xs font-normal">folga(s)</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Resíduo restante: {saldosGerais.residuo}h</p>
        </div>
      </div>

      {/* Filtros Rápidos */}
      <div className="grid gap-3 sm:grid-cols-3 bg-card p-4 rounded-lg border shadow-xs">
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
              <SelectValue placeholder="Filtrar por Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Status</SelectItem>
              <SelectItem value="Pendente">Pendentes de Aprovação</SelectItem>
              <SelectItem value="Aprovada">Aprovadas</SelectItem>
              <SelectItem value="Rejeitada">Rejeitadas</SelectItem>
              <SelectItem value="Gozada">Gozadas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Select value={origemFilter} onValueChange={setOrigemFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Origem do Lançamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as Origens</SelectItem>
              <SelectItem value="missao_externa">Missão Externa</SelectItem>
              <SelectItem value="regulamentar">Regulamentar</SelectItem>
              <SelectItem value="compensacao">Compensação</SelectItem>
              <SelectItem value="gozo">Gozo de Folga</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabela Razão Contábil */}
      <div className="rounded-lg border bg-card overflow-hidden shadow-xs">
        <div className="p-3 bg-muted/40 border-b flex items-center justify-between">
          <h3 className="font-semibold text-sm">Razão Contábil de Folgas (Ledger)</h3>
          <span className="text-xs text-muted-foreground">{filteredLancamentos.length} registro(s)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/70 text-xs uppercase font-semibold text-muted-foreground border-b">
              <tr>
                <th className="p-3">Data Ref.</th>
                <th className="p-3">Servidor</th>
                <th className="p-3">Tipo / Horas</th>
                <th className="p-3">Origem & Descrição</th>
                <th className="p-3">Situação</th>
                {isDiretor && <th className="p-3 text-right">Ação da Direção</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredLancamentos.map((l) => (
                <tr key={l.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-mono text-xs">{l.data_referencia || "—"}</td>
                  <td className="p-3 font-medium text-foreground">
                    {l.servidor?.nome_completo || "Servidor"}
                    <div className="text-[11px] text-muted-foreground font-mono">{l.servidor?.matricula_funcional}</div>
                  </td>
                  <td className="p-3 font-mono">
                    <span
                      className={`inline-flex items-center gap-1 font-bold ${
                        l.tipo === "credito" ? "text-success" : "text-destructive"
                      }`}
                    >
                      {l.tipo === "credito" ? `+${l.horas}h` : `-${l.horas}h`}
                    </span>
                  </td>
                  <td className="p-3 text-xs">
                    <div className="font-medium capitalize">{l.origem.replace("_", " ")}</div>
                    <div className="text-muted-foreground">{l.descricao || "Sem observações adicionais"}</div>
                  </td>
                  <td className="p-3">
                    <StatusBadge status={l.status} size="sm" />
                  </td>
                  {isDiretor && (
                    <td className="p-3 text-right">
                      {l.status === "Pendente" && (
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-success text-success hover:bg-success/10"
                            onClick={() => decisaoMutation.mutate({ id: l.id, status: "Aprovada" })}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Autorizar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-destructive text-destructive hover:bg-destructive/10"
                            onClick={() => decisaoMutation.mutate({ id: l.id, status: "Rejeitada" })}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" /> Negar
                          </Button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {filteredLancamentos.length === 0 && (
                <tr>
                  <td colSpan={isDiretor ? 6 : 5} className="p-8 text-center text-muted-foreground text-xs">
                    {isLoading ? "Carregando lançamentos..." : "Nenhum lançamento no razão encontrado."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Lançamento */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isServidor ? "Solicitar Gozo de Folga" : "Lançamento no Razão Contábil"}</DialogTitle>
            <DialogDescription>
              Concessões de folga exigem aprovação mandatória do Diretor da Unidade.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {!isServidor && (
              <div className="space-y-1">
                <Label>Servidor Beneficiário *</Label>
                <Select value={formServidorId} onValueChange={setFormServidorId}>
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
            )}

            {!isServidor && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Tipo de Lançamento</Label>
                  <Select value={formTipo} onValueChange={(v: any) => setFormTipo(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="debito">Débito (Gozo de folga)</SelectItem>
                      <SelectItem value="credito">Crédito (Horas concedidas)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Origem</Label>
                  <Select value={formOrigem} onValueChange={(v: any) => setFormOrigem(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gozo">Gozo Regular</SelectItem>
                      <SelectItem value="compensacao">Compensação</SelectItem>
                      <SelectItem value="regulamentar">Regulamentar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Horas ({formTipo === "debito" ? "Gozo" : "Crédito"})</Label>
                <Select value={formHoras} onValueChange={setFormHoras}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12">12 horas (1 plantão)</SelectItem>
                    <SelectItem value="24">24 horas (2 plantões de 12h)</SelectItem>
                    <SelectItem value="6">6 horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Data de Referência</Label>
                <Input
                  type="date"
                  value={formDataRef}
                  onChange={(e) => setFormDataRef(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Justificativa / Motivo</Label>
              <Input
                placeholder="Ex: Gozo de folga referente à escala especial"
                value={formDescricao}
                onChange={(e) => setFormDescricao(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createLancamentoMutation.mutate()}
              disabled={createLancamentoMutation.isPending}
            >
              {createLancamentoMutation.isPending ? "Processando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
