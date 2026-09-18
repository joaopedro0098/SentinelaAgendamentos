import { dentistasLandingConfig } from "@/features/landing/content/niche/dentistas.config";
import { psicologosLandingConfig } from "@/features/landing/content/niche/psicologos.config";
import { nutricionistasLandingConfig } from "@/features/landing/content/niche/nutricionistas.config";
import { medicosLandingConfig } from "@/features/landing/content/niche/medicos.config";
import type { NicheLandingConfig } from "@/features/landing/content/niche/types";

/** Registro único: novo nicho = config + entrada aqui + rota lazy. */
export const NICHE_LANDING_REGISTRY = [
  dentistasLandingConfig,
  psicologosLandingConfig,
  nutricionistasLandingConfig,
  medicosLandingConfig,
] as const satisfies readonly NicheLandingConfig[];
