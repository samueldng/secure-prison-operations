/** Contas internas sem e-mail real usam o domínio interno. "diretor" -> diretor@upsti.local */
export const INTERNAL_DOMAIN = "upsti.local";
export function toLoginEmail(input: string) {
  const v = input.trim().toLowerCase();
  return v.includes("@") ? v : `${v.replace(/[^a-z0-9._-]/g, "")}@${INTERNAL_DOMAIN}`;
}
