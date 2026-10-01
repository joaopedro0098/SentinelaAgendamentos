import { useMemo } from "react";
import { useAdminNichePreview } from "@/providers/AdminNichePreviewProvider";
import { useDashboardShopOptional } from "@/providers/DashboardShopProvider";
import { getClienteTerminology, type ClienteTerminology } from "@/lib/clienteTerminology";
import {
  isBeautyProfessionalSpecialty,
  isProfessionalSpecialty,
  type ProfessionalSpecialty,
} from "@/lib/professionalSpecialty";

export function useEffectiveProfessionalSpecialty(): ProfessionalSpecialty | null {
  const shop = useDashboardShopOptional()?.shop ?? null;
  const preview = useAdminNichePreview();

  if (preview.enabled && preview.specialty) {
    return preview.specialty;
  }

  const raw = shop?.professional_specialty;
  if (raw && isProfessionalSpecialty(raw)) {
    return raw;
  }
  return null;
}

export function useClienteTerminology(): ClienteTerminology {
  const specialty = useEffectiveProfessionalSpecialty();
  const isBeauty = specialty != null && isBeautyProfessionalSpecialty(specialty);
  return useMemo(() => getClienteTerminology(isBeauty), [isBeauty]);
}
