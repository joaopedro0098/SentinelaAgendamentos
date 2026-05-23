import { describe, expect, it } from "vitest";
import { buildSlots, duracaoReferenciaBarbeiro, filtrarSlotsLivres } from "./slots";

describe("filtrarSlotsLivres", () => {
  const windows = [{ hora_inicio: "09:00", hora_fim: "19:00" }];
  const all = buildSlots(windows, 30);

  it("buildSlots with pause uses interval + pause between every slot", () => {
    const windows = [{ hora_inicio: "09:00", hora_fim: "12:00" }];
    expect(buildSlots(windows, 45, 10)).toEqual(["09:00", "09:55", "10:50"]);
  });

  it("buildSlots without pause keeps fixed interval", () => {
    const windows = [{ hora_inicio: "10:00", hora_fim: "11:00" }];
    expect(buildSlots(windows, 20, 0)).toEqual(["10:00", "10:20", "10:40"]);
  });

  it("não oferece início se a duração total invade agendamento existente", () => {
    const ocupados = new Map<string, number>([
      ["17:00", 30],
      ["17:30", 30],
    ]);
    const livres60 = filtrarSlotsLivres(all, windows, ocupados, [], 60);
    expect(livres60).not.toContain("16:30");
    expect(livres60).not.toContain("17:00");
    expect(livres60).not.toContain("17:30");
    expect(livres60).toContain("18:00");
  });

  it("duracaoReferenciaBarbeiro usa o maior serviço", () => {
    expect(duracaoReferenciaBarbeiro([{ duracao_minutos: 15 }, { duracao_minutos: 45 }], 30)).toBe(45);
    expect(duracaoReferenciaBarbeiro([], 30)).toBe(30);
  });

  it("com duração curta permite encaixe antes do bloco ocupado", () => {
    const ocupados = new Map<string, number>([
      ["17:00", 30],
      ["17:30", 30],
    ]);
    const livres30 = filtrarSlotsLivres(all, windows, ocupados, [], 30);
    expect(livres30).toContain("16:30");
    expect(livres30).toContain("18:30");
    expect(livres30).not.toContain("17:00");
  });
});
