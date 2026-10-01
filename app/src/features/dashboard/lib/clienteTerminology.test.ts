import { describe, expect, it } from "vitest";
import {
  applyClienteTerminologyToMessage,
  getClienteTerminology,
} from "@/lib/clienteTerminology";

describe("getClienteTerminology", () => {
  it("usa Cliente(s) no nicho beleza/barbearia", () => {
    const t = getClienteTerminology(true);
    expect(t.tabNavLabel).toBe("Clientes");
    expect(t.singular).toBe("Cliente");
    expect(t.pluralLower).toBe("clientes");
    expect(t.establishmentLower).toBe("salão");
  });

  it("mantém Paciente(s) nos demais nichos", () => {
    const t = getClienteTerminology(false);
    expect(t.tabNavLabel).toBe("Pacientes");
    expect(t.singularLower).toBe("paciente");
    expect(t.establishmentLower).toBe("clínica");
  });

  it("substitui paciente(s) em mensagens de erro no nicho beleza", () => {
    const t = getClienteTerminology(true);
    expect(applyClienteTerminologyToMessage("Já existe um paciente com este WhatsApp.", t)).toBe(
      "Já existe um cliente com este WhatsApp.",
    );
  });
});
