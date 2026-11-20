/** Contas internas sem e-mail real usam o domínio oficial do Maranhão / UPSTI. */
export const INTERNAL_DOMAIN = "upsti.ma.gov.br";

export function toLoginEmail(input: string) {
  const v = input.trim().toLowerCase();
  if (v.includes("@")) return v;
  if (v === "diretor") return "diretor@upsti.ma.gov.br";
  return `${v.replace(/[^a-z0-9._-]/g, "")}@${INTERNAL_DOMAIN}`;
}
