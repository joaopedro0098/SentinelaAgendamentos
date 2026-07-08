import { LandingHero } from "@/features/landing/components/LandingHero";
import { SpecialtiesShowcase } from "@/features/landing/components/SpecialtiesShowcase";
import { FeaturesShowcase } from "@/features/landing/components/FeaturesShowcase";
import { LandingCta } from "@/features/landing/components/LandingCta";
import LandingFooter from "@/features/landing/components/LandingFooter";

const HomePage = () => {
  return (
    <>
      <main>
        <LandingHero />
        <SpecialtiesShowcase />
        <FeaturesShowcase />
        <LandingCta />
      </main>
      <LandingFooter />
    </>
  );
};

export default HomePage;
