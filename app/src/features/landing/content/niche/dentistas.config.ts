import { createPlaceholderNicheConfig } from "@/features/landing/content/niche/placeholderNicheConfig";

const base = createPlaceholderNicheConfig({
  path: "/dentistas",
  signupSpecialty: "dentista",
  nicheLabel: "Dentistas",
  illustration: "dentist",
});

export const dentistasLandingConfig = {
  ...base,
  hero: {
    ...base.hero,
    headlineLines: [
      "Menos tempo organizando",
      "agenda. Mais tempo com",
      "seus pacientes",
    ] as const,
  },
};
