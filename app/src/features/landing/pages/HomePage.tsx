import Hero from "@/features/landing/components/Hero";
import { LandingIntro } from "@/features/landing/components/LandingIntro";
import VideoDemo from "@/features/landing/components/VideoDemo";
import HowItWorks from "@/features/landing/components/HowItWorks";
import Benefits from "@/features/landing/components/Benefits";
import LandingFooter from "@/features/landing/components/LandingFooter";
import { PageReveal } from "@/components/layout/PageReveal";

const HomePage = () => {
  return (
    <PageReveal>
      <LandingIntro>
        <Hero />
        <VideoDemo />
      </LandingIntro>
      <HowItWorks />
      <Benefits />
      <LandingFooter />
    </PageReveal>
  );
};

export default HomePage;
