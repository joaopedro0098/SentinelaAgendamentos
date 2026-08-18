import { describe, expect, it } from "vitest";
import {
  PASSWORDS_MISMATCH_MESSAGE,
  patientActivationSchema,
} from "@/features/auth/lib/patientActivationSchema";

describe("patientActivationSchema", () => {
  it("aceita e-mail e senhas iguais válidas", () => {
    const result = patientActivationSchema.safeParse({
      email: "paciente@exemplo.com",
      password: "123456",
      confirm_password: "123456",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita senhas diferentes com mensagem padrão", () => {
    const result = patientActivationSchema.safeParse({
      email: "paciente@exemplo.com",
      password: "123456",
      confirm_password: "654321",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === PASSWORDS_MISMATCH_MESSAGE)).toBe(true);
    }
  });

  it("rejeita senha curta", () => {
    const result = patientActivationSchema.safeParse({
      email: "paciente@exemplo.com",
      password: "123",
      confirm_password: "123",
    });
    expect(result.success).toBe(false);
  });
});
