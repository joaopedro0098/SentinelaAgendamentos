import type { ProfessionalSpecialty } from "@/lib/professionalSpecialty";

/** Um único valor no localStorage — sem histórico. */
export const ADMIN_NICHE_PREVIEW_STORAGE_KEY = "sentinela:admin-niche-preview";

export type AdminNichePreviewId =
  | "beleza"
  | "barbearia"
  | "psicologia"
  | "medico"
  | "nutricao"
  | "odontologia";

export type AdminNichePreviewOption = {
  id: AdminNichePreviewId;
  label: string;
  specialty: ProfessionalSpecialty;
};

export const ADMIN_NICHE_PREVIEW_OPTIONS: readonly AdminNichePreviewOption[] = [
  { id: "beleza", label: "Beleza", specialty: "salao_beleza" },
  { id: "barbearia", label: "Barbearia", specialty: "barbearia" },
  { id: "psicologia", label: "Psicologia", specialty: "psicologo" },
  { id: "medico", label: "Médico", specialty: "medico" },
  { id: "nutricao", label: "Nutrição", specialty: "nutricionista" },
  { id: "odontologia", label: "Odontologia", specialty: "dentista" },
] as const;

const ADMIN_NICHE_PREVIEW_IDS = new Set<AdminNichePreviewId>(
  ADMIN_NICHE_PREVIEW_OPTIONS.map((option) => option.id),
);

export const DEFAULT_ADMIN_NICHE_PREVIEW_ID: AdminNichePreviewId = "medico";

export function isAdminNichePreviewId(value: string): value is AdminNichePreviewId {
  return ADMIN_NICHE_PREVIEW_IDS.has(value as AdminNichePreviewId);
}

export function adminNichePreviewOptionById(id: AdminNichePreviewId): AdminNichePreviewOption {
  const found = ADMIN_NICHE_PREVIEW_OPTIONS.find((option) => option.id === id);
  return found ?? ADMIN_NICHE_PREVIEW_OPTIONS[3];
}

export function readAdminNichePreviewId(): AdminNichePreviewId {
  try {
    const raw = localStorage.getItem(ADMIN_NICHE_PREVIEW_STORAGE_KEY)?.trim();
    if (raw && isAdminNichePreviewId(raw)) {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_ADMIN_NICHE_PREVIEW_ID;
}

export function writeAdminNichePreviewId(id: AdminNichePreviewId): void {
  try {
    localStorage.setItem(ADMIN_NICHE_PREVIEW_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}
