import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { toLoginEmail } from "@/lib/login";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Acesso restrito — GESTÃO UPSTI" },
      { name: "description", content: "Acesso exclusivo para servidores da Unidade Prisional de Santa Inês." },
      { property: "og:title", content: "Acesso restrito — GESTÃO UPSTI" },
      { property: "og:description", content: "Acesso exclusivo para servidores da UPSTI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: toLoginEmail(login), password });
    setBusy(false);
    if (error) {
      toast.error("Usuário ou senha inválidos.");
      return;
    }
    qc.clear();
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-md bg-card p-6 shadow-lg">
        <div className="space-y-1 text-center">
          <Lock className="mx-auto h-7 w-7 text-primary" />
          <h1 className="text-xl font-bold tracking-wide">GESTÃO UPSTI</h1>
          <p className="text-xs text-muted-foreground">Unidade Prisional de Santa Inês — acesso restrito</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="login">Usuário ou e-mail</Label>
          <Input id="login" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw">Senha</Label>
          <Input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>Entrar</Button>
        <p className="text-center text-xs text-muted-foreground">Não há cadastro público. Contas são criadas pela Direção.</p>
      </form>
    </div>
  );
}
