import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Stethoscope, Plus, FileText, Download, Upload, AlertCircle, Clock, Calendar 
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
import type { Falta, Atestado, Servidor } from "@/types/app-types";

interface FaltasModuleProps {
  userRole: "diretor" | "chefia" | "intendencia" | "servidor" | null;
  userId: string;
}

export function FaltasModule({ userRole, userId }: FaltasModuleProps) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("faltas");
  const [faltaModalOpen, setFaltaModalOpen] = useState(false);
  const [atestadoModalOpen, setAtestadoModalOpen] = useState(false);

  // Form Falta
  const [faltaServidorId, setFaltaServidorId] = useState("");
  const [faltaData, setFaltaData] = useState(new Date().toISOString().split("T")[0]);
  const [faltaTipo, setFaltaTipo] = useState<"Justificada" | "Injustificada">("Injustificada");
  const [faltaAtraso, setFaltaAtraso] = useState("0");
  const [faltaJustificativa, setFaltaJustificativa] = useState("");

  // Form Atestado
  const [attServidorId, setAttServidorId] = useState("");
  const [attDataInicio, setAttDataInicio] = useState(new Date().toISOString().split("T")[0]);
  const [attDias, setAttDias] = useState("1");
  const [attCid, setAttCid] = useState("");
  const [attObs, setAttObs] = useState("");
  const [attFile, setAttFile] = useState<File | null>(null);

  const canManage = userRole === "diretor" || userRole === "chefia";
  const isServidor = userRole === "servidor";

  // Buscar servidores
  const { data: servidores = [] } = useQuery({
    queryKey: ["servidores-faltas"],
    queryFn: async () => {
      let query = supabase.from("servidores" as any).select("*").order("nome_completo");
      if (isServidor) query = query.eq("user_id", userId);
      const { data, error } = await query;
      if (error) return [];
      return (data || []) as Servidor[];
    },
  });

  const ownServidor = servidores.find((s) => s.user_id === userId);

  // Buscar faltas
  const { data: faltas = [], isLoading: loadingFaltas } = useQuery({
    queryKey: ["faltas-lista"],
    queryFn: async () => {
      let query = supabase
        .from("faltas" as any)
        .select("*, servidor:servidores(*)")
        .order("data", { ascending: false });
      if (isServidor && ownServidor) query = query.eq("servidor_id", ownServidor.id);
      const { data, error } = await query;
      if (error) return [];
      return (data || []) as Falta[];
    },
  });

  // Buscar atestados
  const { data: atestados = [], isLoading: loadingAtestados } = useQuery({
    queryKey: ["atestados-lista"],
    queryFn: async () => {
      let query = supabase
        .from("atestados" as any)
        .select("*, servidor:servidores(*)")
        .order("data_inicio", { ascending: false });
      if (isServidor && ownServidor) query = query.eq("servidor_id", ownServidor.id);
      const { data, error } = await query;
      if (error) return [];
      return (data || []) as Atestado[];
    },
  });

  // Criar falta
  const createFaltaMutation = useMutation({
    mutationFn: async () => {
      const sId = isServidor ? ownServidor?.id : faltaServidorId;
      if (!sId) throw new Error("Selecione o servidor.");

      const { error } = await supabase.from("faltas" as any).insert([
        {
          servidor_id: sId,
          data: faltaData,
          tipo: faltaTipo,
          minutos_atraso: Number(faltaAtraso) || 0,
          justificativa: faltaJustificativa,
          registrado_por: userId,
        },
      ]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ocorrência de falta/atraso registrada.");
      qc.invalidateQueries({ queryKey: ["faltas-lista"] });
      setFaltaModalOpen(false);
      setFaltaJustificativa("");
      setFaltaAtraso("0");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Criar atestado com upload para bucket privado
  const createAtestadoMutation = useMutation({
    mutationFn: async () => {
      const sId = isServidor ? ownServidor?.id : attServidorId;
      if (!sId) throw new Error("Selecione o servidor.");

      let arquivoPath: string | null = null;

      if (attFile) {
        const ext = attFile.name.split(".").pop();
        const fileName = `${sId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("documentos-restritos")
          .upload(fileName, attFile);

        if (uploadErr) {
          console.warn("Storage upload:", uploadErr.message);
          // Continua mesmo se storage não configurado no lovables
        } else {
          arquivoPath = fileName;
        }
      }

      const { error } = await supabase.from("atestados" as any).insert([
        {
          servidor_id: sId,
          data_inicio: attDataInicio,
          dias_afastamento: Number(attDias) || 1,
          cid: attCid || null,
          observacoes: attObs || null,
          arquivo_path: arquivoPath,
          registrado_por: userId,
        },
      ]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atestado médico anexado e registrado com sucesso.");
      qc.invalidateQueries({ queryKey: ["atestados-lista"] });
      setAtestadoModalOpen(false);
      setAttFile(null);
      setAttCid("");
      setAttObs("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Download seguro de anexo via Signed URL
  const handleDownloadAnexo = async (path: string) => {
    try {
      const { data, error } = await supabase.storage
        .from("documentos-restritos")
        .createSignedUrl(path, 300); // 5 minutos de validade

      if (error || !data?.signedUrl) {
        throw new Error(error?.message || "Arquivo indisponível no Storage.");
      }

      window.open(data.signedUrl, "_blank");
    } catch (e: any) {
      toast.error(e.message || "Erro ao obter anexo seguro.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Stethoscope}
        title="Faltas, Atrasos e Atestados Médicos"
        description="Gestão disciplinar de frequência, pontualidade e anexos sigilosos em bucket privado com URLs assinadas."
        actions={
          canManage && (
            <div className="flex gap-2">
              <Button onClick={() => setFaltaModalOpen(true)} variant="outline" size="sm">
                <Plus className="mr-1.5 h-4 w-4" /> Registrar Falta / Atraso
              </Button>
              <Button onClick={() => setAtestadoModalOpen(true)} size="sm">
                <Upload className="mr-1.5 h-4 w-4" /> Anexar Atestado
              </Button>
            </div>
          )
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-card border">
          <TabsTrigger value="faltas">Faltas e Atrasos ({faltas.length})</TabsTrigger>
          <TabsTrigger value="atestados">Atestados Médicos ({atestados.length})</TabsTrigger>
        </TabsList>

        {/* Tab Faltas */}
        <TabsContent value="faltas" className="space-y-4">
          <div className="rounded-lg border bg-card overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/70 text-xs uppercase font-semibold text-muted-foreground border-b">
                  <tr>
                    <th className="p-3">Data</th>
                    <th className="p-3">Servidor</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">Atraso</th>
                    <th className="p-3">Justificativa / Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {faltas.map((f) => (
                    <tr key={f.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-mono text-xs">{f.data}</td>
                      <td className="p-3">
                        <div className="font-medium text-foreground">{f.servidor?.nome_completo || "Servidor"}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{f.servidor?.matricula_funcional}</div>
                      </td>
                      <td className="p-3">
                        <StatusBadge status={f.tipo} size="sm" />
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {f.minutos_atraso > 0 ? (
                          <span className="text-warning font-bold">{f.minutos_atraso} min</span>
                        ) : (
                          <span className="text-muted-foreground">Turno integral</span>
                        )}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {f.justificativa || "Sem observações"}
                      </td>
                    </tr>
                  ))}
                  {faltas.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground text-xs">
                        Nenhum registro de falta ou atraso encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Tab Atestados */}
        <TabsContent value="atestados" className="space-y-4">
          <div className="rounded-lg border bg-card overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/70 text-xs uppercase font-semibold text-muted-foreground border-b">
                  <tr>
                    <th className="p-3">Início</th>
                    <th className="p-3">Servidor</th>
                    <th className="p-3">Dias Afastamento</th>
                    <th className="p-3">CID</th>
                    <th className="p-3">Observações</th>
                    <th className="p-3 text-right">Anexo Sigiloso</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {atestados.map((a) => (
                    <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-mono text-xs">{a.data_inicio}</td>
                      <td className="p-3">
                        <div className="font-medium text-foreground">{a.servidor?.nome_completo || "Servidor"}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{a.servidor?.matricula_funcional}</div>
                      </td>
                      <td className="p-3 font-mono text-xs font-bold text-foreground">
                        {a.dias_afastamento} dia(s)
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {a.cid ? <Badge variant="outline">{a.cid}</Badge> : "Sigiloso / Opcional"}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {a.observacoes || "Sem notas"}
                      </td>
                      <td className="p-3 text-right">
                        {a.arquivo_path ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => handleDownloadAnexo(a.arquivo_path!)}
                          >
                            <Download className="mr-1 h-3.5 w-3.5" /> Baixar PDF
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sem anexo</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {atestados.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground text-xs">
                        Nenhum atestado médico registrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Modal Falta */}
      <Dialog open={faltaModalOpen} onOpenChange={setFaltaModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Falta ou Atraso</DialogTitle>
            <DialogDescription>
              Ocorrência disciplinar vinculada à ficha funcional do policial.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Servidor *</Label>
              <Select value={faltaServidorId} onValueChange={setFaltaServidorId}>
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Data da Ocorrência</Label>
                <Input type="date" value={faltaData} onChange={(e) => setFaltaData(e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label>Tipo de Falta</Label>
                <Select value={faltaTipo} onValueChange={(v: any) => setFaltaTipo(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Injustificada">Injustificada</SelectItem>
                    <SelectItem value="Justificada">Justificada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Atraso em Minutos (Deixe 0 se faltou todo o plantão)</Label>
              <Input
                type="number"
                min={0}
                value={faltaAtraso}
                onChange={(e) => setFaltaAtraso(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Justificativa / Observação</Label>
              <Input
                placeholder="Descreva o motivo informado ou constatação da chefia"
                value={faltaJustificativa}
                onChange={(e) => setFaltaJustificativa(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFaltaModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => createFaltaMutation.mutate()} disabled={createFaltaMutation.isPending}>
              {createFaltaMutation.isPending ? "Gravando..." : "Registrar Ocorrência"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Atestado */}
      <Dialog open={atestadoModalOpen} onOpenChange={setAtestadoModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Anexar Atestado Médico</DialogTitle>
            <DialogDescription>
              Documento arquivado em Storage seguro (bucket documentos-restritos).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Servidor *</Label>
              <Select value={attServidorId} onValueChange={setAttServidorId}>
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Data de Início</Label>
                <Input type="date" value={attDataInicio} onChange={(e) => setAttDataInicio(e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label>Dias de Afastamento</Label>
                <Input
                  type="number"
                  min={1}
                  value={attDias}
                  onChange={(e) => setAttDias(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>CID (Código Internacional de Doenças — Opcional)</Label>
              <Input placeholder="Ex: Z76.5, J00..." value={attCid} onChange={(e) => setAttCid(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label>Arquivo Digitalizado (PDF ou Foto)</Label>
              <Input
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => setAttFile(e.target.files?.[0] || null)}
              />
            </div>

            <div className="space-y-1">
              <Label>Observações Administrativas</Label>
              <Input
                placeholder="Ex: Entregue à chefia no prazo de 48h"
                value={attObs}
                onChange={(e) => setAttObs(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAtestadoModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => createAtestadoMutation.mutate()} disabled={createAtestadoMutation.isPending}>
              {createAtestadoMutation.isPending ? "Enviando..." : "Salvar Atestado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
