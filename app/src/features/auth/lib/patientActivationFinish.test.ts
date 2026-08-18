import { describe, it, expect } from "vitest";
import {
  buildPatientActivationLoginPath,
} from "@/features/auth/lib/patientActivationFinish";

describe("buildPatientActivationLoginPath", () => {
  it("inclui role e token na query", () => {
    expect(buildPatientActivationLoginPath("abc-123")).toBe(
      "/login?role=patient&activation_token=abc-123",
    );
  });

  it("codifica caracteres especiais do token", () => {
    expect(buildPatientActivationLoginPath("a+b=c")).toBe(
      "/login?role=patient&activation_token=a%2Bb%3Dc",
    );
  });

  it("sem token retorna login paciente simples", () => {
    expect(buildPatientActivationLoginPath("")).toBe("/login?role=patient");
    expect(buildPatientActivationLoginPath("   ")).toBe("/login?role=patient");
  });
});
