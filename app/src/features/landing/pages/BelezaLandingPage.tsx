import { LandingPageContentProvider } from "@/features/landing/context/LandingPageContentContext";
import { BELEZA_LANDING_PAGE_CONTENT } from "@/features/landing/content/belezaLandingContent";
import { GenericLandingMain } from "@/features/landing/components/GenericLandingMain";

export default function BelezaLandingPage() {
  return (
    <LandingPageContentProvider value={BELEZA_LANDING_PAGE_CONTENT}>
      <GenericLandingMain />
    </LandingPageContentProvider>
  );
}
