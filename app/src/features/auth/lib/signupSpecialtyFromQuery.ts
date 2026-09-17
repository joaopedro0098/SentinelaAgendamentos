import {
  PROFESSIONAL_SPECIALTY_QUERY_PARAM,
  parseProfessionalSpecialtyFromQuery,
  type ProfessionalSpecialty,
} from "@/lib/professionalSpecialty";

export { PROFESSIONAL_SPECIALTY_QUERY_PARAM };

export type SignupSpecialtyQueryState =
  | { status: "absent"; specialty: null }
  | { status: "valid"; specialty: ProfessionalSpecialty }
  | { status: "invalid"; specialty: null; raw: string };

/** Allowlist explícita — query inválida não vira valor no select. */
export function readSignupSpecialtyFromSearchParams(
  params: URLSearchParams,
): SignupSpecialtyQueryState {
  const raw = params.get(PROFESSIONAL_SPECIALTY_QUERY_PARAM);
  if (raw == null || raw.trim() === "") {
    return { status: "absent", specialty: null };
  }
  const specialty = parseProfessionalSpecialtyFromQuery(raw);
  if (specialty) {
    return { status: "valid", specialty };
  }
  return { status: "invalid", specialty: null, raw: raw.trim() };
}
