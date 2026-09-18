import { LandingSection } from "@/features/landing/components/LandingSection";
import { LandingSectionHeader } from "@/features/landing/components/LandingSectionHeader";

const QUER_MAIS_FEATURES = [
  {
    illustrationSrc: "/landing-quer-mais-revenue.png",
    titleLines: ["Relatório de faturamento", "e comissionamento"],
  },
  {
    illustrationSrc: "/landing-quer-mais-support.png",
    titleLines: ["Suporte ágil e", "humanizado por", "WhatsApp"],
  },
  {
    illustrationSrc: "/landing-quer-mais-schedule-panel.png",
    titleLines: ["Painel dinâmico", "de agendamentos"],
  },
  {
    illustrationSrc: "/landing-quer-mais-collaborators.png",
    titleLines: ["Adicione colaboradores", "e os gerencie"],
  },
] as const;

const TITLE_CLASS =
  "m-0 mt-3 max-w-[11rem] text-center text-base font-semibold leading-snug text-foreground sm:max-w-[12rem] sm:text-[17px] md:max-w-[13rem] md:text-lg";

type QuerMaisFeaturePairProps = {
  illustrationSrc: string;
  titleLines: readonly string[];
};

function QuerMaisFeaturePair({ illustrationSrc, titleLines }: QuerMaisFeaturePairProps) {
  return (
    <div className="flex w-full max-w-[15rem] flex-col items-center justify-self-center sm:max-w-none">
      <img
        src={illustrationSrc}
        alt=""
        className="block w-40 shrink-0 object-contain object-center select-none sm:w-44 md:w-52 lg:w-56"
        decoding="async"
      />
      <h3 className={TITLE_CLASS}>
        {titleLines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </h3>
    </div>
  );
}

export function FeaturesShowcase() {
  return (
    <LandingSection id="funcionalidades" className="pt-10 pb-10 md:pt-12 md:pb-14">
      <LandingSectionHeader
        className="mb-3 md:mb-4"
        title="Quer mais?"
        description="Um painel claro para quem atende pacientes — não um sistema genérico que exige treinamento."
      />

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 xl:max-w-7xl">
        <div className="mt-1 grid grid-cols-1 justify-items-center gap-10 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-10 md:mt-1.5 lg:grid-cols-4 lg:gap-x-5 xl:gap-x-8">
          {QUER_MAIS_FEATURES.map((feature) => (
            <QuerMaisFeaturePair
              key={feature.illustrationSrc}
              illustrationSrc={feature.illustrationSrc}
              titleLines={feature.titleLines}
            />
          ))}
        </div>
      </div>
    </LandingSection>
  );
}
