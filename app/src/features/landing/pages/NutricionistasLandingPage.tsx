import { nutricionistasLandingConfig } from "@/features/landing/content/niche/nutricionistas.config";
import { NicheLandingTemplate } from "@/features/landing/templates/NicheLandingTemplate";

export default function NutricionistasLandingPage() {
  return <NicheLandingTemplate config={nutricionistasLandingConfig} />;
}
