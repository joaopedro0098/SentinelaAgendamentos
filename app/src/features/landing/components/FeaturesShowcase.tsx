import { Reveal } from "@/components/layout/PageReveal";
import { LandingSection } from "@/features/landing/components/LandingSection";
import { LandingSectionHeader } from "@/features/landing/components/LandingSectionHeader";
import { LandingPrimaryCta } from "@/features/landing/components/LandingPrimaryCta";

const QUER_MAIS_ILLUSTRATION = "/landing-quer-mais-revenue.png";

/** Reserva a mesma área do grid 2×3 de cards removidos (altura dos blocos anteriores). */
const FEATURE_GRID_PLACEHOLDER_COUNT = 6;

export function FeaturesShowcase() {
  return (
    <LandingSection id="funcionalidades" className="pt-10 pb-16 md:pt-12 md:pb-24">
      <LandingSectionHeader
        className="mb-3 md:mb-4"
        title="Quer mais?"
        description="Um painel claro para quem atende pacientes — não um sistema genérico que exige treinamento."
      />

      <div className="mx-auto w-full max-w-5xl">
        <div className="-ml-12 mt-1 grid w-fit max-w-full grid-cols-[auto_minmax(0,max-content)] items-start gap-x-2.5 sm:-ml-16 sm:gap-x-3 md:-ml-24 md:mt-1.5 md:gap-x-3.5 lg:-ml-28">
          <img
            src={QUER_MAIS_ILLUSTRATION}
            alt=""
            className="col-start-1 row-start-1 block w-40 shrink-0 object-contain object-left-top select-none sm:w-44 md:w-52 lg:w-56"
            decoding="async"
          />
          <h3 className="col-start-2 row-start-1 m-0 max-w-[11rem] self-start pt-[15px] text-left text-base font-semibold leading-none text-foreground sm:max-w-[12rem] sm:pt-[17px] sm:text-[17px] md:max-w-[13rem] md:pt-[19px] md:text-lg">
            <span className="block">Relatório de faturamento</span>
            <span className="block">e comissionamento</span>
          </h3>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {Array.from({ length: FEATURE_GRID_PLACEHOLDER_COUNT }, (_, i) => (
            <div key={i} className="min-h-[11.75rem] md:min-h-[12.75rem]" aria-hidden />
          ))}
        </div>

        <Reveal index={0}>
          <LandingPrimaryCta className="mt-10 justify-center" />
        </Reveal>
      </div>
    </LandingSection>
  );
}
