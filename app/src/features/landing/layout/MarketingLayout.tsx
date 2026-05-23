import Navbar from "@/features/landing/components/Navbar";
import { AnimatedMarketingOutlet } from "@/components/layout/PageTransition";

export function MarketingLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden flex flex-col">
      <Navbar />
      <AnimatedMarketingOutlet />
    </div>
  );
}
