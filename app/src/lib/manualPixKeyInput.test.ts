import { describe, expect, it } from "vitest";
import { sanitizeManualPixKeyInput } from "./manualPixKeyInput";

describe("sanitizeManualPixKeyInput", () => {
  it("remove espaços e pontuação", () => {
    expect(sanitizeManualPixKeyInput("  abc-123@mail.com  ")).toBe("abc123mailcom");
    expect(sanitizeManualPixKeyInput("55 11 99999-9999")).toBe("5511999999999");
  });

  it("mantém letras e números", () => {
    expect(sanitizeManualPixKeyInput("ChavePix123")).toBe("ChavePix123");
  });
});
