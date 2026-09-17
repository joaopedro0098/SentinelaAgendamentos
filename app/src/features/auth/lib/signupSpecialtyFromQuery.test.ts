import { describe, expect, it } from "vitest";
import { readSignupSpecialtyFromSearchParams } from "@/features/auth/lib/signupSpecialtyFromQuery";

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
