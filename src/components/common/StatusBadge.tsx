import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const COLOR: Record<string, string> = {
  // ✅ Success
  Ativo: "bg-success text-success-foreground",
  Presente: "bg-success text-success-foreground",
  Aprovada: "bg-success text-success-foreground",
  Autorizada: "bg-success text-success-foreground",
  Concluída: "bg-success text-success-foreground",
  Disponível: "bg-success text-success-foreground",
  Devolvida: "bg-success text-success-foreground",
  Justificada: "bg-success text-success-foreground",
  Ótimo: "bg-success text-success-foreground",
  credito: "bg-success text-success-foreground",
  // ⚠ Warning
  Pendente: "bg-warning text-warning-foreground",
  Solicitada: "bg-warning text-warning-foreground",
  "Em Andamento": "bg-warning text-warning-foreground",
  "Em Vigor": "bg-warning text-warning-foreground",
  "Em Manutenção": "bg-warning text-warning-foreground",
  Aceita: "bg-warning text-warning-foreground",
  Cautelado: "bg-warning text-warning-foreground",
  Regular: "bg-warning text-warning-foreground",
  // 🔴 Danger
  Inativo: "bg-destructive text-destructive-foreground",
  Ausente: "bg-destructive text-destructive-foreground",
  Cancelada: "bg-destructive text-destructive-foreground",
  Recusada: "bg-destructive text-destructive-foreground",
  Rejeitada: "bg-destructive text-destructive-foreground",
  Interditada: "bg-destructive text-destructive-foreground",
  Injustificada: "bg-destructive text-destructive-foreground",
  Inoperante: "bg-destructive text-destructive-foreground",
  Baixado: "bg-destructive text-destructive-foreground",
  debito: "bg-destructive text-destructive-foreground",
  "Alvará/Saída": "bg-destructive text-destructive-foreground",
  // 🔵 Info
  Escalado: "bg-info text-info-foreground",
  Programada: "bg-info text-info-foreground",
  Férias: "bg-info text-info-foreground",
  Licença: "bg-info text-info-foreground",
  Bom: "bg-info text-info-foreground",
  Custodiado: "bg-info text-info-foreground",
  Ativa: "bg-info text-info-foreground",
  // ⬜ Neutral
  Vazia: "bg-muted text-muted-foreground",
  Substituído: "bg-muted text-muted-foreground",
  Afastado: "bg-muted text-muted-foreground",
  Ocupada: "bg-secondary text-secondary-foreground",
  Isolada: "bg-secondary text-secondary-foreground",
  Transferido: "bg-muted text-muted-foreground",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
  size?: "sm" | "default";
}

export function StatusBadge({ status, className, size = "default" }: StatusBadgeProps) {
  const color = COLOR[status] ?? "bg-secondary text-secondary-foreground";
  return (
    <Badge
      className={cn(
        color,
        "pointer-events-none select-none font-medium",
        size === "sm" && "px-1.5 py-0 text-[10px]",
        className,
      )}
    >
      {status}
    </Badge>
  );
}
