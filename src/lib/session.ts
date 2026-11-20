import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "./modules";

const PRIORITY: AppRole[] = ["diretor", "intendencia", "chefia", "servidor"];

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return null;
    const [{ data: profile }, { data: roles }, aal] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", u.user.id),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    const list = (roles ?? []).map((r) => r.role as AppRole);
    const role = PRIORITY.find((r) => list.includes(r)) ?? null;
    return {
      user: u.user,
      profile,
      role,
      aal: aal.data?.currentLevel ?? "aal1",
      nextAal: aal.data?.nextLevel ?? "aal1",
    };
  },
  staleTime: 30_000,
});
