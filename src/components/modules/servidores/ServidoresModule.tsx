import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Users, Plus, Search, Filter, Phone, Mail, Calendar, Shield, 
  History, Clock, AlertCircle, FileText, CheckCircle2, ChevronRight, UserCheck
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Servidor, ServidorStatus } from "@/types/app-types";
import { SERVIDOR_STATUS, REGIMES, EQUIPES, TURNOS } from "@/types/app-types";

interface ServidoresModuleProps {
  userRole: "diretor" | "chefia" | "intendencia" | "servidor" | null;
  userId: string;
}

const emptyForm: Partial<Servidor> = {
  nome_completo: "",
  matricula_funcional: "",
  cpf: "",
  cargo_funcao: "Policial Penal",
  lotacao: "UPSTI - Plantão",
  telefone: "",
  email: "",
  regime_escala: "24x72",
  equipe: "Alpha",
  turno_padrao: "Diurno",
  status: "Ativo",
  data_admissao: new Date().toISOString().split("T")[0],
};

export function ServidoresModule({ userRole, userId }: ServidoresModuleProps) {
  const qc = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [equipeFilter, setEquipeFilter] = useState<string>("todos");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingServidor, setEditingServidor] = useState<Servidor | null>(null);
  const [selectedServidor, setSelectedServidor] = useState<Servidor | null>(null);
  const [formData, setFormData] = useState<Partial<Servidor>>(emptyForm);

  const canEdit = userRole === "diretor";
  const isServidor = userRole === "servidor";

  // Buscar servidores
  const { data: servidores = [], isLoading } = useQuery({
    queryKey: ["servidores"],
    queryFn: async () => {
      let query = supabase.from("servidores" as any).select("*").order("nome_completo");
      if (isServidor) {
        query = query.eq("user_id", userId);
      }
      const { data, error } = await query;
      if (error) {
        console.warn("Tabela servidores:", error.message);
        return [];
      }
      return (data || []) as Servidor[];
    },
  });

  // Histórico funcional do servidor selecionado
  const { data: historico = [] } = useQuery({
    queryKey: ["historico-funcional", selectedServidor?.id],
    enabled: !!selectedServidor?.id,
    queryFn: async () => {
      if (!selectedServidor?.id) return [];
      
      const sId = selectedServidor.id;
      const [faltasRes, atestadosRes, feriasRes, permutasRes, missoesRes, folgasRes, plusRes] = await Promise.all([
        supabase.from("faltas" as any).select("*").eq("servidor_id", sId),
        supabase.from("atestados" as any).select("*").eq("servidor_id", sId),
        supabase.from("ferias_licencas" as any).select("*").eq("servidor_id", sId),
        supabase.from("permutas" as any).select("*").or(`solicitante_id.eq.${sId},substituto_id.eq.${sId}`),
        supabase.from("missoes_externas" as any).select("*").or(`servidor_responsavel_id.eq.${sId},equipe_ids.cs.{${sId}}`),
        supabase.from("folgas_ledger" as any).select("*").eq("servidor_id", sId),
        supabase.from("plantao_plus" as any).select("*").eq("servidor_id", sId),
      ]);

      const events: Array<{ id: string; data: string; tipo: string; titulo: string; desc: string; badge?: string }> = [];

      (faltasRes.data || []).forEach((f: any) => {
        events.push({
          id: `falta-${f.id}`,
          data: f.data,
          tipo: "Falta/Atraso",
          titulo: f.minutos_atraso > 0 ? `Atraso registrado: ${f.minutos_atraso} min` : `Falta ${f.tipo}`,
          desc: f.justificativa || "Sem justificativa detalhada",
          badge: f.tipo === "Justificada" ? "Justificada" : "Injustificada",
        });
      });

      (atestadosRes.data || []).forEach((a: any) => {
        events.push({
          id: `atestado-${a.id}`,
          data: a.data_inicio,
          tipo: "Atestado Médico",
          titulo: `Atestado de ${a.dias_afastamento} dia(s)${a.cid ? ` - CID: ${a.cid}` : ""}`,
          desc: a.observacoes || "Afastamento médico regulamentar",
          badge: "Licença",
        });
      });

      (feriasRes.data || []).forEach((fe: any) => {
        events.push({
          id: `ferias-${fe.id}`,
          data: fe.data_inicio,
          tipo: fe.tipo,
          titulo: `${fe.tipo} (${fe.data_inicio} a ${fe.data_fim})`,
          desc: `Período aquisitivo: ${fe.periodo_aquisitivo || "Não especificado"}`,
          badge: fe.status,
        });
      });

      (permutasRes.data || []).forEach((p: any) => {
        const isSolicitante = p.solicitante_id === sId;
        events.push({
          id: `permuta-${p.id}`,
          data: p.data_original,
          tipo: "Permuta",
          titulo: isSolicitante ? "Permuta solicitada" : "Designado como substituto em permuta",
          desc: `Troca: ${p.data_original} (${p.turno_original}) por ${p.data_compensacao} (${p.turno_compensacao})`,
          badge: p.status,
        });
      });

      (missoesRes.data || []).forEach((m: any) => {
        events.push({
          id: `missao-${m.id}`,
          data: m.data_saida ? m.data_saida.split("T")[0] : "",
          tipo: "Missão Externa",
          titulo: `Missão: ${m.destino}`,
          desc: `${m.finalidade} - Total de horas: ${m.horas_trabalhadas || "Em apuração"}h`,
          badge: m.status,
        });
      });

      (folgasRes.data || []).forEach((fl: any) => {
        events.push({
          id: `folga-${fl.id}`,
          data: fl.data_referencia || fl.created_at.split("T")[0],
          tipo: "Banco de Folgas",
          titulo: fl.tipo === "credito" ? `Crédito de +${fl.horas}h` : `Concessão/Gozo de -${fl.horas}h`,
          desc: `${fl.descricao || "Lançamento contábil"} (Origem: ${fl.origem})`,
          badge: fl.status,
        });
      });

      (plusRes.data || []).forEach((pl: any) => {
        events.push({
          id: `plus-${pl.id}`,
          data: pl.data,
          tipo: "Plantão Plus",
          titulo: `Horas Extras / Plus: +${pl.horas_extras}h`,
          desc: pl.motivacao || "Plantão extra de reforço operacional",
          badge: "Presente",
        });
      });

      // Ordenar por data decrescente
      return events.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: Partial<Servidor>) => {
      if (editingServidor) {
        const { error } = await supabase
          .from("servidores" as any)
          .update(payload)
          .eq("id", editingServidor.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("servidores" as any)
          .insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingServidor ? "Servidor atualizado com sucesso!" : "Servidor cadastrado com sucesso!");
      qc.invalidateQueries({ queryKey: ["servidores"] });
      setModalOpen(false);
      setEditingServidor(null);
      setFormData(emptyForm);
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao salvar servidor");
    },
  });

  const filteredServidores = useMemo(() => {
    return servidores.filter((s) => {
      const matchSearch =
        s.nome_completo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.matricula_funcional.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.cargo_funcao && s.cargo_funcao.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchEquipe = equipeFilter === "todos" || s.equipe === equipeFilter;
      const matchStatus = statusFilter === "todos" || s.status === statusFilter;
      return matchSearch && matchEquipe && matchStatus;
    });
  }, [servidores, searchTerm, equipeFilter, statusFilter]);

  const handleOpenEdit = (servidor: Servidor) => {
    setEditingServidor(servidor);
    setFormData(servidor);
    setModalOpen(true);
  };

  const handleOpenNew = () => {
    setEditingServidor(null);
    setFormData(emptyForm);
    setModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Users}
        title="Gestão de Servidores"
        description="Efetivo de policiais e agentes prisionais, regime de escala e histórico funcional unificado."
        actions={
          canEdit && (
            <Button onClick={handleOpenNew} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus className="mr-2 h-4 w-4" /> Novo Servidor
            </Button>
          )
        }
      />

      {/* Filtros e Barra de Busca */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 bg-card p-4 rounded-lg border shadow-xs">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, matrícula ou cargo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div>
          <Select value={equipeFilter} onValueChange={setEquipeFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Equipe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as Equipes</SelectItem>
              <SelectItem value="Alpha">Equipe Alpha</SelectItem>
              <SelectItem value="Beta">Equipe Beta</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Situação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Status</SelectItem>
              {SERVIDOR_STATUS.map((st) => (
                <SelectItem key={st} value={st}>
                  {st}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground px-2">
          <span>Total cadastrado: <b>{servidores.length}</b></span>
          <span>Exibindo: <b>{filteredServidores.length}</b></span>
        </div>
      </div>

      {/* Conteúdo Principal: Tabela e Ficha */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Lista de Servidores */}
        <div className={selectedServidor ? "lg:col-span-7 space-y-4" : "lg:col-span-12 space-y-4"}>
          <div className="rounded-lg border bg-card overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/70 text-xs uppercase font-semibold text-muted-foreground border-b">
                  <tr>
                    <th className="p-3">Servidor</th>
                    <th className="p-3">Matrícula</th>
                    <th className="p-3">Equipe / Regime</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredServidores.map((s) => {
                    const isSelected = selectedServidor?.id === s.id;
                    return (
                      <tr 
                        key={s.id} 
                        onClick={() => setSelectedServidor(s)}
                        className={`cursor-pointer transition-colors hover:bg-muted/50 ${isSelected ? "bg-accent/40 font-medium" : ""}`}
                      >
                        <td className="p-3">
                          <div className="font-medium text-foreground">{s.nome_completo}</div>
                          <div className="text-xs text-muted-foreground">{s.cargo_funcao || "Policial Penal"}</div>
                        </td>
                        <td className="p-3 font-mono text-xs">{s.matricula_funcional}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-xs font-semibold">
                              {s.equipe}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{s.regime_escala}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <StatusBadge status={s.status} size="sm" />
                        </td>
                        <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {canEdit && (
                              <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(s)}>
                                Editar
                              </Button>
                            )}
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => setSelectedServidor(isSelected ? null : s)}
                            >
                              {isSelected ? "Fechar Ficha" : "Ver Ficha"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredServidores.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">
                        {isLoading ? "Carregando servidores..." : "Nenhum servidor encontrado com os filtros aplicados."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Ficha Funcional e Timeline */}
        {selectedServidor && (
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-lg border bg-card p-5 shadow-sm space-y-5 sticky top-20">
              <div className="flex items-start justify-between border-b pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-foreground">{selectedServidor.nome_completo}</h2>
                    <StatusBadge status={selectedServidor.status} size="sm" />
                  </div>
                  <p className="text-xs font-mono text-muted-foreground mt-0.5">
                    Matrícula: {selectedServidor.matricula_funcional} {selectedServidor.cpf ? `• CPF: ${selectedServidor.cpf}` : ""}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedServidor(null)}>
                  ✕
                </Button>
              </div>

              {/* Detalhes Rápidos */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-muted/40 p-2.5 rounded-md">
                  <span className="text-muted-foreground block">Cargo / Lotação:</span>
                  <span className="font-semibold text-foreground">{selectedServidor.cargo_funcao || "—"} ({selectedServidor.lotacao || "UPSTI"})</span>
                </div>
                <div className="bg-muted/40 p-2.5 rounded-md">
                  <span className="text-muted-foreground block">Escala Operacional:</span>
                  <span className="font-semibold text-foreground">Equipe {selectedServidor.equipe} • {selectedServidor.regime_escala}</span>
                </div>
                <div className="bg-muted/40 p-2.5 rounded-md">
                  <span className="text-muted-foreground block">Turno Padrão:</span>
                  <span className="font-semibold text-foreground">{selectedServidor.turno_padrao}</span>
                </div>
                <div className="bg-muted/40 p-2.5 rounded-md">
                  <span className="text-muted-foreground block">Admissão:</span>
                  <span className="font-semibold text-foreground">
                    {selectedServidor.data_admissao ? new Date(selectedServidor.data_admissao + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                  </span>
                </div>
              </div>

              {/* Contatos */}
              <div className="space-y-1.5 text-xs border-t pt-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  <span>{selectedServidor.telefone || "Telefone não informado"}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  <span>{selectedServidor.email || "E-mail não informado"}</span>
                </div>
              </div>

              {/* Histórico Funcional Consolidado */}
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <History className="h-4 w-4 text-primary" /> Histórico Funcional Unificado
                  </h3>
                  <span className="text-xs text-muted-foreground">{historico.length} evento(s)</span>
                </div>

                <div className="max-h-96 overflow-y-auto pr-1 space-y-2.5 text-xs">
                  {historico.map((evt) => (
                    <div key={evt.id} className="p-2.5 rounded-md border bg-muted/20 hover:bg-muted/40 transition-colors space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground">{evt.tipo}</span>
                        <div className="flex items-center gap-1.5">
                          {evt.badge && <StatusBadge status={evt.badge} size="sm" />}
                          <span className="font-mono text-[10px] text-muted-foreground">{evt.data}</span>
                        </div>
                      </div>
                      <div className="font-medium text-foreground/90">{evt.titulo}</div>
                      <div className="text-muted-foreground text-[11px]">{evt.desc}</div>
                    </div>
                  ))}
                  {historico.length === 0 && (
                    <p className="text-muted-foreground text-center py-6 text-xs">
                      Nenhum registro operacional associado a este servidor até o momento.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Cadastro / Edição */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingServidor ? "Editar Servidor" : "Cadastrar Novo Servidor"}</DialogTitle>
            <DialogDescription>
              Preencha os dados cadastrais e funcionais para vincular o servidor à escala da UPSTI.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate(formData);
            }}
            className="space-y-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="nome">Nome Completo *</Label>
                <Input
                  id="nome"
                  required
                  value={formData.nome_completo || ""}
                  onChange={(e) => setFormData({ ...formData, nome_completo: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="mat">Matrícula Funcional *</Label>
                <Input
                  id="mat"
                  required
                  value={formData.matricula_funcional || ""}
                  onChange={(e) => setFormData({ ...formData, matricula_funcional: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="cpf">CPF</Label>
                <Input
                  id="cpf"
                  value={formData.cpf || ""}
                  onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                  placeholder="000.000.000-00"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="cargo">Cargo / Função</Label>
                <Input
                  id="cargo"
                  value={formData.cargo_funcao || ""}
                  onChange={(e) => setFormData({ ...formData, cargo_funcao: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="lotacao">Lotação</Label>
                <Input
                  id="lotacao"
                  value={formData.lotacao || ""}
                  onChange={(e) => setFormData({ ...formData, lotacao: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="tel">Telefone / WhatsApp</Label>
                <Input
                  id="tel"
                  value={formData.telefone || ""}
                  onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                  placeholder="(98) 90000-0000"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="email">E-mail Institucional</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email || ""}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <Label>Regime de Escala *</Label>
                <Select
                  value={formData.regime_escala || "24x72"}
                  onValueChange={(val: any) => setFormData({ ...formData, regime_escala: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIMES.map((r) => (
                      <SelectItem key={r} value={r}>
                        Escala {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Equipe Operacional *</Label>
                <Select
                  value={formData.equipe || "Alpha"}
                  onValueChange={(val: any) => setFormData({ ...formData, equipe: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EQUIPES.map((eq) => (
                      <SelectItem key={eq} value={eq}>
                        Equipe {eq}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Turno Padrão</Label>
                <Select
                  value={formData.turno_padrao || "Diurno"}
                  onValueChange={(val: any) => setFormData({ ...formData, turno_padrao: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TURNOS.map((t) => (
                      <SelectItem key={t} value={t}>
                        Turno {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Status Funcional</Label>
                <Select
                  value={formData.status || "Ativo"}
                  onValueChange={(val: any) => setFormData({ ...formData, status: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVIDOR_STATUS.map((st) => (
                      <SelectItem key={st} value={st}>
                        {st}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="adm">Data de Admissão / Início na Unidade</Label>
                <Input
                  id="adm"
                  type="date"
                  value={formData.data_admissao || ""}
                  onChange={(e) => setFormData({ ...formData, data_admissao: e.target.value })}
                />
              </div>
            </div>

            <DialogFooter className="pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Gravando..." : "Salvar Registro"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
