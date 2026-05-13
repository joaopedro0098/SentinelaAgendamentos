import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import VideoDemo from "@/components/landing/VideoDemo";
import HowItWorks from "@/components/landing/HowItWorks";
import Benefits from "@/components/landing/Benefits";
import LandingFooter from "@/components/landing/LandingFooter";

const Index = () => {
  return (
    <main className="min-h-screen bg-background text-foreground overflow-x-hidden flex flex-col">
      <Navbar />
      <Hero />
      <VideoDemo />
      <HowItWorks />
      <Benefits />
      <LandingFooter />
    </main>
  );
};

export default Index;
