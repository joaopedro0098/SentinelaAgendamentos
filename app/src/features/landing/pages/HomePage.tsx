import Navbar from "@/features/landing/components/Navbar";
import Hero from "@/features/landing/components/Hero";
import VideoDemo from "@/features/landing/components/VideoDemo";
import HowItWorks from "@/features/landing/components/HowItWorks";
import Benefits from "@/features/landing/components/Benefits";
import LandingFooter from "@/features/landing/components/LandingFooter";

const HomePage = () => {
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

export default HomePage;
