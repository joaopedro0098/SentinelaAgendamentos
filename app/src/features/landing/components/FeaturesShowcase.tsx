import { Link } from "react-router-dom";
import { Reveal } from "@/components/layout/PageReveal";
import { Button } from "@/components/ui/button";
import { LandingPanelPreview } from "@/features/landing/components/LandingPanelPreview";

const FEATURES = [
  {
    title: "Agendamento 24h",
    description:
      "Link personalizado para seus pacientes marcarem e pagarem consultas sem te interromper (opcional).",
  },
  {
    title: "Área Paciente",
    description: "Registre anotações, documentos, e ficha cadastral dos seus pacientes.",
  },
  {
    title: "Relatório",
    description:
      "Filtre por período e tenha uma visão de faturamento, agendamentos concluídos, cancelados para se organizar melhor.",
  },
];

export function FeaturesShowcase() {
  return (
    <section className="pt-4 md:pt-6 pb-16 md:pb-24 border-t border-border/60">
      <div className="container min-w-0 max-w-full">
        <div className="grid min-w-0 lg:grid-cols-2 gap-8 lg:gap-14 items-center">
          <div className="min-w-0 w-full order-1 lg:order-2 space-y-5">
            <Reveal index={10} className="min-w-0 w-full">
              <LandingPanelPreview />
            </Reveal>
            <Reveal index={11}>
              <div className="flex justify-center lg:justify-start">
                <Button
                  asChild
                  className="h-12 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground border-0 px-8 text-base font-medium"
                >
                  <Link to="/signup">Testar 14 dias Grátis</Link>
                </Button>
              </div>
            </Reveal>
          </div>

          <div className="min-w-0 w-full order-2 lg:order-1">
            <Reveal index={5}>
              <h2 className="font-display text-[1.65rem] sm:text-3xl md:text-4xl font-bold tracking-tight leading-snug sm:leading-tight text-balance break-words">
                Tudo o que você precisa em uma única aba.
              </h2>
            </Reveal>
            <Reveal index={6}>
              <p className="mt-4 text-muted-foreground text-[15px] sm:text-base md:text-lg leading-relaxed break-words">
                Eliminamos a complexidade para você focar no que importa: o cuidado com o paciente.
              </p>
            </Reveal>
            <ul className="mt-8 space-y-6 min-w-0">
              {FEATURES.map((feature, i) => (
                <Reveal key={feature.title} index={7 + i}>
                  <li className="flex gap-3 min-w-0">
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent/70" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground break-words">{feature.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground leading-relaxed break-words [overflow-wrap:anywhere]">
                        {feature.description}
                      </p>
                    </div>
                  </li>
                </Reveal>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
