import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Repeat, Plus, CheckCircle2, XCircle, Clock, Calendar, Users, FileSpreadsheet, ArrowRightLeft 
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
import type { Permuta, PlantaoPlus, Servidor } from "@/types/app-types";

interface PermutasModuleProps {
  userRole: "diretor" | "chefia" | "intendencia" | "servidor" | null;
  userId: string;
}

export function PermutasModule({ userRole, userId }: PermutasModuleProps) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("permutas");
  const [permutaModalOpen, setPermutaModalOpen] = useState(false);
  const [plusModalOpen, setPlusModalOpen] = useState(false);

  // Form Permuta
  const [solicitanteId, setSolicitanteId] = useState("");
  const [substitutoId, setSubstitutoId] = useState("");
  const [dataOriginal, setDataOriginal] = useState(new Date().toISOString().split("T")[0]);
  const [turnoOriginal, setTurnoOriginal] = useState<"Diurno" | "Noturno">("Diurno");
  const [dataCompensacao, setDataCompensacao] = useState(new Date().toISOString().split("T")[0]);
  const [turnoCompensacao, setTurnoCompensacao] = useState<"Diurno" | "Noturno">("Diurno");
  const [justificativaPermuta, setJustificativaPermuta] = useState("");

  // Form Plantao Plus
  const [plusServidorId, setPlusServidorId] = useState("");
  const [plusData, setPlusData] = useState(new Date().toISOString().split("T")[0]);
  const [plusTurno, setPlusTurno] = useState<"Diurno" | "Noturno">("Diurno");
  const [plusHoras, setPlusHoras] = useState("12");
  const [plusMotivacao, setPlusMotivacao] = useState("");

  const isDiretor = userRole === "diretor";
  const canManage = userRole === "diretor" || userRole === "chefia";
  const isServidor = userRole === "servidor";

  // Buscar servidores
  const { data: servidores = [] } = useQuery({
    queryKey: ["servidores-permutas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("servidores" as any).select("*").order("nome_completo");
      if (error) return [];
      return (data || []) as Servidor[];
    },
  });

  const ownServidor = servidores.find((s) => s.user_id === userId);

  // Buscar Permutas
  const { data: permutas = [], isLoading: loadingPermutas } = useQuery({
    queryKey: ["permutas-lista"],
    queryFn: async () => {
      let query = supabase
        .from("permutas" as any)
        .select("*, solicitante:servidores!solicitante_id(*), substituto:servidores!substituto_id(*)")
        .order("created_at", { ascending: false });

      if (isServidor && ownServidor) {
        query = query.or(`solicitante_id.eq.${ownServidor.id},substituto_id.eq.${ownServidor.id}`);
      }
      const { data, error } = await query;
      if (error) return [];
      return (data || []) as Permuta[];
    },
  });

  // Buscar Plantão Plus
  const { data: plantoesPlus = [], isLoading: loadingPlus } = useQuery({
    queryKey: ["plantao-plus-lista"],
    queryFn: async () => {
      let query = supabase
        .from("plantao_plus" as any)
        .select("*, servidor:servidores(*)")
        .order("data", { ascending: false });

      if (isServidor && ownServidor) {
        query = query.eq("servidor_id", ownServidor.id);
      }
      const { data, error } = await query;
      if (error) return [];
      return (data || []) as PlantaoPlus[];
    },
  });

  // Criar Permuta
  const createPermutaMutation = useMutation({
    mutationFn: async () => {
      const sId = isServidor ? ownServidor?.id : solicitanteId;
      if (!sId || !substitutoId) throw new Error("Selecione o servidor solicitante e o substituto.");
      if (sId === substitutoId) throw new Error("O servidor substituto não pode ser o mesmo solicitante.");

      const { error } = await supabase.from("permutas" as any).insert([
        {
          solicitante_id: sId,
          substituto_id: substitutoId,
          data_original: dataOriginal,
          turno_original: turnoOriginal,
          data_compensacao: dataCompensacao,
          turno_compensacao: turnoCompensacao,
          justificativa: justificativaPermuta || null,
          status: "Solicitada",
        },
      ]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Permuta solicitada com sucesso. Aguardando aceite do substituto.");
      qc.invalidateQueries({ queryKey: ["permutas-lista"] });
      setPermutaModalOpen(false);
      setJustificativaPermuta("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Aceitar Permuta (pelo Substituto)
  const aceitarPermutaMutation = useMutation({
    mutationFn: async (permutaId: string) => {
      const { error } = await supabase
        .from("permutas" as any)
        .update({
          status: "Aceita",
          aceito_em: new Date().toISOString(),
        })
        .eq("id", permutaId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Permuta aceita! Enviada para autorização da Direção.");
      qc.invalidateQueries({ queryKey: ["permutas-lista"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Decisão da Direção (Autorizar / Recusar)
  const decisaoPermutaMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "Autorizada" | "Recusada" }) => {
      const { error } = await supabase
        .from("permutas" as any)
        .update({
          status,
          autorizado_por: userId,
          autorizado_em: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast.success(`Permuta ${vars.status.toLowerCase()} pela Direção.`);
      qc.invalidateQueries({ queryKey: ["permutas-lista"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Registrar Plantão Plus
  const createPlusMutation = useMutation({
    mutationFn: async () => {
      const sId = isServidor ? ownServidor?.id : plusServidorId;
      if (!sId) throw new Error("Selecione o servidor.");

      const { error } = await supabase.from("plantao_plus" as any).insert([
        {
          servidor_id: sId,
          data: plusData,
          turno: plusTurno,
          horas_extras: Number(plusHoras) || 12,
          motivacao: plusMotivacao || null,
        },
      ]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plantão Plus / Horas Extras registradas.");
      qc.invalidateQueries({ queryKey: ["plantao-plus-lista"] });
      setPlusModalOpen(false);
      setPlusMotivacao("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Totalizadores de Horas Extras por servidor (Fechamento Administrativo)
  const consolidacaoPlus = useMemo(() => {
    const map: Record<string, { nome: string; matricula: string; totalHoras: number; plantoes: number }> = {};
    plantoesPlus.forEach((pl) => {
      const sId = pl.servidor_id;
      if (!map[sId]) {
        map[sId] = {
          nome: pl.servidor?.nome_completo || "Servidor",
          matricula: pl.servidor?.matricula_funcional || "—",
          totalHoras: 0,
          plantoes: 0,
        };
      }
      map[sId].totalHoras += Number(pl.horas_extras);
      map[sId].plantoes += 1;
    });
    return Object.values(map);
  }, [plantoesPlus]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Repeat}
        title="Permutas de Plantão e Plantão Plus"
        description="Workflow de troca voluntária com anuência recíproca e controle de horas extras operacionais."
        actions={
          <div className="flex gap-2">
            <Button onClick={() => setPermutaModalOpen(true)} className="bg-primary text-primary-foreground">
              <ArrowRightLeft className="mr-1.5 h-4 w-4" /> Solicitar Permuta
            </Button>
            {canManage && (
              <Button onClick={() => setPlusModalOpen(true)} variant="outline">
                <Plus className="mr-1.5 h-4 w-4" /> Lançar Plantão Plus
              </Button>
            )}
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-card border">
          <TabsTrigger value="permutas">Permutas de Plantão ({permutas.length})</TabsTrigger>
          <TabsTrigger value="plus">Plantão Plus & Horas Extras ({plantoesPlus.length})</TabsTrigger>
        </TabsList>

        {/* Tab Permutas */}
        <TabsContent value="permutas" className="space-y-4">
          <div className="rounded-lg border bg-card overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/70 text-xs uppercase font-semibold text-muted-foreground border-b">
                  <tr>
                    <th className="p-3">Solicitante</th>
                    <th className="p-3">Substituto Designado</th>
                    <th className="p-3">Plantão Original</th>
                    <th className="p-3">Data Compensação</th>
                    <th className="p-3">Workflow / Situação</th>
                    <th className="p-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {permutas.map((p) => {
                    const isSubstituto = ownServidor && p.substituto_id === ownServidor.id;
                    return (
                      <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-medium text-foreground">
                          {p.solicitante?.nome_completo || "Solicitante"}
                          <div className="text-[11px] text-muted-foreground font-mono">
                            {p.solicitante?.matricula_funcional}
                          </div>
                        </td>
                        <td className="p-3 font-medium text-foreground">
                          {p.substituto?.nome_completo || "Substituto"}
                          <div className="text-[11px] text-muted-foreground font-mono">
                            {p.substituto?.matricula_funcional}
                          </div>
                        </td>
                        <td className="p-3 font-mono text-xs">
                          <div>{p.data_original}</div>
                          <Badge variant="outline" className="text-[10px] mt-0.5">{p.turno_original}</Badge>
                        </td>
                        <td className="p-3 font-mono text-xs">
                          <div>{p.data_compensacao}</div>
                          <Badge variant="outline" className="text-[10px] mt-0.5">{p.turno_compensacao}</Badge>
                        </td>
                        <td className="p-3">
                          <StatusBadge status={p.status} size="sm" />
                          {p.status === "Solicitada" && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">Aguardando substituto</div>
                          )}
                          {p.status === "Aceita" && (
                            <div className="text-[10px] text-warning mt-0.5">Aguardando Diretor</div>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Substituto aceita */}
                            {p.status === "Solicitada" && isSubstituto && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-success text-success hover:bg-success/10"
                                onClick={() => aceitarPermutaMutation.mutate(p.id)}
                              >
                                Aceitar Substituição
                              </Button>
                            )}

                            {/* Diretor autoriza */}
                            {isDiretor && p.status === "Aceita" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs border-success text-success hover:bg-success/10"
                                  onClick={() => decisaoPermutaMutation.mutate({ id: p.id, status: "Autorizada" })}
                                >
                                  Autorizar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs border-destructive text-destructive hover:bg-destructive/10"
                                  onClick={() => decisaoPermutaMutation.mutate({ id: p.id, status: "Recusada" })}
                                >
                                  Recusar
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {permutas.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground text-xs">
                        Nenhuma permuta registrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Tab Plantão Plus */}
        <TabsContent value="plus" className="space-y-6">
          {/* Consolidação Mensal */}
          <div className="rounded-lg border bg-card p-4 shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <FileSpreadsheet className="h-4 w-4" /> Consolidação Mensal de Horas Extras / Plus
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {consolidacaoPlus.map((c) => (
                <div key={c.matricula} className="p-3 rounded-md border bg-muted/30 text-xs">
                  <div className="font-semibold text-foreground truncate">{c.nome}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{c.matricula}</div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-primary font-bold text-lg font-mono">+{c.totalHoras}h</span>
                    <span className="text-muted-foreground text-[10px]">{c.plantoes} plantão(ões)</span>
                  </div>
                </div>
              ))}
              {consolidacaoPlus.length === 0 && (
                <p className="text-muted-foreground text-xs col-span-4 py-2">
                  Nenhuma hora extra registrada no fechamento do período.
                </p>
              )}
            </div>
          </div>

          {/* Histórico Individual */}
          <div className="rounded-lg border bg-card overflow-hidden shadow-xs">
            <div className="p-3 bg-muted/40 border-b">
              <h3 className="font-semibold text-sm">Registros Individuais de Plantão Plus</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/70 text-xs uppercase font-semibold text-muted-foreground border-b">
                  <tr>
                    <th className="p-3">Data</th>
                    <th className="p-3">Servidor</th>
                    <th className="p-3">Turno</th>
                    <th className="p-3">Horas Extras</th>
                    <th className="p-3">Motivação Operacional</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {plantoesPlus.map((pl) => (
                    <tr key={pl.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-mono text-xs">{pl.data}</td>
                      <td className="p-3 font-medium text-foreground">
                        {pl.servidor?.nome_completo || "Servidor"}
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {pl.servidor?.matricula_funcional}
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-xs">
                          {pl.turno}
                        </Badge>
                      </td>
                      <td className="p-3 font-mono text-xs font-bold text-success">
                        +{pl.horas_extras}h
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {pl.motivacao || "Reforço operacional da unidade"}
                      </td>
                    </tr>
                  ))}
                  {plantoesPlus.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground text-xs">
                        Nenhum registro de plantão plus encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Modal Solicitar Permuta */}
      <Dialog open={permutaModalOpen} onOpenChange={setPermutaModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Solicitar Permuta de Plantão</DialogTitle>
            <DialogDescription>
              O substituto indicado deverá aceitar antes do envio para autorização da Direção.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {!isServidor && (
              <div className="space-y-1">
                <Label>Servidor Solicitante *</Label>
                <Select value={solicitanteId} onValueChange={setSolicitanteId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o solicitante" />
                  </SelectTrigger>
                  <SelectContent>
                    {servidores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nome_completo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label>Servidor Substituto (Quem cobrirá seu plantão) *</Label>
              <Select value={substitutoId} onValueChange={setSubstitutoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o colega que assumirá" />
                </SelectTrigger>
                <SelectContent>
                  {servidores
                    .filter((s) => !ownServidor || s.id !== ownServidor.id)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nome_completo} ({s.equipe})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Data do Plantão Original</Label>
                <Input type="date" value={dataOriginal} onChange={(e) => setDataOriginal(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Turno Original</Label>
                <Select value={turnoOriginal} onValueChange={(v: any) => setTurnoOriginal(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Diurno">Diurno</SelectItem>
                    <SelectItem value="Noturno">Noturno</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Data de Compensação (Sua volta)</Label>
                <Input type="date" value={dataCompensacao} onChange={(e) => setDataCompensacao(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Turno de Compensação</Label>
                <Select value={turnoCompensacao} onValueChange={(v: any) => setTurnoCompensacao(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Diurno">Diurno</SelectItem>
                    <SelectItem value="Noturno">Noturno</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Justificativa da Permuta</Label>
              <Input
                placeholder="Ex: Compromisso particular inadiável"
                value={justificativaPermuta}
                onChange={(e) => setJustificativaPermuta(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPermutaModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => createPermutaMutation.mutate()} disabled={createPermutaMutation.isPending}>
              {createPermutaMutation.isPending ? "Enviando..." : "Solicitar Permuta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Lançar Plantão Plus */}
      <Dialog open={plusModalOpen} onOpenChange={setPlusModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Lançamento de Plantão Plus (Horas Extras)</DialogTitle>
            <DialogDescription>
              Registro para prestação de contas e fechamento administrativo da folha.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Servidor *</Label>
              <Select value={plusServidorId} onValueChange={setPlusServidorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o servidor beneficiário" />
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Data do Plantão</Label>
                <Input type="date" value={plusData} onChange={(e) => setPlusData(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Turno</Label>
                <Select value={plusTurno} onValueChange={(v: any) => setPlusTurno(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Diurno">Diurno</SelectItem>
                    <SelectItem value="Noturno">Noturno</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Carga Horária Extra (Horas)</Label>
              <Input
                type="number"
                min={1}
                max={24}
                value={plusHoras}
                onChange={(e) => setPlusHoras(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Motivação Operacional</Label>
              <Input
                placeholder="Ex: Cobertura de escolta judicial / reforço de muralha"
                value={plusMotivacao}
                onChange={(e) => setPlusMotivacao(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPlusModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => createPlusMutation.mutate()} disabled={createPlusMutation.isPending}>
              {createPlusMutation.isPending ? "Gravando..." : "Salvar Horas Extras"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
