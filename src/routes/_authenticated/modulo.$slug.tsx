import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MODULES } from "@/lib/modules";
import { meQuery } from "@/lib/session";
import { ServidoresModule } from "@/components/modules/servidores/ServidoresModule";
import { EscalasModule } from "@/components/modules/escalas/EscalasModule";
import { FolgasModule } from "@/components/modules/folgas/FolgasModule";
import { FaltasModule } from "@/components/modules/faltas/FaltasModule";
import { FeriasModule } from "@/components/modules/ferias/FeriasModule";
import { PermutasModule } from "@/components/modules/permutas/PermutasModule";
import { BlocosModule } from "@/components/modules/blocos/BlocosModule";
import { MissoesModule } from "@/components/modules/missoes/MissoesModule";
import { OperacoesModule } from "@/components/modules/operacoes/OperacoesModule";
import { IntendenciaModule } from "@/components/modules/intendencia/IntendenciaModule";
import { RelatoriosModule } from "@/components/modules/relatorios/RelatoriosModule";

export const Route = createFileRoute("/_authenticated/modulo/$slug")({
  loader: ({ params }) => {
    const m = MODULES.find((x) => x.slug === params.slug);
    if (!m) throw notFound();
    return { slug: m.slug, title: m.title };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.title || "Módulo"} — GESTÃO UPSTI` },
      { name: "description", content: "Sistema de Controle Operacional da UPSTI." },
      { property: "og:title", content: `${loaderData?.title || "Módulo"} — GESTÃO UPSTI` },
    ],
  }),
  component: ModuloPage,
});

function ModuloPage() {
  const { slug } = Route.useLoaderData();
  const { data: me } = useQuery(meQuery);
  const role = me?.role ?? null;
  const userId = me?.user?.id ?? "";

  switch (slug) {
    case "servidores":
      return <ServidoresModule userRole={role} userId={userId} />;
    case "escalas":
      return <EscalasModule userRole={role} userId={userId} />;
    case "folgas":
      return <FolgasModule userRole={role} userId={userId} />;
    case "faltas":
      return <FaltasModule userRole={role} userId={userId} />;
    case "ferias":
      return <FeriasModule userRole={role} userId={userId} />;
    case "permutas":
      return <PermutasModule userRole={role} userId={userId} />;
    case "blocos":
      return <BlocosModule userRole={role} userId={userId} />;
    case "missoes":
      return <MissoesModule userRole={role} userId={userId} />;
    case "escoltas":
      return <OperacoesModule userRole={role} userId={userId} defaultTipo="Escolta" />;
    case "juris":
      return <OperacoesModule userRole={role} userId={userId} defaultTipo="JuriAudiencia" />;
    case "intendencia":
      return <IntendenciaModule userRole={role} userId={userId} />;
    case "relatorios":
      return <RelatoriosModule userRole={role} userId={userId} />;
    default:
      return null;
  }
}
