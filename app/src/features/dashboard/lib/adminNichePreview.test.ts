import { describe, expect, it, beforeEach } from "vitest";
import {
  ADMIN_NICHE_PREVIEW_STORAGE_KEY,
  readAdminNichePreviewId,
  writeAdminNichePreviewId,
} from "@/features/dashboard/lib/adminNichePreview";

describe("adminNichePreview storage", () => {
  beforeEach(() => {
    localStorage.removeItem(ADMIN_NICHE_PREVIEW_STORAGE_KEY);
  });

  it("persiste só o último nicho (sobrescreve)", () => {
    writeAdminNichePreviewId("beleza");
    expect(readAdminNichePreviewId()).toBe("beleza");
    writeAdminNichePreviewId("odontologia");
    expect(readAdminNichePreviewId()).toBe("odontologia");
    expect(localStorage.getItem(ADMIN_NICHE_PREVIEW_STORAGE_KEY)).toBe("odontologia");
  });

  it("ignora valor inválido no storage", () => {
    localStorage.setItem(ADMIN_NICHE_PREVIEW_STORAGE_KEY, "invalido");
    expect(readAdminNichePreviewId()).toBe("medico");
  });
});
