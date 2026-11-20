import { Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({
  icon: Icon = Inbox,
  title = "Nenhum registro encontrado",
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card px-6 py-12 text-center">
      <Icon className="h-10 w-10 text-muted-foreground/50" />
      <div>
        <p className="font-medium text-muted-foreground">{title}</p>
        {description && <p className="mt-1 text-sm text-muted-foreground/70">{description}</p>}
      </div>
      {action}
    </div>
  );
}
