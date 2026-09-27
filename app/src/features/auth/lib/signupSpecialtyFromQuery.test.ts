import { describe, expect, it } from "vitest";
import { readSignupSpecialtyFromSearchParams } from "@/features/auth/lib/signupSpecialtyFromQuery";
import { signupSpecialtyOptionsForQuerySpecialty } from "@/lib/professionalSpecialty";

describe("readSignupSpecialtyFromSearchParams", () => {
  it("retorna absent quando param ausente", () => {
    expect(readSignupSpecialtyFromSearchParams(new URLSearchParams())).toEqual({
      status: "absent",
      specialty: null,
    });
  });

  it("retorna valid para especialidade allowlisted", () => {
    expect(
      readSignupSpecialtyFromSearchParams(new URLSearchParams("especialidade=dentista")),
    ).toEqual({
      status: "valid",
      specialty: "dentista",
    });
  });

  it("retorna valid para salão de beleza", () => {
    expect(
      readSignupSpecialtyFromSearchParams(new URLSearchParams("especialidade=salao_beleza")),
    ).toEqual({
      status: "valid",
      specialty: "salao_beleza",
    });
  });

  it("retorna valid para barbearia", () => {
    expect(
      readSignupSpecialtyFromSearchParams(new URLSearchParams("especialidade=barbearia")),
    ).toEqual({
      status: "valid",
      specialty: "barbearia",
    });
  });

  it("retorna invalid para valor fora da allowlist", () => {
    expect(
      readSignupSpecialtyFromSearchParams(new URLSearchParams("especialidade=barbeiro")),
    ).toEqual({
      status: "invalid",
      specialty: null,
      raw: "barbeiro",
    });
  });
});

describe("signupSpecialtyOptionsForQuerySpecialty", () => {
  it("sem query mostra só saúde", () => {
    expect(signupSpecialtyOptionsForQuerySpecialty(null)).toEqual([
      "dentista",
      "psicologo",
      "nutricionista",
      "medico",
    ]);
  });

  it("query saúde mostra só saúde", () => {
    expect(signupSpecialtyOptionsForQuerySpecialty("medico")).toEqual([
      "dentista",
      "psicologo",
      "nutricionista",
      "medico",
    ]);
  });

  it("query beleza mostra só salão e barbearia", () => {
    expect(signupSpecialtyOptionsForQuerySpecialty("salao_beleza")).toEqual([
      "salao_beleza",
      "barbearia",
    ]);
    expect(signupSpecialtyOptionsForQuerySpecialty("barbearia")).toEqual([
      "salao_beleza",
      "barbearia",
    ]);
  });
});
