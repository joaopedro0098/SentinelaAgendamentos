import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PacienteCadastroCreateModal } from "@/features/dashboard/components/pacientes/PacienteCadastroCreateModal";
import { createPacienteCadastroPainel } from "@/features/dashboard/lib/agendamentoAnotacao";
import { toast } from "@/hooks/use-toast";

vi.mock("@/features/dashboard/lib/agendamentoAnotacao", () => ({
  createPacienteCadastroPainel: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

const createPacienteMock = vi.mocked(createPacienteCadastroPainel);
const toastMock = vi.mocked(toast);

describe("PacienteCadastroCreateModal", () => {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  let windowOpenSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    windowOpenSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    createPacienteMock.mockResolvedValue({
      ok: true,
      patient: {
        whatsapp_digits: "5511999887766",
        cliente_id: "cliente-1",
        cliente_nome: "Maria Smoke",
        ultimo_atendimento: "2026-08-18",
        total_concluidos: 0,
        total_anotacoes: 0,
        conta_ativada: false,
      },
    });
  });

  it("salvar cadastra, mostra toast simples, fecha modal e não abre WhatsApp", async () => {
    render(
      <PacienteCadastroCreateModal
        open
        initialWhatsappDigits=""
        onClose={onClose}
        onCreated={onCreated}
      />,
    );

    fireEvent.change(screen.getByLabelText(/nome completo/i), {
      target: { value: "Maria Smoke" },
    });
    fireEvent.change(screen.getByLabelText(/contato \(whatsapp\)/i), {
      target: { value: "11999887766" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^salvar$/i }));

    await waitFor(() => {
      expect(createPacienteMock).toHaveBeenCalledWith("5511999887766", "Maria Smoke", null);
    });

    expect(toastMock).toHaveBeenCalledWith({ title: "Paciente cadastrado" });
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });
});
