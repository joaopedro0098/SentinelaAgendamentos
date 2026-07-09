import LandingFooter from "@/features/landing/components/LandingFooter";
import { LandingPlansSection } from "@/features/landing/components/LandingPlansSection";
import { LandingFaqSection } from "@/features/landing/components/LandingFaqSection";

const Planos = () => {
  return (
    <>
      <div className="pt-20 md:pt-24">
        <LandingPlansSection />
      </div>
      <LandingFaqSection />
      <LandingFooter />
    </>
  );
};

export default Planos;
