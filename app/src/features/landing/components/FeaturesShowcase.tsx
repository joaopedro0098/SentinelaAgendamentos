import { Reveal } from "@/components/layout/PageReveal";

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
    <section className="py-16 md:py-24 border-t border-border/60">
      <div className="container">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <div>
            <Reveal index={5}>
              <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight leading-tight">
                Tudo o que você precisa em uma única aba.
              </h2>
            </Reveal>
            <Reveal index={6}>
              <p className="mt-4 text-muted-foreground text-base md:text-lg leading-relaxed">
                Eliminamos a complexidade para você focar no que importa: o cuidado com o paciente.
              </p>
            </Reveal>
            <ul className="mt-8 space-y-6">
              {FEATURES.map((feature, i) => (
                <Reveal key={feature.title} index={7 + i}>
                  <li className="flex gap-3">
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent/70" aria-hidden />
                    <div>
                      <p className="font-semibold text-foreground">{feature.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                    </div>
                  </li>
                </Reveal>
              ))}
            </ul>
          </div>

          <Reveal index={10}>
            <div className="relative mx-auto max-w-xl lg:max-w-none">
              <div className="rounded-2xl border border-border/70 bg-card shadow-elevated overflow-hidden">
                <img
                  src="/landing-dashboard-preview.png"
                  alt="Visual ilustrativo de um painel de agendamentos"
                  className="w-full h-auto object-cover object-left-top"
                  loading="lazy"
                />
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
