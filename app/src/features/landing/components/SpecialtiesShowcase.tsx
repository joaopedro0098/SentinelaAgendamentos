import { useState } from "react";
import { Reveal } from "@/components/layout/PageReveal";
import { cn } from "@/lib/utils";

type Specialty = {
  id: string;
  label: string;
  description: string;
  icon: "ring" | "dash" | "dot" | "dashed" | "grid";
};

const SPECIALTIES: Specialty[] = [
  {
    id: "psicologos",
    label: "Psicólogos",
    description: "Sessões recorrentes, lembretes discretos e agenda organizada para o cuidado contínuo.",
    icon: "ring",
  },
  {
    id: "medicos",
    label: "Médicos",
    description: "Consultas, retornos e encaixes em um fluxo simples para você e sua equipe.",
    icon: "dash",
  },
  {
    id: "nutricionistas",
    label: "Nutricionistas",
    description: "Acompanhe evoluções com anotações e horários claros para cada paciente.",
    icon: "dot",
  },
  {
    id: "dentistas",
    label: "Dentistas",
    description: "Procedimentos, revisões e confirmações sem perder o ritmo do consultório.",
    icon: "dashed",
  },
  {
    id: "outros",
    label: "Outros",
    description: "Fisioterapeutas, fonoaudiólogos e demais especialidades com a mesma leveza.",
    icon: "grid",
  },
];

function SpecialtyIcon({ type, active }: { type: Specialty["icon"]; active: boolean }) {
  const box = cn(
    "w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-300",
    active ? "bg-primary-foreground/15" : "bg-primary/10",
  );

  if (type === "ring") {
    return (
      <div className={box}>
        <span className={cn("w-4 h-4 rounded-full border-2", active ? "border-primary-foreground" : "border-primary")} />
      </div>
    );
  }
  if (type === "dash") {
    return (
      <div className={box}>
        <span className={cn("w-4 h-0.5 rounded-full", active ? "bg-primary-foreground" : "bg-primary")} />
      </div>
    );
  }
  if (type === "dot") {
    return (
      <div className={box}>
        <span className={cn("w-3 h-3 rounded-full", active ? "bg-primary-foreground" : "bg-primary")} />
      </div>
    );
  }
  if (type === "dashed") {
    return (
      <div className={box}>
        <span
          className={cn(
            "w-4 h-4 rounded-full border-2 border-dashed",
            active ? "border-primary-foreground" : "border-primary",
          )}
        />
      </div>
    );
  }
  return (
    <div className={box}>
      <span className="grid grid-cols-2 gap-0.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <span key={i} className={cn("w-1.5 h-1.5 rounded-full", active ? "bg-primary-foreground" : "bg-primary")} />
        ))}
      </span>
    </div>
  );
}

export function SpecialtiesShowcase() {
  const [activeId, setActiveId] = useState("nutricionistas");
  const active = SPECIALTIES.find((s) => s.id === activeId) ?? SPECIALTIES[2];

  return (
    <section className="pb-14 md:pb-20">
      <div className="container">
        <Reveal index={4}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
            {SPECIALTIES.map((item) => {
              const isActive = item.id === activeId;
              return (
                <div
                  key={item.id}
                  onMouseEnter={() => setActiveId(item.id)}
                  className={cn(
                    "group relative rounded-2xl border p-4 md:p-5 min-h-[11rem] md:min-h-[13rem] flex flex-col justify-between transition-all duration-300 ease-out cursor-default",
                    isActive
                      ? "bg-primary border-primary text-primary-foreground shadow-elevated scale-[1.02] md:scale-[1.03]"
                      : "bg-card border-border hover:border-primary/30 hover:-translate-y-0.5",
                  )}
                >
                  <SpecialtyIcon type={item.icon} active={isActive} />
                  <div>
                    <p className="font-display font-bold text-sm md:text-base">{item.label}</p>
                    <p
                      className={cn(
                        "mt-2 text-xs leading-relaxed transition-all duration-300",
                        isActive
                          ? "text-primary-foreground/90 opacity-100 max-h-28"
                          : "text-muted-foreground opacity-0 max-h-0 overflow-hidden",
                      )}
                    >
                      {item.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>

        <p className="md:hidden mt-4 text-sm text-muted-foreground text-center px-2 transition-opacity duration-300">
          {active.description}
        </p>
      </div>
    </section>
  );
}
