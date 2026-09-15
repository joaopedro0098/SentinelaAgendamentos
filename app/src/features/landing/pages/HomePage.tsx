import { LandingHero } from "@/features/landing/components/LandingHero";
import { LandingAudienceSection } from "@/features/landing/components/LandingAudienceSection";
import { FeaturesShowcase } from "@/features/landing/components/FeaturesShowcase";
import { HowItWorksSection } from "@/features/landing/components/HowItWorksSection";
import { SocialProofSection } from "@/features/landing/components/SocialProofSection";
import { LandingFaqSection } from "@/features/landing/components/LandingFaqSection";
import { LandingCta } from "@/features/landing/components/LandingCta";
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
        <SocialProofSection />
        <LandingFaqSection />
        <LandingCta />
      </main>
      <LandingFooter />
      <LandingWhatsAppFab />
    </>
  );
};

export default HomePage;
