import { useState } from "react";
import { Reveal } from "@/components/layout/PageReveal";
import { cn } from "@/lib/utils";

type Specialty = {
  id: string;
  label: string;
  description: string;
};

const SPECIALTIES: Specialty[] = [
  {
    id: "psicologos",
    label: "Psicólogos",
    description: "Sessões recorrentes, lembretes discretos e agenda organizada para o cuidado contínuo.",
  },
  {
    id: "medicos",
    label: "Médicos",
    description: "Consultas, retornos e encaixes em um fluxo simples para você e sua equipe.",
  },
  {
    id: "nutricionistas",
    label: "Nutricionistas",
    description: "Acompanhe evoluções com anotações e horários claros para cada paciente.",
  },
  {
    id: "dentistas",
    label: "Dentistas",
    description: "Procedimentos, revisões e confirmações sem perder o ritmo do consultório.",
  },
  {
    id: "outros",
    label: "Outros",
    description: "Fisioterapeutas, fonoaudiólogos e demais especialidades com a mesma leveza.",
  },
];

const cardActiveClass =
  "bg-accent border-accent text-accent-foreground shadow-elevated scale-[1.02] md:scale-[1.03]";
const cardIdleClass =
  "bg-card border-border md:hover:border-accent md:hover:bg-accent md:hover:text-accent-foreground md:hover:shadow-elevated md:hover:scale-[1.02] md:hover:-translate-y-0.5";

const descriptionActiveClass = "text-accent-foreground/90 opacity-100 max-h-28";
const descriptionIdleClass =
  "text-muted-foreground opacity-0 max-h-0 overflow-hidden md:group-hover:text-accent-foreground/90 md:group-hover:opacity-100 md:group-hover:max-h-28";

export function SpecialtiesShowcase() {
  const [mobileActiveId, setMobileActiveId] = useState<string | null>(null);

  return (
    <section className="pb-14 md:pb-20">
      <div className="container">
        <Reveal index={4}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
            {SPECIALTIES.map((item) => {
              const isMobileActive = mobileActiveId === item.id;

              return (
                <div
                  key={item.id}
                  onClick={() => setMobileActiveId((current) => (current === item.id ? null : item.id))}
                  className={cn(
                    "group relative rounded-2xl border p-4 md:p-5 min-h-[11rem] md:min-h-[13rem] flex flex-col transition-all duration-300 ease-out cursor-default",
                    isMobileActive ? cardActiveClass : cardIdleClass,
                  )}
                >
                  <p className="font-display font-bold text-sm md:text-base">{item.label}</p>
                  <p
                    className={cn(
                      "mt-auto pt-4 text-xs leading-relaxed transition-all duration-300",
                      isMobileActive ? descriptionActiveClass : descriptionIdleClass,
                    )}
                  >
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
