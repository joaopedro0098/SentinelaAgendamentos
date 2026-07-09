import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Reveal } from "@/components/layout/PageReveal";
import { SPECIALTIES } from "@/features/landing/content/landingContent";
import { LandingSection } from "@/features/landing/components/LandingSection";
import { LandingSectionHeader } from "@/features/landing/components/LandingSectionHeader";
import { useMediaMdUp } from "@/hooks/useMediaMdUp";
import { cn } from "@/lib/utils";

function SpecialtyTitle({ label, iconSrc, className }: { label: string; iconSrc: string; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      <img
        src={iconSrc}
        alt={`Ícone ${label}`}
        className="h-8 w-8 shrink-0 object-contain"
        loading="lazy"
        decoding="async"
        width={32}
        height={32}
      />
      <span className="font-display font-semibold leading-tight">{label}</span>
    </span>
  );
}

export function SpecialtiesShowcase() {
  const isMdUp = useMediaMdUp();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);

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
    <LandingSection id="especialidades">
      <LandingSectionHeader
        eyebrow="Para sua área"
        title="Feito para quem cuida de pessoas"
        description="Psicólogos, médicos, nutricionistas, dentistas e outras especialidades com atendimento por hora marcada."
        align="center"
      />

      <div ref={sectionRef}>
        <Reveal index={0}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
            {SPECIALTIES.map((item) => {
              const isOpen = !isMdUp && activeId === item.id;

              return (
                <article
                  key={item.id}
                  className={cn(
                    "overflow-hidden rounded-2xl border border-border/70 bg-card shadow-soft transition-shadow",
                    "md:hover:shadow-elevated md:hover:border-primary/20",
                  )}
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => handleCardClick(item.id)}
                    className="flex w-full items-center justify-between gap-3 p-4 text-left md:cursor-default"
                  >
                    <SpecialtyTitle label={item.label} iconSrc={item.iconSrc} className="text-sm md:text-base" />
                    <ChevronDown
                      aria-hidden
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground md:hidden transition-transform duration-300",
                        isOpen && "rotate-180",
                      )}
                    />
                  </button>

                  <div
                    className={cn(
                      "grid transition-[grid-template-rows] duration-300 ease-out md:grid-rows-[1fr]",
                      isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                    )}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <p className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground md:px-4 md:pb-5 md:-mt-1">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </Reveal>
      </div>
    </LandingSection>
  );
}
