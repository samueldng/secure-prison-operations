import { useState } from "react";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { meQuery } from "@/lib/session";
import { ADMIN_LINKS, DASHBOARD, IDLE_TIMEOUT_MS, MFA_ROLES, ROLE_LABEL, modulesFor } from "@/lib/modules";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { MfaGate } from "./MfaGate";
import { useIdleLogout } from "./useIdleLogout";

const linkBase = "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent";
const linkActive = "bg-sidebar-accent text-sidebar-accent-foreground font-medium";

function NavList({ role, onNavigate }: { role: ReturnType<typeof useMe>["role"]; onNavigate?: () => void }) {
  const mods = modulesFor(role);
  return (
    <nav className="flex flex-col gap-0.5">
      <Link to="/dashboard" className={linkBase} activeProps={{ className: linkActive }} onClick={onNavigate}>
        <DASHBOARD.icon className="h-4 w-4 shrink-0" /> <span className="font-mono text-xs opacity-60">01</span> {DASHBOARD.title}
      </Link>
      {mods.map((m) => (
        <Link key={m.slug} to="/modulo/$slug" params={{ slug: m.slug }} className={linkBase} activeProps={{ className: linkActive }} onClick={onNavigate}>
          <m.icon className="h-4 w-4 shrink-0" /> <span className="font-mono text-xs opacity-60">{m.num}</span> {m.title}
        </Link>
      ))}
      {role === "diretor" && (
        <>
          <div className="mt-4 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">Direção</div>
          <Link to="/usuarios" className={linkBase} activeProps={{ className: linkActive }} onClick={onNavigate}>
            <ADMIN_LINKS.usuarios.icon className="h-4 w-4" /> {ADMIN_LINKS.usuarios.title}
          </Link>
          <Link to="/auditoria" className={linkBase} activeProps={{ className: linkActive }} onClick={onNavigate}>
            <ADMIN_LINKS.auditoria.icon className="h-4 w-4" /> {ADMIN_LINKS.auditoria.title}
          </Link>
        </>
      )}
    </nav>
  );
}

function useMe() {
  const q = useQuery(meQuery);
  return { ...q, role: q.data?.role ?? null };
}

const MFA_ENABLED = import.meta.env.VITE_REQUIRE_MFA === "true";

export function AppShell() {
  const { data, isLoading, role } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  async function signOut(reason?: string) {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    if (reason) toast.warning(reason);
    navigate({ to: "/auth", replace: true });
  }

  useIdleLogout(IDLE_TIMEOUT_MS, () => signOut("Sessão encerrada por inatividade."));

  if (isLoading || !data) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando…</div>;
  }

  if (!role || data.profile?.ativo === false) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="max-w-sm space-y-4 rounded-md border bg-card p-6 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-destructive" />
          <h1 className="font-semibold">Conta sem perfil de acesso</h1>
          <p className="text-sm text-muted-foreground">Sua conta ainda não foi vinculada a um perfil ou está inativa. Procure a Direção da unidade.</p>
          <Button variant="outline" onClick={() => signOut()}>Sair</Button>
        </div>
      </div>
    );
  }

  // MFA / 2FA desativado para acesso direto
  // if (MFA_ENABLED && MFA_ROLES.includes(role) && data.aal !== "aal2") {
  //   return <MfaGate onSignOut={() => signOut()} />;
  // }

  const mods = modulesFor(role).slice(0, 3);

  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside className="hidden w-72 shrink-0 flex-col bg-sidebar lg:flex">
        <Brand />
        <div className="flex-1 overflow-y-auto px-3 py-2"><NavList role={role} /></div>
        <UserBox name={data.profile?.nome_completo || data.user.email || ""} role={role} onSignOut={() => signOut()} />
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between bg-sidebar px-4 py-3 lg:hidden">
        <div className="text-sm font-bold tracking-wide text-sidebar-primary">GESTÃO UPSTI</div>
        <span className="rounded bg-sidebar-accent px-2 py-0.5 text-xs text-sidebar-accent-foreground">{ROLE_LABEL[role]}</span>
      </header>

      <main className="flex-1 pb-24 lg:pb-0">
        <div className="mx-auto max-w-6xl p-4 lg:p-8"><Outlet /></div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card lg:hidden">
        <Link to="/dashboard" className="flex flex-col items-center gap-1 py-2 text-[11px] text-muted-foreground" activeProps={{ className: "text-primary font-semibold" }}>
          <DASHBOARD.icon className="h-5 w-5" /> Início
        </Link>
        {mods.map((m) => (
          <Link key={m.slug} to="/modulo/$slug" params={{ slug: m.slug }} className="flex flex-col items-center gap-1 py-2 text-[11px] text-muted-foreground" activeProps={{ className: "text-primary font-semibold" }}>
            <m.icon className="h-5 w-5" /> <span className="max-w-full truncate px-1">{m.title.split(" ")[0]}</span>
          </Link>
        ))}
        <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-1 py-2 text-[11px] text-muted-foreground">
          <Menu className="h-5 w-5" /> Menu
        </button>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-80 border-0 bg-sidebar p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="flex h-full flex-col">
            <Brand />
            <div className="flex-1 overflow-y-auto px-3 py-2"><NavList role={role} onNavigate={() => setOpen(false)} /></div>
            <UserBox name={data.profile?.nome_completo || data.user.email || ""} role={role} onSignOut={() => signOut()} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Brand() {
  return (
    <div className="border-b border-sidebar-border px-5 py-5">
      <div className="text-base font-bold tracking-wide text-sidebar-primary">GESTÃO UPSTI</div>
      <div className="text-xs text-sidebar-foreground/70">Unidade Prisional de Santa Inês</div>
    </div>
  );
}

function UserBox({ name, role, onSignOut }: { name: string; role: keyof typeof ROLE_LABEL; onSignOut: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-sidebar-border px-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-sidebar-primary">{name}</div>
        <div className="text-xs text-sidebar-foreground/70">{ROLE_LABEL[role]}</div>
      </div>
      <Button size="icon" variant="ghost" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={onSignOut} aria-label="Sair">
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}
