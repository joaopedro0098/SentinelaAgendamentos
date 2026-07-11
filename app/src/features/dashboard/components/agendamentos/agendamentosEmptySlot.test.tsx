import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { isPastCalendarDate, todayYmd } from "@agenda/lib/appointmentDates";

const panelSource = readFileSync(
  resolve(__dirname, "AgendamentosDesktopPanel.tsx"),
  "utf8",
);

describe("slots vazios — bloqueio de clique", () => {
  it("painel usa pointer-events-none no overlay para não bloquear cliques", () => {
    expect(panelSource).toContain("pointer-events-none absolute inset-0 z-10");
  });

  it("painel renderiza botões vazio com handler de agendamento", () => {
    expect(panelSource).toContain('title={canBookEmptySlots ? "Clique para agendar" : undefined}');
    expect(panelSource).toContain("handleOpenSlotBooking");
  });

  it("overlay com pointer-events-none permite clicar no botão vazio", () => {
    const onClick = vi.fn();
    render(
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 z-10 bg-background/40" />
        <button type="button" onClick={onClick}>
          vazio
        </button>
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "vazio" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("painel exibe indicador OBS quando há observação", () => {
    expect(panelSource).toContain("AgendamentoObsIndicator");
    expect(panelSource).toContain("hasAgendamentoObservacao");
  });
});
