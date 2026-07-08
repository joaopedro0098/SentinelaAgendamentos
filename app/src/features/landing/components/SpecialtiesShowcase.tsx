import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Reveal } from "@/components/layout/PageReveal";
import { useMediaMdUp } from "@/hooks/useMediaMdUp";
import { cn } from "@/lib/utils";

type Specialty = {
  id: string;
  label: string;
  iconSrc: string;
  description: string;
};

const SPECIALTIES: Specialty[] = [
  {
    id: "psicologos",
    label: "Psicólogos",
    iconSrc: "/landing-specialty-psicologos.png",
    description:
      "Sessões recorrentes na agenda, ficha do paciente com anotações e link para marcar horário online.",
  },
  {
    id: "medicos",
    label: "Médicos",
    iconSrc: "/landing-specialty-medicos.png",
    description:
      "Consultas, retornos e encaixes no painel — com equipe, serviços e link para o paciente agendar sozinho.",
  },
  {
    id: "nutricionistas",
    label: "Nutricionistas",
    iconSrc: "/landing-specialty-nutricionistas.png",
    description:
      "Acompanhe cada paciente com anotações, retornos programados e horários organizados em um só lugar.",
  },
  {
    id: "dentistas",
    label: "Dentistas",
    iconSrc: "/landing-specialty-dentistas.png",
    description:
      "Procedimentos e revisões na agenda, com serviços e duração definidos para cada tipo de atendimento.",
  },
];

function SpecialtyTitle({ label, iconSrc, className }: { label: string; iconSrc: string; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      <img
        src={iconSrc}
        alt=""
        aria-hidden
        className="h-7 w-7 shrink-0 object-contain md:h-8 md:w-8"
        loading="lazy"
        decoding="async"
      />
      <span className="font-display font-bold leading-tight">{label}</span>
    </span>
  );
}

export function SpecialtiesShowcase() {
  const isMdUp = useMediaMdUp();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (isMdUp) setActiveId(null);
  }, [isMdUp]);

  useEffect(() => {
    if (isMdUp) return;

    function handlePointerDown(event: PointerEvent) {
      if (!sectionRef.current?.contains(event.target as Node)) {
        setActiveId(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isMdUp]);

  function handleCardClick(id: string) {
    if (isMdUp) return;
    setActiveId((current) => (current === id ? null : id));
  }

  return (
    <section ref={sectionRef} className="pb-14 md:pb-20">
      <div className="container">
        <Reveal index={4}>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 md:gap-4">
            {SPECIALTIES.map((item) => {
              const isOpen = !isMdUp && activeId === item.id;

              return (
                <div
                  key={item.id}
                  className={cn(
                    "overflow-hidden rounded-2xl border border-primary/30 bg-primary text-primary-foreground transition-all duration-300 ease-out",
                    "md:hover:scale-[1.03] md:hover:-translate-y-0.5 md:hover:shadow-elevated",
                  )}
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => handleCardClick(item.id)}
                    className="flex w-full items-center justify-between gap-3 p-4 text-left md:hidden"
                  >
                    <SpecialtyTitle label={item.label} iconSrc={item.iconSrc} className="text-sm" />
                    <ChevronDown
                      aria-hidden
                      className={cn("h-4 w-4 shrink-0 transition-transform duration-300", isOpen && "rotate-180")}
                    />
                  </button>

                  <div className="hidden md:block md:p-5 md:pb-0">
                    <SpecialtyTitle label={item.label} iconSrc={item.iconSrc} className="text-lg" />
                  </div>

                  <div
                    className={cn(
                      "grid transition-[grid-template-rows] duration-300 ease-out md:grid-rows-[1fr]",
                      isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                    )}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <p className="px-4 pb-4 text-sm leading-relaxed text-primary-foreground/90 md:px-5 md:pb-5 md:pt-3 md:text-base">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
