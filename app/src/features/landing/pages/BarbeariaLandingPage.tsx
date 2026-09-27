import { LandingPageContentProvider } from "@/features/landing/context/LandingPageContentContext";
import { GENERIC_LANDING_PAGE_CONTENT } from "@/features/landing/content/genericLandingConfig";
import { buildSignupHref } from "@/features/landing/content/niche/shared";
import { GenericLandingMain } from "@/features/landing/components/GenericLandingMain";

const BARBEARIA_LANDING_CONTENT = {
  ...GENERIC_LANDING_PAGE_CONTENT,
  primarySignupHref: buildSignupHref("barbearia"),
};

export default function BarbeariaLandingPage() {
  return (
    <LandingPageContentProvider value={BARBEARIA_LANDING_CONTENT}>
      <GenericLandingMain />
    </LandingPageContentProvider>
  );
}
