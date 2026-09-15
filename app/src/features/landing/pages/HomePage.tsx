import { LandingHero } from "@/features/landing/components/LandingHero";
import { LandingAudienceSection } from "@/features/landing/components/LandingAudienceSection";
import { FeaturesShowcase } from "@/features/landing/components/FeaturesShowcase";
import { HowItWorksSection } from "@/features/landing/components/HowItWorksSection";
import { QuerMaisCtaSection } from "@/features/landing/components/QuerMaisCtaSection";
import { SocialProofSection } from "@/features/landing/components/SocialProofSection";
import { LandingFaqSection } from "@/features/landing/components/LandingFaqSection";
import LandingFooter from "@/features/landing/components/LandingFooter";
import { LandingWhatsAppFab } from "@/features/landing/components/LandingWhatsAppFab";

const HomePage = () => {
  return (
    <>
      <main>
        <LandingHero />
        <LandingAudienceSection />
        <FeaturesShowcase />
        <HowItWorksSection />
        <QuerMaisCtaSection />
        <SocialProofSection />
        <LandingFaqSection />
      </main>
      <LandingFooter />
      <LandingWhatsAppFab />
    </>
  );
};

export default HomePage;
