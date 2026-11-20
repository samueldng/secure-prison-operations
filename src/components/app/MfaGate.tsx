import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Enroll = { factorId: string; qr: string; secret: string };

export function MfaGate({ onSignOut }: { onSignOut: () => void }) {
  const qc = useQueryClient();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enroll, setEnroll] = useState<Enroll | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data, error: listError } = await supabase.auth.mfa.listFactors();
        if (listError) {
          console.warn("MFA listFactors warning:", listError);
          setLoading(false);
          return;
        }
        const verified = data?.totp?.find((f) => f.status === "verified");
        if (verified) {
          setFactorId(verified.id);
        } else {
          // remove fatores pendentes antigos antes de cadastrar novo
          for (const f of data?.all ?? []) {
            if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
          }
          const { data: e, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `UPSTI-${Date.now()}` });
          if (error) {
            toast.error(error.message);
          } else if (e?.totp) {
            setEnroll({ factorId: e.id, qr: e.totp.qr_code, secret: e.totp.secret });
          }
        }
      } catch (err: any) {
        console.error("MfaGate initialization error:", err);
        toast.error("Erro ao inicializar verificação 2FA.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const id = factorId ?? enroll?.factorId;
    if (!id) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code: code.trim() });
    setBusy(false);
    if (error) {
      toast.error("Código inválido. Confira o aplicativo autenticador.");
      return;
    }
    toast.success("Verificação em duas etapas confirmada.");
    await qc.invalidateQueries({ queryKey: ["me"] });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <form onSubmit={verify} className="w-full max-w-sm space-y-5 rounded-md border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Verificação em duas etapas</h1>
            <p className="text-sm text-muted-foreground">Obrigatória para Diretor e Intendência.</p>
          </div>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : enroll ? (
          <div className="space-y-3 text-sm">
            <p>1. Abra um aplicativo autenticador (Google Authenticator, Microsoft Authenticator ou similar) e escaneie o código:</p>
            <div className="flex justify-center rounded-md bg-card p-2">
              <img src={enroll.qr} alt="QR Code para autenticador" className="h-44 w-44" />
            </div>
            <p className="break-all font-mono text-xs text-muted-foreground">Chave manual: {enroll.secret}</p>
            <p>2. Digite o código de 6 dígitos gerado.</p>
          </div>
        ) : (
          <p className="text-sm">Digite o código de 6 dígitos do seu aplicativo autenticador.</p>
        )}
        <div className="space-y-2">
          <Label htmlFor="otp">Código</Label>
          <Input id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="text-center font-mono text-lg tracking-[0.4em]" />
        </div>
        <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>Verificar</Button>
        <Button type="button" variant="ghost" className="w-full" onClick={onSignOut}>Sair</Button>
      </form>
    </div>
  );
}
