import { describe, expect, it } from "vitest";
import {
  PACIENTE_DOCUMENTO_ACCEPT,
  validatePacienteDocumentoFile,
} from "@/features/dashboard/lib/pacienteDocumentos";

describe("validatePacienteDocumentoFile", () => {
  it("aceita extensões permitidas", () => {
    const file = new File(["x"], "relatorio.pdf", { type: "application/pdf" });
    expect(validatePacienteDocumentoFile(file)).toEqual({ ok: true });
  });

  it("rejeita extensão não suportada", () => {
    const file = new File(["x"], "virus.exe", { type: "application/octet-stream" });
    const result = validatePacienteDocumentoFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Formato não suportado");
    }
  });

  it("rejeita arquivo acima de 10 MB", () => {
    const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "grande.pdf", {
      type: "application/pdf",
    });
    const result = validatePacienteDocumentoFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("10 MB");
    }
  });

  it("accept inclui formatos solicitados", () => {
    expect(PACIENTE_DOCUMENTO_ACCEPT).toContain(".doc");
    expect(PACIENTE_DOCUMENTO_ACCEPT).toContain(".docx");
    expect(PACIENTE_DOCUMENTO_ACCEPT).toContain(".pdf");
    expect(PACIENTE_DOCUMENTO_ACCEPT).toContain(".jpg");
    expect(PACIENTE_DOCUMENTO_ACCEPT).toContain(".jpeg");
  });
});
