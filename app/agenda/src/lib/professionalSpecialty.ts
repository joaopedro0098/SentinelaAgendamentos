/** Subconjunto usado pela agenda pública (nichos beleza/barbearia). */

export const BEAUTY_PROFESSIONAL_SPECIALTIES = ["salao_beleza", "barbearia"] as const;

export const PROFESSIONAL_SPECIALTIES = [
  "dentista",
  "psicologo",
  "nutricionista",
  "medico",
  ...BEAUTY_PROFESSIONAL_SPECIALTIES,
] as const;

export type ProfessionalSpecialty = (typeof PROFESSIONAL_SPECIALTIES)[number];

export function isProfessionalSpecialty(value: string): value is ProfessionalSpecialty {
  return (PROFESSIONAL_SPECIALTIES as readonly string[]).includes(value);
}

export function isBeautyProfessionalSpecialty(
  value: ProfessionalSpecialty,
): value is (typeof BEAUTY_PROFESSIONAL_SPECIALTIES)[number] {
  return (BEAUTY_PROFESSIONAL_SPECIALTIES as readonly string[]).includes(value);
}
