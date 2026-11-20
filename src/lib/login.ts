/** Contas internas sem e-mail real usam o domínio oficial do Maranhão / UPSTI. */
export const INTERNAL_DOMAIN = "upsti.ma.gov.br";

export function toLoginEmail(input: string) {
  const v = input.trim().toLowerCase();
  if (v === "diretor" || v === "diretor@upsti.local" || v === "diretor@upsti.ma.gov.br") {
    return "diretor@upsti.ma.gov.br";
  }
  if (v.includes("@")) return v;
  return `${v.replace(/[^a-z0-9._-]/g, "")}@${INTERNAL_DOMAIN}`;
}
