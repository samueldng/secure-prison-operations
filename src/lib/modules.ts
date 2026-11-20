import {
  LayoutDashboard, Users, CalendarDays, CalendarCheck, Stethoscope, Plane, Repeat,
  Building2, MapPin, Truck, Gavel, Shield, FileBarChart, UserCog, type LucideIcon,
} from "lucide-react";

export type AppRole = "diretor" | "chefia" | "intendencia" | "servidor";

export const ROLE_LABEL: Record<AppRole, string> = {
  diretor: "Diretor",
  chefia: "Chefia",
  intendencia: "Intendência",
  servidor: "Servidor",
};

/** Perfis que exigem verificação em duas etapas (2FA). */
export const MFA_ROLES: AppRole[] = ["diretor", "intendencia"];

export type ModuleDef = {
  slug: string;
  num: string;
  title: string;
  icon: LucideIcon;
  roles: AppRole[];
  phase: number;
};

// Visibilidade de menu apenas. A proteção real dos dados está nas políticas do banco.
export const MODULES: ModuleDef[] = [
  { slug: "servidores", num: "02", title: "Gestão de Servidores", icon: Users, roles: ["diretor", "chefia", "servidor"], phase: 2 },
  { slug: "escalas", num: "03", title: "Escalas e Plantões", icon: CalendarDays, roles: ["diretor", "chefia", "servidor"], phase: 2 },
  { slug: "folgas", num: "04", title: "Folgas e Missões", icon: CalendarCheck, roles: ["diretor", "chefia", "servidor"], phase: 2 },
  { slug: "faltas", num: "05", title: "Faltas e Atestados", icon: Stethoscope, roles: ["diretor", "chefia", "servidor"], phase: 2 },
  { slug: "ferias", num: "06", title: "Férias e Licenças", icon: Plane, roles: ["diretor", "chefia", "servidor"], phase: 2 },
  { slug: "permutas", num: "07", title: "Permutas e Plantão Plus", icon: Repeat, roles: ["diretor", "chefia", "servidor"], phase: 2 },
  { slug: "blocos", num: "08", title: "Bloco A e Bloco B", icon: Building2, roles: ["diretor"], phase: 3 },
  { slug: "missoes", num: "09", title: "Missões Externas", icon: MapPin, roles: ["diretor", "chefia", "servidor"], phase: 3 },
  { slug: "escoltas", num: "10", title: "Escoltas", icon: Truck, roles: ["diretor", "chefia", "servidor"], phase: 3 },
  { slug: "juris", num: "11", title: "Júris e Audiências", icon: Gavel, roles: ["diretor", "chefia", "servidor"], phase: 3 },
  { slug: "intendencia", num: "12", title: "Intendência e Armamento", icon: Shield, roles: ["diretor", "intendencia", "servidor"], phase: 4 },
  { slug: "relatorios", num: "13", title: "Relatórios", icon: FileBarChart, roles: ["diretor", "chefia", "intendencia", "servidor"], phase: 4 },
];

export const DASHBOARD = { title: "Dashboard Operacional", icon: LayoutDashboard };
export const ADMIN_LINKS = {
  usuarios: { title: "Contas de Acesso", icon: UserCog },
  auditoria: { title: "Auditoria", icon: FileBarChart },
};

export function modulesFor(role: AppRole | null) {
  if (!role) return [];
  return MODULES.filter((m) => m.roles.includes(role));
}

/** Tempo máximo sem atividade antes do bloqueio de sessão. */
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
