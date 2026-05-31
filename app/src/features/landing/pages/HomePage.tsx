import { useEffect } from "react";
import Hero from "@/features/landing/components/Hero";
import VideoDemo from "@/features/landing/components/VideoDemo";
import HowItWorks from "@/features/landing/components/HowItWorks";
import Benefits from "@/features/landing/components/Benefits";
import LandingFooter from "@/features/landing/components/LandingFooter";
import { PageReveal } from "@/components/layout/PageReveal";

const HomePage = () => {
  useEffect(() => {
    document.title = "Sentinela Agendamentos — Teste agora 14 dias grátis";
  }, []);

  return (
    <PageReveal>
      <Hero />
      <VideoDemo />
      <HowItWorks />
      <Benefits />
      <LandingFooter />
    </PageReveal>
  );
};

export default HomePage;
