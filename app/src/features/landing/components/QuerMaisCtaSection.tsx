import { Reveal } from "@/components/layout/PageReveal";
import { Button } from "@/components/ui/button";
import { QUER_MAIS_CTA } from "@/features/landing/content/landingContent";
import { LandingSection } from "@/features/landing/components/LandingSection";
import { LandingPrimaryCta } from "@/features/landing/components/LandingPrimaryCta";
import { LandingWhatsAppIcon } from "@/features/landing/components/LandingWhatsAppIcon";
import { buildLandingSupportWhatsAppUrl } from "@/lib/supportWhatsApp";

export function QuerMaisCtaSection() {
  const whatsAppUrl = buildLandingSupportWhatsAppUrl();

  return (
    <LandingSection
      id="funcionalidades-chamada"
      className="flex flex-col py-0 pt-6 pb-[18svh] md:py-0 md:pt-8 md:pb-[22svh]"
    >
      <Reveal index={0}>
        <div className="mx-auto w-full max-w-xl px-4 text-center sm:px-6">
          <h2 className="font-display text-2xl font-semibold leading-tight tracking-tight text-balance text-foreground sm:text-3xl md:text-4xl">
            {QUER_MAIS_CTA.headline}
          </h2>
          <LandingPrimaryCta className="mt-5 justify-center sm:mt-6" />

          <div className="mt-10 border-t border-border/70 pt-10 sm:mt-12 sm:pt-12">
            <p className="text-lg font-medium text-foreground sm:text-xl">{QUER_MAIS_CTA.ouLabel}</p>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              {QUER_MAIS_CTA.whatsAppLead}
            </p>
            <Button
              asChild
              className="mt-5 h-12 rounded-lg border-0 bg-[#25D366] px-8 text-base font-medium text-white hover:bg-[#20bd5a]"
            >
              <a
                href={whatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center"
              >
                  <LandingWhatsAppIcon className="mr-2 h-5 w-5 shrink-0" />
                {QUER_MAIS_CTA.whatsAppButton}
              </a>
            </Button>
          </div>
        </div>
      </Reveal>
    </LandingSection>
  );
}
