import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ icon: Icon, title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2.5">
          <Icon className="h-6 w-6 shrink-0 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        </div>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-0">{actions}</div>}
    </div>
  );
}
