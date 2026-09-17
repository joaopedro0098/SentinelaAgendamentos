import { dentistasLandingConfig } from "@/features/landing/content/niche/dentistas.config";
import { psicologosLandingConfig } from "@/features/landing/content/niche/psicologos.config";
import { nutricionistasLandingConfig } from "@/features/landing/content/niche/nutricionistas.config";
import { medicosLandingConfig } from "@/features/landing/content/niche/medicos.config";
import { nicheConfigToLandingContent } from "@/features/landing/content/niche/shared";
import type { NicheLandingConfig, LandingPageContent } from "@/features/landing/content/niche/types";

/** Registro único: novo nicho = config + entrada aqui + rota lazy. */
export const NICHE_LANDING_REGISTRY = [
  dentistasLandingConfig,
  psicologosLandingConfig,
  nutricionistasLandingConfig,
  medicosLandingConfig,
] as const satisfies readonly NicheLandingConfig[];

export type NicheLandingPath = (typeof NICHE_LANDING_REGISTRY)[number]["path"];

const contentByPath = new Map<string, LandingPageContent>(
  NICHE_LANDING_REGISTRY.map((config) => [config.path, nicheConfigToLandingContent(config)]),
);

export function getNicheLandingContent(pathname: string): LandingPageContent | null {
  return contentByPath.get(pathname) ?? null;
}

export function isNicheLandingPath(pathname: string): pathname is NicheLandingPath {
  return contentByPath.has(pathname);
}

export const INDEXABLE_NICHE_LANDING_PATHS: readonly NicheLandingPath[] = NICHE_LANDING_REGISTRY.map(
  (c) => c.path,
);
