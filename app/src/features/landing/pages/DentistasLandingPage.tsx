import { dentistasLandingConfig } from "@/features/landing/content/niche/dentistas.config";
import { NicheLandingTemplate } from "@/features/landing/templates/NicheLandingTemplate";

export default function DentistasLandingPage() {
  return <NicheLandingTemplate config={dentistasLandingConfig} />;
}
