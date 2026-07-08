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
    description:
      "Sessões recorrentes na agenda, ficha do paciente com anotações e link para marcar horário online.",
  },
  {
    id: "medicos",
    label: "Médicos",
    description:
      "Consultas, retornos e encaixes no painel — com equipe, serviços e link para o paciente agendar sozinho.",
  },
  {
    id: "nutricionistas",
    label: "Nutricionistas",
    description:
      "Acompanhe cada paciente com anotações, retornos programados e horários organizados em um só lugar.",
  },
  {
    id: "dentistas",
    label: "Dentistas",
    description:
      "Procedimentos e revisões na agenda, com serviços e duração definidos para cada tipo de atendimento.",
  },
];

export function SpecialtiesShowcase() {
  return (
    <section className="pb-14 md:pb-20">
      <div className="container">
        <Reveal index={4}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {SPECIALTIES.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "group relative rounded-2xl border p-4 md:p-5 min-h-[11rem] md:min-h-[13rem] flex flex-col transition-all duration-300 ease-out cursor-default",
                  "bg-card border-border",
                  "md:hover:border-accent md:hover:bg-accent md:hover:text-accent-foreground md:hover:shadow-elevated md:hover:scale-[1.02] md:hover:-translate-y-0.5",
                )}
              >
                <p className="font-display font-bold text-sm md:text-lg">{item.label}</p>
                <p
                  className={cn(
                    "mt-2 md:mt-3 text-sm md:text-base leading-relaxed transition-all duration-300",
                    "opacity-0 max-h-0 overflow-hidden",
                    "md:group-hover:opacity-100 md:group-hover:max-h-48 md:group-hover:text-accent-foreground/90",
                  )}
                >
                  {item.description}
                </p>
                <div className="flex-1 min-h-0" aria-hidden />
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
