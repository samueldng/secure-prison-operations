import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GESTÃO UPSTI — Unidade Prisional de Santa Inês" },
      { name: "description", content: "Sistema de controle administrativo e operacional da UPSTI." },
      { property: "og:title", content: "GESTÃO UPSTI" },
      { property: "og:description", content: "Sistema de controle administrativo e operacional da UPSTI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
