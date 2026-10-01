import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ADMIN_NICHE_PREVIEW_STORAGE_KEY,
  adminNichePreviewOptionById,
  isAdminNichePreviewId,
  readAdminNichePreviewId,
  writeAdminNichePreviewId,
  type AdminNichePreviewId,
} from "@/features/dashboard/lib/adminNichePreview";
import type { ProfessionalSpecialty } from "@/lib/professionalSpecialty";

type AdminNichePreviewContextValue =
  | {
      enabled: true;
      nicheId: AdminNichePreviewId;
      label: string;
      specialty: ProfessionalSpecialty;
      setNicheId: (id: AdminNichePreviewId) => void;
    }
  | {
      enabled: false;
      nicheId: null;
      label: null;
      specialty: null;
      setNicheId: (id: AdminNichePreviewId) => void;
    };

const AdminNichePreviewContext = createContext<AdminNichePreviewContextValue>({
  enabled: false,
  nicheId: null,
  label: null,
  specialty: null,
  setNicheId: () => {},
});

export function AdminNichePreviewProvider({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) {
  const [nicheId, setNicheIdState] = useState<AdminNichePreviewId>(() => readAdminNichePreviewId());

  useEffect(() => {
    if (!enabled) return;
    setNicheIdState(readAdminNichePreviewId());
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ADMIN_NICHE_PREVIEW_STORAGE_KEY) return;
      const next = event.newValue?.trim();
      if (next && isAdminNichePreviewId(next)) {
        setNicheIdState(next);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [enabled]);

  const setNicheId = useCallback(
    (id: AdminNichePreviewId) => {
      setNicheIdState(id);
      if (enabled) {
        writeAdminNichePreviewId(id);
      }
    },
    [enabled],
  );

  const value = useMemo((): AdminNichePreviewContextValue => {
    if (!enabled) {
      return {
        enabled: false,
        nicheId: null,
        label: null,
        specialty: null,
        setNicheId,
      };
    }
    const option = adminNichePreviewOptionById(nicheId);
    return {
      enabled: true,
      nicheId,
      label: option.label,
      specialty: option.specialty,
      setNicheId,
    };
  }, [enabled, nicheId, setNicheId]);

  return (
    <AdminNichePreviewContext.Provider value={value}>{children}</AdminNichePreviewContext.Provider>
  );
}

export function useAdminNichePreview(): AdminNichePreviewContextValue {
  return useContext(AdminNichePreviewContext);
}
