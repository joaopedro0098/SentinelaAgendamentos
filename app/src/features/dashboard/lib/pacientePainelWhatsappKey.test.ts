import { describe, expect, it } from "vitest";
import { pacientePainelWhatsappKey } from "./pacientePainelWhatsappKey";

describe("pacientePainelWhatsappKey", () => {
  it("unifica DDI 55 com número local", () => {
    expect(pacientePainelWhatsappKey("5511987654321")).toBe("11987654321");
    expect(pacientePainelWhatsappKey("11987654321")).toBe("11987654321");
  });
});
