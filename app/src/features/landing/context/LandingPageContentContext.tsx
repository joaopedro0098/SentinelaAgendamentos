import { createContext, useContext, type ReactNode } from "react";
import { GENERIC_LANDING_PAGE_CONTENT } from "@/features/landing/content/genericLandingConfig";
import type { LandingPageContent } from "@/features/landing/content/niche/types";

const LandingPageContentContext = createContext<LandingPageContent>(GENERIC_LANDING_PAGE_CONTENT);

export function LandingPageContentProvider({
  value,
  children,
}: {
  value: LandingPageContent;
  children: ReactNode;
}) {
  return (
    <LandingPageContentContext.Provider value={value}>{children}</LandingPageContentContext.Provider>
  );
}

export function useLandingPageContent(): LandingPageContent {
  return useContext(LandingPageContentContext);
}
