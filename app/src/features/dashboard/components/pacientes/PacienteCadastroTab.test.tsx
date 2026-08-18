import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PacienteCadastroTab } from "@/features/dashboard/components/pacientes/PacienteCadastroTab";
import type { PacientePainelItem } from "@/features/dashboard/lib/agendamentoAnotacao";
import { getPatientActivationLink } from "@/features/dashboard/lib/agendamentoAnotacao";
import { toast } from "@/hooks/use-toast";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: vi.fn(),
    },
  },
}));

vi.mock("@/features/dashboard/lib/agendamentoAnotacao", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/dashboard/lib/agendamentoAnotacao")>();
  return {
    ...actual,
    getPatientActivationLink: vi.fn(),
    deletePacienteCadastroPainel: vi.fn(),
    updatePacienteNome: vi.fn(),
    updatePacienteDataNascimento: vi.fn(),
    updatePacienteAvatar: vi.fn(),
  };
});

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

const getLinkMock = vi.mocked(getPatientActivationLink);
const toastMock = vi.mocked(toast);

const basePaciente: PacientePainelItem = {
  whatsapp_digits: "5511999887766",
  cliente_id: "cliente-1",
  cliente_nome: "Maria Teste",
  conta_ativada: false,
  ultimo_atendimento: "2026-08-18",
  total_concluidos: 0,
  total_anotacoes: 0,
  can_rename_nome: true,
};

describe("PacienteCadastroTab — compartilhar link e excluir", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLinkMock.mockResolvedValue({
      ok: true,
      url: "https://app.test/ativar-paciente?token=abc",
    });
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("CT vê Compartilhar Link e Excluir cadastro", () => {
    render(
      <PacienteCadastroTab
        paciente={basePaciente}
        canDeleteCadastro
        onNomeSaved={vi.fn()}
        onDataNascimentoSaved={vi.fn()}
        onAvatarSaved={vi.fn()}
        onCadastroDeleted={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /compartilhar link/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /excluir cadastro/i })).toBeInTheDocument();
  });

  it("CA vê Compartilhar Link e não vê Excluir cadastro", () => {
    render(
      <PacienteCadastroTab
        paciente={basePaciente}
        canDeleteCadastro={false}
        onNomeSaved={vi.fn()}
        onDataNascimentoSaved={vi.fn()}
        onAvatarSaved={vi.fn()}
        onCadastroDeleted={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /compartilhar link/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /excluir cadastro/i })).not.toBeInTheDocument();
  });

  it("conta_ativada oculta botão e mostra texto dos toggles de Configurações", () => {
    render(
      <PacienteCadastroTab
        paciente={{ ...basePaciente, conta_ativada: true }}
        canDeleteCadastro
        onNomeSaved={vi.fn()}
        onDataNascimentoSaved={vi.fn()}
        onAvatarSaved={vi.fn()}
        onCadastroDeleted={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /compartilhar link/i })).not.toBeInTheDocument();
    expect(screen.getByText(/cliente agenda pelo link/i)).toBeInTheDocument();
    expect(screen.getByText(/cliente altera ou cancela pelo link/i)).toBeInTheDocument();
  });

  it("clique em Compartilhar Link chama RPC e copia pro clipboard", async () => {
    render(
      <PacienteCadastroTab
        paciente={basePaciente}
        canDeleteCadastro={false}
        onNomeSaved={vi.fn()}
        onDataNascimentoSaved={vi.fn()}
        onAvatarSaved={vi.fn()}
        onCadastroDeleted={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /compartilhar link/i }));

    await waitFor(() => {
      expect(getLinkMock).toHaveBeenCalledWith("5511999887766");
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "https://app.test/ativar-paciente?token=abc",
    );
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Link copiado" }),
    );
  });
});
