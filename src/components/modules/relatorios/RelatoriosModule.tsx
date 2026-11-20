import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  FileBarChart, Download, FileSpreadsheet, Printer, Shield, 
  Database, Users, Building2, Truck, Calendar, Clock, Lock 
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RelatoriosModuleProps {
  userRole: "diretor" | "chefia" | "intendencia" | "servidor" | null;
  userId: string;
}

export function RelatoriosModule({ userRole, userId }: RelatoriosModuleProps) {
  const [activeTab, setActiveTab] = useState("gerenciais");
  const [backupLoading, setBackupLoading] = useState(false);
  const [periodoFiltro, setPeriodoFiltro] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM

  const isDiretor = userRole === "diretor";
  const isChefia = userRole === "chefia";
  const isIntendencia = userRole === "intendencia";
  const isServidor = userRole === "servidor";

  // Buscar dados do usuário logado para o cabeçalho oficial
  const { data: emissorProfile } = useQuery({
    queryKey: ["perfil-emissor", userId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      return data;
    },
  });

  // Utilitário de Geração de Impressão / PDF Oficial UPSTI
  const imprimirRelatorioOficial = (titulo: string, subtitulo: string, headers: string[], rows: (string | number)[][]) => {
    const dataEmissao = new Date().toLocaleString("pt-BR");
    const emissorNome = emissorProfile?.nome_completo || "Diretoria UPSTI";
    const emissorMatricula = emissorProfile?.matricula || "—";

    const tableHeadersHtml = headers.map((h) => `<th style="border: 1px solid #334155; padding: 8px; background-color: #0F172A; color: #FFFFFF; font-size: 11px; text-transform: uppercase;">${h}</th>`).join("");
    const tableRowsHtml = rows
      .map(
        (row, idx) =>
          `<tr style="background-color: ${idx % 2 === 0 ? "#F8FAFC" : "#FFFFFF"};">
            ${row.map((cell) => `<td style="border: 1px solid #CBD5E1; padding: 6px 8px; font-size: 11px;">${cell ?? "—"}</td>`).join("")}
          </tr>`
      )
      .join("");

    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${titulo} — UPSTI</title>
        <meta charset="utf-8" />
        <style>
          @media print {
            body { margin: 0; padding: 15mm; font-family: 'Helvetica Neue', Arial, sans-serif; color: #0F172A; }
            .no-print { display: none; }
          }
          body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #0F172A; margin: 20px; }
          .header-box { border-bottom: 2px solid #0F172A; padding-bottom: 12px; margin-bottom: 15px; }
          .inst-title { font-size: 16px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; }
          .inst-sub { font-size: 12px; color: #475569; }
          .rep-title { font-size: 18px; font-weight: bold; margin-top: 10px; color: #0F172A; }
          .rep-sub { font-size: 12px; color: #64748B; margin-top: 2px; }
          .meta-box { margin-top: 8px; font-size: 10px; color: #475569; display: flex; justify-content: space-between; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          .footer-box { margin-top: 30px; font-size: 9px; color: #94A3B8; text-align: center; border-top: 1px dashed #CBD5E1; padding-top: 8px; }
        </style>
      </head>
      <body>
        <div class="header-box">
          <div class="inst-title">ESTADO DO MARANHÃO • SECRETARIA DE ADMINISTRAÇÃO PENITENCIÁRIA</div>
          <div class="inst-sub">UNIDADE PRISIONAL DE SANTA INÊS — UPSTI</div>
          <div class="rep-title">${titulo}</div>
          <div class="rep-sub">${subtitulo}</div>
          <div class="meta-box">
            <span><b>Emissão:</b> ${dataEmissao}</span>
            <span><b>Emissor:</b> ${emissorNome} (Mat. ${emissorMatricula})</span>
            <span><b>Autenticação:</b> UPSTI-REL-${Date.now().toString(36).toUpperCase()}</span>
          </div>
        </div>
        <table>
          <thead><tr>${tableHeadersHtml}</tr></thead>
          <tbody>${tableRowsHtml}</tbody>
        </table>
        <div class="footer-box">
          Documento oficial gerado eletronicamente pelo Sistema Integrado GESTÃO UPSTI. Reprodução restrita à finalidade institucional.
        </div>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(printHtml);
      printWindow.document.close();
    } else {
      toast.error("Permita pop-ups no navegador para emitir o relatório.");
    }
  };

  // Utilitário de Exportação CSV / Excel
  const exportarCsv = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const escapeCsv = (val: string | number) => {
      const s = String(val ?? "").replace(/"/g, '""');
      return `"${s}"`;
    };

    const headerLine = headers.map(escapeCsv).join(";");
    const lines = rows.map((r) => r.map(escapeCsv).join(";"));
    const content = "\uFEFF" + [headerLine, ...lines].join("\r\n");

    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Planilha CSV (compatível com Excel) baixada.");
  };

  // Relatório 1: Efetivo e Escalas
  const gerarRelatorioEfetivo = async (tipoExport: "pdf" | "csv") => {
    const { data: srvs } = await supabase.from("servidores" as any).select("*").order("nome_completo");
    const headers = ["Nome Completo", "Matrícula", "Cargo", "Equipe", "Regime", "Turno", "Situação"];
    const rows = (srvs || []).map((s: any) => [
      s.nome_completo,
      s.matricula_funcional,
      s.cargo_funcao || "Policial Penal",
      s.equipe,
      s.regime_escala,
      s.turno_padrao,
      s.status,
    ]);

    if (tipoExport === "pdf") {
      imprimirRelatorioOficial("Relatório de Efetivo e Escalas Operacionais", "Distribuição das equipes Alpha/Beta e regimes 24x72 / 12x36", headers, rows);
    } else {
      exportarCsv("relatorio_efetivo_upsti", headers, rows);
    }
  };

  // Relatório 2: Frequência e Afastamentos
  const gerarRelatorioFrequencia = async (tipoExport: "pdf" | "csv") => {
    const [faltasRes, atestadosRes, feriasRes] = await Promise.all([
      supabase.from("faltas" as any).select("*, servidor:servidores(*)"),
      supabase.from("atestados" as any).select("*, servidor:servidores(*)"),
      supabase.from("ferias_licencas" as any).select("*, servidor:servidores(*)"),
    ]);

    const headers = ["Data", "Servidor", "Matrícula", "Tipo de Ocorrência", "Detalhe / CID", "Justificativa"];
    const rows: (string | number)[][] = [];

    (faltasRes.data || []).forEach((f: any) => {
      rows.push([
        f.data,
        f.servidor?.nome_completo || "—",
        f.servidor?.matricula_funcional || "—",
        `Falta (${f.tipo})`,
        f.minutos_atraso > 0 ? `${f.minutos_atraso} min atraso` : "Turno integral",
        f.justificativa || "—",
      ]);
    });

    (atestadosRes.data || []).forEach((a: any) => {
      rows.push([
        a.data_inicio,
        a.servidor?.nome_completo || "—",
        a.servidor?.matricula_funcional || "—",
        "Atestado Médico",
        `${a.dias_afastamento} dias (CID: ${a.cid || "—"})`,
        a.observacoes || "—",
      ]);
    });

    (feriasRes.data || []).forEach((fe: any) => {
      rows.push([
        fe.data_inicio,
        fe.servidor?.nome_completo || "—",
        fe.servidor?.matricula_funcional || "—",
        fe.tipo,
        `Até ${fe.data_fim}`,
        fe.periodo_aquisitivo || "—",
      ]);
    });

    if (tipoExport === "pdf") {
      imprimirRelatorioOficial("Relatório Consolidado de Frequência e Afastamentos", "Faltas, atestados médicos e licenças operacionais", headers, rows);
    } else {
      exportarCsv("relatorio_frequencia_upsti", headers, rows);
    }
  };

  // Relatório 3: Banco de Folgas, Permutas e Plus
  const gerarRelatorioFolgasPlus = async (tipoExport: "pdf" | "csv") => {
    const [folgasRes, plusRes] = await Promise.all([
      supabase.from("folgas_ledger" as any).select("*, servidor:servidores(*)"),
      supabase.from("plantao_plus" as any).select("*, servidor:servidores(*)"),
    ]);

    const headers = ["Data Ref.", "Servidor", "Origem / Tipo", "Horas", "Situação", "Motivação / Descrição"];
    const rows: (string | number)[][] = [];

    (folgasRes.data || []).forEach((fl: any) => {
      rows.push([
        fl.data_referencia || "—",
        fl.servidor?.nome_completo || "—",
        `Folga (${fl.tipo.toUpperCase()})`,
        `${fl.tipo === "credito" ? "+" : "-"}${fl.horas}h`,
        fl.status,
        fl.descricao || fl.origem,
      ]);
    });

    (plusRes.data || []).forEach((pl: any) => {
      rows.push([
        pl.data,
        pl.servidor?.nome_completo || "—",
        "Plantão Plus",
        `+${pl.horas_extras}h`,
        "Realizado",
        pl.motivacao || "Reforço operacional",
      ]);
    });

    if (tipoExport === "pdf") {
      imprimirRelatorioOficial("Relatório do Banco de Folgas e Horas Extras", "Compensações, créditos de missões e plantões plus", headers, rows);
    } else {
      exportarCsv("relatorio_folgas_plus_upsti", headers, rows);
    }
  };

  // Relatório 4: Mapa Carcerário (Exclusivo Diretor)
  const gerarRelatorioMapaCarcerario = async (tipoExport: "pdf" | "csv") => {
    if (!isDiretor) {
      toast.error("Acesso restrito à Direção da Unidade.");
      return;
    }

    const { data: internos } = await supabase
      .from("internos" as any)
      .select("*, cela:celas(*)")
      .eq("status", "Custodiado")
      .order("cela_atual_id");

    const headers = ["Cela", "Nome Completo do Interno", "Matrícula SIISP", "Data Entrada", "Situação Custódia"];
    const rows = (internos || []).map((i: any) => [
      i.cela ? `${i.cela.bloco}-${String(i.cela.numero).padStart(2, "0")}` : "Sem cela",
      i.nome_completo,
      i.matricula_siisp,
      i.data_entrada,
      i.status,
    ]);

    if (tipoExport === "pdf") {
      imprimirRelatorioOficial("Mapa Carcerário Nominal — Blocos A e B", "Relação nominal confidencial de internos custodiados e alocação por cela", headers, rows);
    } else {
      exportarCsv("mapa_carcerario_nominal_upsti", headers, rows);
    }
  };

  // Relatório 5: Operações e Quilometragem
  const gerarRelatorioOperacoes = async (tipoExport: "pdf" | "csv") => {
    const { data: ops } = await supabase.from("operacoes_judiciais" as any).select("*").order("data_programada");
    const headers = ["Data", "Tipo", "Destino", "Processo Judicial", "Viatura", "KM Percorrido", "Status"];
    const rows = (ops || []).map((o: any) => {
      const kmTotal = o.km_retorno && o.km_saida ? `${Number(o.km_retorno) - Number(o.km_saida)} km` : "—";
      return [
        new Date(o.data_programada).toLocaleDateString("pt-BR"),
        o.tipo,
        o.unidade_destino,
        o.numero_processo,
        o.viatura || "—",
        kmTotal,
        o.status,
      ];
    });

    if (tipoExport === "pdf") {
      imprimirRelatorioOficial("Relatório de Operações Judiciais e Quilometragem", "Escoltas, júris populares, audiências e consumo de frota", headers, rows);
    } else {
      exportarCsv("relatorio_operacoes_frota_upsti", headers, rows);
    }
  };

  // Relatório 6: Inventário Bélico (Diretor e Intendência)
  const gerarRelatorioBelico = async (tipoExport: "pdf" | "csv") => {
    if (!isDiretor && !isIntendencia) {
      toast.error("Acesso restrito à Direção e Intendência.");
      return;
    }

    const { data: armas } = await supabase.from("armamentos" as any).select("*").order("tipo");
    const headers = ["Tipo", "Marca / Modelo", "Nº de Série", "Patrimônio", "Localização", "Conservação", "Situação"];
    const rows = (armas || []).map((a: any) => [
      a.tipo,
      `${a.marca || ""} ${a.modelo || ""}`,
      a.numero_serie,
      a.numero_patrimonio || "—",
      a.localizacao_fisica || "Reserva",
      a.estado_conservacao,
      a.status,
    ]);

    if (tipoExport === "pdf") {
      imprimirRelatorioOficial("Inventário Bélico e Armamento Controlado", "Controle rigoroso de armamentos, números de série e estado de conservação", headers, rows);
    } else {
      exportarCsv("inventario_belico_upsti", headers, rows);
    }
  };

  // Relatório 7: Auditoria Completa (Exclusivo Diretor)
  const gerarRelatorioAuditoria = async (tipoExport: "pdf" | "csv") => {
    if (!isDiretor) {
      toast.error("Acesso restrito ao Diretor.");
      return;
    }

    const { data: logs } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(300);
    const headers = ["Data / Hora", "Ação", "Entidade", "Usuário Role", "ID do Registro"];
    const rows = (logs || []).map((l: any) => [
      new Date(l.created_at).toLocaleString("pt-BR"),
      l.action,
      l.entity,
      l.user_role || "sistema",
      l.entity_id || "—",
    ]);

    if (tipoExport === "pdf") {
      imprimirRelatorioOficial("Trilha Completa de Auditoria Imutável", "Registros append-only de ações sensíveis, exclusões e autorizações", headers, rows);
    } else {
      exportarCsv("trilha_auditoria_upsti", headers, rows);
    }
  };

  // Exportação de Backup Completo (JSON de Contingência - Diretor)
  const executarBackupContingencia = async () => {
    if (!isDiretor) {
      toast.error("Apenas o Diretor pode gerar o backup de contingência.");
      return;
    }

    setBackupLoading(true);
    try {
      const [srvs, esc, flg, flt, att, fer, prm, pls, cel, ints, mov, mis, ops, arm, cau, man, aud] = await Promise.all([
        supabase.from("servidores" as any).select("*"),
        supabase.from("escalas_plantao" as any).select("*"),
        supabase.from("folgas_ledger" as any).select("*"),
        supabase.from("faltas" as any).select("*"),
        supabase.from("atestados" as any).select("*"),
        supabase.from("ferias_licencas" as any).select("*"),
        supabase.from("permutas" as any).select("*"),
        supabase.from("plantao_plus" as any).select("*"),
        supabase.from("celas" as any).select("*"),
        supabase.from("internos" as any).select("*"),
        supabase.from("movimentacoes_celas" as any).select("*"),
        supabase.from("missoes_externas" as any).select("*"),
        supabase.from("operacoes_judiciais" as any).select("*"),
        supabase.from("armamentos" as any).select("*"),
        supabase.from("cautelas_armamento" as any).select("*"),
        supabase.from("manutencoes_armamento" as any).select("*"),
        supabase.from("audit_logs").select("*").limit(1000),
      ]);

      const backupData = {
        metadata: {
          sistema: "GESTÃO UPSTI",
          versao: "2.0-PROD",
          unidade: "Unidade Prisional de Santa Inês",
          data_geracao: new Date().toISOString(),
          gerado_por: emissorProfile?.nome_completo || "Diretor",
        },
        tabelas: {
          servidores: srvs.data || [],
          escalas_plantao: esc.data || [],
          folgas_ledger: flg.data || [],
          faltas: flt.data || [],
          atestados: att.data || [],
          ferias_licencas: fer.data || [],
          permutas: prm.data || [],
          plantao_plus: pls.data || [],
          celas: cel.data || [],
          internos: ints.data || [],
          movimentacoes_celas: mov.data || [],
          missoes_externas: mis.data || [],
          operacoes_judiciais: ops.data || [],
          armamentos: arm.data || [],
          cautelas_armamento: cau.data || [],
          manutencoes_armamento: man.data || [],
          audit_logs: aud.data || [],
        },
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `BACKUP_UPSTI_CONTINGENCIA_${new Date().toISOString().split("T")[0]}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("Backup integral de contingência (JSON) gerado com sucesso.");
    } catch (err: any) {
      toast.error(err.message || "Erro ao compilar backup.");
    } finally {
      setBackupLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileBarChart}
        title="Relatórios Gerenciais, Exportação e Backup"
        description="Emissão oficial com cabeçalho institucional UPSTI, planilhas CSV e cópias de segurança de contingência."
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-card border">
          <TabsTrigger value="gerenciais">Relatórios Operacionais</TabsTrigger>
          {isDiretor && <TabsTrigger value="backup">Backup e Contingência (Direção)</TabsTrigger>}
        </TabsList>

        {/* Tab Relatórios */}
        <TabsContent value="gerenciais" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Relatório 1: Efetivo */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" /> Efetivo e Escalas
                </CardTitle>
                <CardDescription className="text-xs">
                  Relação de servidores por equipe (Alpha/Beta), regimes 24x72 e 12x36.
                </CardDescription>
              </CardHeader>
              <CardFooter className="flex gap-2 pt-0">
                <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => gerarRelatorioEfetivo("pdf")}>
                  <Printer className="mr-1 h-3.5 w-3.5" /> PDF Oficial
                </Button>
                <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => gerarRelatorioEfetivo("csv")}>
                  <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Excel
                </Button>
              </CardFooter>
            </Card>

            {/* Relatório 2: Frequência */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" /> Frequência e Afastamentos
                </CardTitle>
                <CardDescription className="text-xs">
                  Faltas, atrasos em minutos, atestados e períodos de férias.
                </CardDescription>
              </CardHeader>
              <CardFooter className="flex gap-2 pt-0">
                <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => gerarRelatorioFrequencia("pdf")}>
                  <Printer className="mr-1 h-3.5 w-3.5" /> PDF Oficial
                </Button>
                <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => gerarRelatorioFrequencia("csv")}>
                  <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Excel
                </Button>
              </CardFooter>
            </Card>

            {/* Relatório 3: Folgas e Horas Extras */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" /> Banco de Folgas & Plus
                </CardTitle>
                <CardDescription className="text-xs">
                  Lançamentos do razão contábil, permutas e consolidação de horas extras.
                </CardDescription>
              </CardHeader>
              <CardFooter className="flex gap-2 pt-0">
                <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => gerarRelatorioFolgasPlus("pdf")}>
                  <Printer className="mr-1 h-3.5 w-3.5" /> PDF Oficial
                </Button>
                <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => gerarRelatorioFolgasPlus("csv")}>
                  <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Excel
                </Button>
              </CardFooter>
            </Card>

            {/* Relatório 4: Mapa Carcerário (Diretor) */}
            {isDiretor && (
              <Card className="border-primary/30 bg-primary/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center justify-between">
                    <span className="flex items-center gap-2 text-primary">
                      <Building2 className="h-4 w-4" /> Mapa Carcerário (Celas)
                    </span>
                    <Badge variant="outline" className="text-[10px]">Sigiloso</Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Relação nominal de internos por cela (Blocos A e B) e matrículas SIISP.
                  </CardDescription>
                </CardHeader>
                <CardFooter className="flex gap-2 pt-0">
                  <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => gerarRelatorioMapaCarcerario("pdf")}>
                    <Printer className="mr-1 h-3.5 w-3.5" /> PDF Oficial
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => gerarRelatorioMapaCarcerario("csv")}>
                    <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Excel
                  </Button>
                </CardFooter>
              </Card>
            )}

            {/* Relatório 5: Operações e Frota */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Truck className="h-4 w-4 text-primary" /> Operações & Quilometragem
                </CardTitle>
                <CardDescription className="text-xs">
                  Escoltas, júris, audiências e totalização de KM rodados por viatura.
                </CardDescription>
              </CardHeader>
              <CardFooter className="flex gap-2 pt-0">
                <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => gerarRelatorioOperacoes("pdf")}>
                  <Printer className="mr-1 h-3.5 w-3.5" /> PDF Oficial
                </Button>
                <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => gerarRelatorioOperacoes("csv")}>
                  <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Excel
                </Button>
              </CardFooter>
            </Card>

            {/* Relatório 6: Inventário Bélico (Diretor e Intendência) */}
            {(isDiretor || isIntendencia) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" /> Inventário Bélico
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Armamentos serializados, estado de conservação e cautelas ativas.
                  </CardDescription>
                </CardHeader>
                <CardFooter className="flex gap-2 pt-0">
                  <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => gerarRelatorioBelico("pdf")}>
                    <Printer className="mr-1 h-3.5 w-3.5" /> PDF Oficial
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => gerarRelatorioBelico("csv")}>
                    <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Excel
                  </Button>
                </CardFooter>
              </Card>
            )}

            {/* Relatório 7: Auditoria Completa (Diretor) */}
            {isDiretor && (
              <Card className="border-primary/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center justify-between">
                    <span className="flex items-center gap-2 text-foreground">
                      <FileBarChart className="h-4 w-4 text-primary" /> Trilha de Auditoria
                    </span>
                    <Badge variant="outline" className="text-[10px]">Append-Only</Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Histórico imutável de inserções, edições, autorizações e cancelamentos.
                  </CardDescription>
                </CardHeader>
                <CardFooter className="flex gap-2 pt-0">
                  <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => gerarRelatorioAuditoria("pdf")}>
                    <Printer className="mr-1 h-3.5 w-3.5" /> PDF Oficial
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => gerarRelatorioAuditoria("csv")}>
                    <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Excel
                  </Button>
                </CardFooter>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Tab Backup (Direção) */}
        {isDiretor && (
          <TabsContent value="backup" className="space-y-6">
            <div className="rounded-lg border bg-card p-6 shadow-xs space-y-4">
              <div className="flex items-start gap-4">
                <Database className="h-8 w-8 text-primary shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-bold">Backup e Contingência Operacional</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Gere uma cópia completa dos dados operacionais (servidores, escalas, celas, internos, cautelas, missões e auditoria) em arquivo estruturado JSON.
                  </p>
                </div>
              </div>

              <div className="bg-muted/40 p-4 rounded-md text-xs space-y-2 border">
                <div className="font-semibold text-foreground">Orientações de Contingência e Segurança:</div>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>O banco PostgreSQL do Supabase já possui backups diários automáticos contínuos (WAL e Point-in-time Recovery).</li>
                  <li>Esta funcionalidade permite ao Diretor exportar um instantâneo manual sob demanda para armazenamento seguro offline.</li>
                  <li>O arquivo JSON gerado contém dados confidenciais e deve ser arquivado em mídia cifrada conforme os protocolos da unidade.</li>
                </ul>
              </div>

              <div className="pt-2">
                <Button
                  onClick={executarBackupContingencia}
                  disabled={backupLoading}
                  className="bg-primary text-primary-foreground font-semibold"
                >
                  <Download className="mr-2 h-4 w-4" />
                  {backupLoading ? "Gerando Backup..." : "Exportar Backup Completo (JSON)"}
                </Button>
              </div>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
