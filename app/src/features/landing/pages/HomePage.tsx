import Hero from "@/features/landing/components/Hero";
import VideoDemo from "@/features/landing/components/VideoDemo";
import HowItWorks from "@/features/landing/components/HowItWorks";
import Benefits from "@/features/landing/components/Benefits";
import LandingFooter from "@/features/landing/components/LandingFooter";

const HomePage = () => {
  return (
    <>
      <Hero />
      <VideoDemo />
      <HowItWorks />
      <Benefits />
      <LandingFooter />
    </>
  );
};

export default HomePage;
