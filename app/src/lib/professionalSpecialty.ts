/** Valores persistidos em barbershops.professional_specialty e query ?especialidade= */

export const PROFESSIONAL_SPECIALTY_QUERY_PARAM = "especialidade" as const;

export const PROFESSIONAL_SPECIALTIES = [
  "dentista",
  "psicologo",
  "nutricionista",
  "medico",
] as const;

export type ProfessionalSpecialty = (typeof PROFESSIONAL_SPECIALTIES)[number];

export const PROFESSIONAL_SPECIALTY_LABELS: Record<ProfessionalSpecialty, string> = {
  dentista: "Dentista",
  psicologo: "Psicólogo(a)",
  nutricionista: "Nutricionista",
  medico: "Médico(a)",
};

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
