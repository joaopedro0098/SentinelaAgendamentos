import { LandingHero } from "@/features/landing/components/LandingHero";
import { PainPointsSection } from "@/features/landing/components/PainPointsSection";
import { FeaturesShowcase } from "@/features/landing/components/FeaturesShowcase";
import { HowItWorksSection } from "@/features/landing/components/HowItWorksSection";
import { SpecialtiesShowcase } from "@/features/landing/components/SpecialtiesShowcase";
import { SocialProofSection } from "@/features/landing/components/SocialProofSection";
import { LandingPlansSection } from "@/features/landing/components/LandingPlansSection";
import { LandingFaqSection } from "@/features/landing/components/LandingFaqSection";
import { LandingCta } from "@/features/landing/components/LandingCta";
import LandingFooter from "@/features/landing/components/LandingFooter";

const HomePage = () => {
  return (
    <>
      <main>
        <LandingHero />
        <PainPointsSection />
        <FeaturesShowcase />
        <HowItWorksSection />
        <SpecialtiesShowcase />
        <SocialProofSection />
        <LandingPlansSection variant="preview" />
        <LandingFaqSection />
        <LandingCta />
      </main>
      <LandingFooter />
    </>
  );
};

export default HomePage;
