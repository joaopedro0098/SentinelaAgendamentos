/** Valores persistidos em barbershops.professional_specialty e query ?especialidade= */

export const PROFESSIONAL_SPECIALTY_QUERY_PARAM = "especialidade" as const;

export const HEALTH_PROFESSIONAL_SPECIALTIES = [
  "dentista",
  "psicologo",
  "nutricionista",
  "medico",
] as const;

export const BEAUTY_PROFESSIONAL_SPECIALTIES = ["salao_beleza", "barbearia"] as const;

export const PROFESSIONAL_SPECIALTIES = [
  ...HEALTH_PROFESSIONAL_SPECIALTIES,
  ...BEAUTY_PROFESSIONAL_SPECIALTIES,
] as const;

export type HealthProfessionalSpecialty = (typeof HEALTH_PROFESSIONAL_SPECIALTIES)[number];
export type BeautyProfessionalSpecialty = (typeof BEAUTY_PROFESSIONAL_SPECIALTIES)[number];
export type ProfessionalSpecialty = (typeof PROFESSIONAL_SPECIALTIES)[number];

export const PROFESSIONAL_SPECIALTY_LABELS: Record<ProfessionalSpecialty, string> = {
  dentista: "Dentista",
  psicologo: "Psicólogo(a)",
  nutricionista: "Nutricionista",
  medico: "Médico(a)",
  salao_beleza: "Salão de beleza",
  barbearia: "Barbearia",
};

export function isBeautyProfessionalSpecialty(
  value: ProfessionalSpecialty,
): value is BeautyProfessionalSpecialty {
  return (BEAUTY_PROFESSIONAL_SPECIALTIES as readonly string[]).includes(value);
}

export function isHealthProfessionalSpecialty(
  value: ProfessionalSpecialty,
): value is HealthProfessionalSpecialty {
  return (HEALTH_PROFESSIONAL_SPECIALTIES as readonly string[]).includes(value);
}

export function isProfessionalSpecialty(value: string): value is ProfessionalSpecialty {
  return (PROFESSIONAL_SPECIALTIES as readonly string[]).includes(value);
}

export function parseProfessionalSpecialtyFromQuery(
  raw: string | null | undefined,
): ProfessionalSpecialty | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  return isProfessionalSpecialty(trimmed) ? trimmed : null;
}

/** Opções visíveis no cadastro conforme origem (?especialidade= da landing). */
export function signupSpecialtyOptionsForQuerySpecialty(
  specialty: ProfessionalSpecialty | null,
): readonly ProfessionalSpecialty[] {
  if (specialty && isBeautyProfessionalSpecialty(specialty)) {
    return BEAUTY_PROFESSIONAL_SPECIALTIES;
  }
  if (specialty && isHealthProfessionalSpecialty(specialty)) {
    return HEALTH_PROFESSIONAL_SPECIALTIES;
  }
  return HEALTH_PROFESSIONAL_SPECIALTIES;
}
