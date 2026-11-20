/**
 * Tipos da aplicação GESTÃO UPSTI.
 *
 * Estes tipos espelham o schema SQL dos módulos 01–12.
 * Quando as migrations forem aplicadas via Lovable e o `types.ts` for
 * regenerado, estes tipos podem ser gradualmente substituídos pelos
 * auto-gerados. Até lá, use `supabase.from('tabela' as any)` e faça
 * cast do resultado: `data as Servidor[]`.
 */

// ==================== MÓDULO 01 ====================
export interface Servidor {
  id: string;
  user_id: string | null;
  nome_completo: string;
  matricula_funcional: string;
  cpf: string | null;
  cargo_funcao: string | null;
  lotacao: string | null;
  telefone: string | null;
  email: string | null;
  regime_escala: "24x72" | "12x36";
  equipe: "Alpha" | "Beta";
  turno_padrao: "Diurno" | "Noturno";
  status: ServidorStatus;
  data_admissao: string | null;
  created_at: string;
  updated_at: string;
}

export type ServidorStatus = "Ativo" | "Férias" | "Licença" | "Afastado" | "Inativo";

export const SERVIDOR_STATUS: ServidorStatus[] = ["Ativo", "Férias", "Licença", "Afastado", "Inativo"];
export const REGIMES: Servidor["regime_escala"][] = ["24x72", "12x36"];
export const EQUIPES: Servidor["equipe"][] = ["Alpha", "Beta"];
export const TURNOS: Servidor["turno_padrao"][] = ["Diurno", "Noturno"];

// ==================== MÓDULO 02 ====================
export interface EscalaPlantao {
  id: string;
  servidor_id: string;
  data: string;
  turno: "Diurno" | "Noturno";
  tipo: "Regular" | "Extra" | "Cobertura";
  status: "Escalado" | "Presente" | "Ausente" | "Substituído";
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  // Join
  servidor?: Servidor;
}

// ==================== MÓDULO 03 ====================
export interface FolgaLedger {
  id: string;
  servidor_id: string;
  tipo: "credito" | "debito";
  horas: number;
  origem: "regulamentar" | "missao_externa" | "compensacao" | "gozo";
  referencia_id: string | null;
  descricao: string | null;
  data_referencia: string | null;
  status: "Pendente" | "Aprovada" | "Rejeitada" | "Gozada";
  aprovado_por: string | null;
  aprovado_em: string | null;
  created_at: string;
  servidor?: Servidor;
}

// ==================== MÓDULO 04 ====================
export interface Falta {
  id: string;
  servidor_id: string;
  data: string;
  tipo: "Justificada" | "Injustificada";
  minutos_atraso: number;
  justificativa: string | null;
  registrado_por: string | null;
  created_at: string;
  updated_at: string;
  servidor?: Servidor;
}

export interface Atestado {
  id: string;
  servidor_id: string;
  data_inicio: string;
  dias_afastamento: number;
  cid: string | null;
  observacoes: string | null;
  arquivo_path: string | null;
  registrado_por: string | null;
  created_at: string;
  updated_at: string;
  servidor?: Servidor;
}

// ==================== MÓDULO 05 ====================
export type FeriasLicencaTipo =
  | "Férias"
  | "Recesso"
  | "Licença Médica"
  | "Licença Prêmio"
  | "Licença Maternidade"
  | "Licença Paternidade"
  | "Licença Interesse Particular";

export const FERIAS_TIPOS: FeriasLicencaTipo[] = [
  "Férias", "Recesso", "Licença Médica", "Licença Prêmio",
  "Licença Maternidade", "Licença Paternidade", "Licença Interesse Particular",
];

export type FeriasStatus = "Solicitada" | "Aprovada" | "Em Vigor" | "Concluída" | "Cancelada";

export interface FeriasLicenca {
  id: string;
  servidor_id: string;
  tipo: FeriasLicencaTipo;
  periodo_aquisitivo: string | null;
  data_inicio: string;
  data_fim: string;
  status: FeriasStatus;
  aprovado_por: string | null;
  aprovado_em: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  servidor?: Servidor;
}

// ==================== MÓDULO 06 ====================
export type PermutaStatus = "Solicitada" | "Aceita" | "Autorizada" | "Recusada" | "Cancelada";

export interface Permuta {
  id: string;
  solicitante_id: string;
  substituto_id: string;
  data_original: string;
  turno_original: "Diurno" | "Noturno";
  data_compensacao: string;
  turno_compensacao: "Diurno" | "Noturno";
  justificativa: string | null;
  status: PermutaStatus;
  aceito_em: string | null;
  autorizado_por: string | null;
  autorizado_em: string | null;
  created_at: string;
  updated_at: string;
  solicitante?: Servidor;
  substituto?: Servidor;
}

export interface PlantaoPlus {
  id: string;
  servidor_id: string;
  data: string;
  turno: "Diurno" | "Noturno";
  horas_extras: number;
  motivacao: string | null;
  created_at: string;
  updated_at: string;
  servidor?: Servidor;
}

// ==================== MÓDULO 07 ====================
export type CelaSituacao = "Ocupada" | "Vazia" | "Isolada" | "Interditada";

export interface Cela {
  id: string;
  bloco: "A" | "B";
  numero: number;
  capacidade: number;
  situacao: CelaSituacao;
  observacoes_administrativas: string | null;
  created_at: string;
  updated_at: string;
  // Computed
  internos_count?: number;
  internos?: Interno[];
}

export type InternoStatus = "Custodiado" | "Transferido" | "Alvará/Saída";

export interface Interno {
  id: string;
  nome_completo: string;
  matricula_siisp: string;
  cela_atual_id: string | null;
  data_entrada: string;
  data_saida: string | null;
  status: InternoStatus;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  cela?: Cela;
}

export interface MovimentacaoCela {
  id: string;
  interno_id: string;
  cela_origem_id: string | null;
  cela_destino_id: string;
  motivo: string;
  autorizado_por: string;
  created_at: string;
}

// ==================== MÓDULO 08 ====================
export type MissaoStatus = "Solicitada" | "Autorizada" | "Em Andamento" | "Concluída" | "Cancelada";

export interface MissaoExterna {
  id: string;
  servidor_responsavel_id: string;
  equipe_ids: string[];
  data_saida: string;
  data_retorno: string | null;
  horas_trabalhadas: number | null;
  destino: string;
  finalidade: string;
  status: MissaoStatus;
  autorizado_por: string | null;
  autorizado_em: string | null;
  created_at: string;
  updated_at: string;
  servidor_responsavel?: Servidor;
}

// ==================== MÓDULOS 09/10 ====================
export type OperacaoTipo = "Escolta" | "Tribunal do Júri" | "Audiência";
export type OperacaoStatus = "Programada" | "Autorizada" | "Em Andamento" | "Concluída" | "Cancelada";

export interface OperacaoJudicial {
  id: string;
  tipo: OperacaoTipo;
  internos_ids: string[];
  numero_processo: string;
  unidade_destino: string;
  data_programada: string;
  equipe_ids: string[];
  viatura: string | null;
  km_saida: number | null;
  km_retorno: number | null;
  horario_saida: string | null;
  horario_chegada: string | null;
  status: OperacaoStatus;
  autorizado_por: string | null;
  autorizado_em: string | null;
  relatorio_final: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

// ==================== MÓDULO 11 ====================
export type ArmamentoTipo = "Pistola" | "Espingarda" | "Carabina" | "Colete" | "Munição" | "Acessório Controlado";
export type EstadoConservacao = "Ótimo" | "Bom" | "Regular" | "Inoperante";
export type ArmamentoStatus = "Disponível" | "Cautelado" | "Em Manutenção" | "Baixado";

export const ARMAMENTO_TIPOS: ArmamentoTipo[] = [
  "Pistola", "Espingarda", "Carabina", "Colete", "Munição", "Acessório Controlado",
];
export const ESTADOS_CONSERVACAO: EstadoConservacao[] = ["Ótimo", "Bom", "Regular", "Inoperante"];

export interface Armamento {
  id: string;
  tipo: ArmamentoTipo;
  marca: string | null;
  modelo: string | null;
  numero_serie: string | null;
  numero_patrimonio: string | null;
  quantidade: number;
  localizacao_fisica: string | null;
  estado_conservacao: EstadoConservacao;
  status: ArmamentoStatus;
  responsavel_guarda: string | null;
  created_at: string;
  updated_at: string;
}

export type CautelaStatus = "Solicitada" | "Ativa" | "Devolvida" | "Cancelada";

export interface CautelaArmamento {
  id: string;
  armamento_id: string;
  servidor_id: string;
  status: CautelaStatus;
  autorizado_por: string | null;
  autorizado_em: string | null;
  data_retirada: string | null;
  data_devolucao_prevista: string | null;
  data_devolucao_efetiva: string | null;
  estado_devolucao: EstadoConservacao | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  armamento?: Armamento;
  servidor?: Servidor;
}

export interface ManutencaoArmamento {
  id: string;
  armamento_id: string;
  tipo: "Preventiva" | "Corretiva";
  descricao_tecnica: string;
  responsavel: string | null;
  data_entrada: string;
  data_retorno: string | null;
  created_at: string;
  updated_at: string;
  armamento?: Armamento;
}

// ==================== HELPERS ====================
/** Calcula folgas inteiras de 12h disponíveis a partir do saldo total de horas */
export function calcularFolgas(horasAcumuladas: number) {
  const folgasInteiras = Math.floor(horasAcumuladas / 12);
  const residuo = horasAcumuladas % 12;
  return { folgasInteiras, residuo };
}
