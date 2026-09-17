import { medicosLandingConfig } from "@/features/landing/content/niche/medicos.config";
import { NicheLandingTemplate } from "@/features/landing/templates/NicheLandingTemplate";

export default function MedicosLandingPage() {
  return <NicheLandingTemplate config={medicosLandingConfig} />;
}
