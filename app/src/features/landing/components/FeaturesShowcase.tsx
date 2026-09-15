import { Reveal } from "@/components/layout/PageReveal";
import { LandingSection } from "@/features/landing/components/LandingSection";
import { LandingSectionHeader } from "@/features/landing/components/LandingSectionHeader";
import { LandingPrimaryCta } from "@/features/landing/components/LandingPrimaryCta";

/** Reserva a mesma área do grid 2×3 de cards removidos (altura dos blocos anteriores). */
const FEATURE_GRID_PLACEHOLDER_COUNT = 6;

export function FeaturesShowcase() {
  return (
    <LandingSection id="funcionalidades" className="pt-10 pb-16 md:pt-12 md:pb-24">
      <LandingSectionHeader
        title="Quer mais?"
        description="Um painel claro para quem atende pacientes — não um sistema genérico que exige treinamento."
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 max-w-5xl mx-auto">
        {Array.from({ length: FEATURE_GRID_PLACEHOLDER_COUNT }, (_, i) => (
          <div key={i} className="min-h-[11.75rem] md:min-h-[12.75rem]" aria-hidden />
        ))}
      </div>

      <Reveal index={0}>
        <LandingPrimaryCta className="mt-10 justify-center" />
      </Reveal>
    </LandingSection>
  );
}
