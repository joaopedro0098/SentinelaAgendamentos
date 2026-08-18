import { describe, expect, it } from "vitest";
import {
  PACIENTE_DOCUMENTO_ACCEPT,
  PACIENTE_DOCUMENTO_SIZE_LIMIT_MESSAGE,
  validatePacienteDocumentoFile,
} from "@/features/dashboard/lib/pacienteDocumentos";

describe("validatePacienteDocumentoFile", () => {
  it("aceita PDF", () => {
    const file = new File(["x"], "relatorio.pdf", { type: "application/pdf" });
    expect(validatePacienteDocumentoFile(file)).toEqual({ ok: true });
  });

  it("aceita txt e csv", () => {
    expect(validatePacienteDocumentoFile(new File(["a"], "notas.txt", { type: "text/plain" }))).toEqual({
      ok: true,
    });
    expect(validatePacienteDocumentoFile(new File(["a,b"], "dados.csv", { type: "text/csv" }))).toEqual({
      ok: true,
    });
  });

  it("aceita png e webp", () => {
    expect(validatePacienteDocumentoFile(new File(["x"], "foto.png", { type: "image/png" }))).toEqual({
      ok: true,
    });
    expect(validatePacienteDocumentoFile(new File(["x"], "foto.webp", { type: "image/webp" }))).toEqual({
      ok: true,
    });
  });

  it("rejeita arquivo acima de 10 MB", () => {
    const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "grande.pdf", {
      type: "application/pdf",
    });
    const result = validatePacienteDocumentoFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(PACIENTE_DOCUMENTO_SIZE_LIMIT_MESSAGE);
    }
  });

  it("rejeita extensão não suportada", () => {
    const file = new File(["x"], "virus.exe", { type: "application/octet-stream" });
    const result = validatePacienteDocumentoFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Formato não suportado");
    }
  });

  it("accept inclui formatos solicitados", () => {
    expect(PACIENTE_DOCUMENTO_ACCEPT).toContain(".doc");
    expect(PACIENTE_DOCUMENTO_ACCEPT).toContain(".docx");
    expect(PACIENTE_DOCUMENTO_ACCEPT).toContain(".pdf");
    expect(PACIENTE_DOCUMENTO_ACCEPT).toContain(".txt");
    expect(PACIENTE_DOCUMENTO_ACCEPT).toContain(".csv");
    expect(PACIENTE_DOCUMENTO_ACCEPT).toContain(".png");
    expect(PACIENTE_DOCUMENTO_ACCEPT).toContain(".webp");
  });
});
