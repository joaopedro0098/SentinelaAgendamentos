import { describe, expect, it } from "vitest";
import {
  getPatientActivationSuccessPath,
  getPatientPostLoginPath,
} from "@/features/auth/lib/postLoginPaths";

describe("getPatientActivationSuccessPath", () => {
  it("redireciona para hub da clínica quando slug informado", () => {
    expect(getPatientActivationSuccessPath("minha-clinica")).toBe("/agendar/minha-clinica");
  });

  it("codifica slug com caracteres especiais", () => {
    expect(getPatientActivationSuccessPath("clínica teste")).toBe(
      "/agendar/cl%C3%ADnica%20teste",
    );
  });

  it("cai no fallback de paciente sem slug", () => {
    expect(getPatientActivationSuccessPath(null)).toBe(getPatientPostLoginPath());
    expect(getPatientActivationSuccessPath("")).toBe(getPatientPostLoginPath());
  });
});
