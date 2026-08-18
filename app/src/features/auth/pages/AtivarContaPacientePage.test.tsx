import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import AtivarContaPacientePage from "@/features/auth/pages/AtivarContaPacientePage";
import { toast } from "@/hooks/use-toast";

const { supabaseMock, navigateMock } = vi.hoisted(() => ({
  supabaseMock: {
    rpc: vi.fn(),
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      getSession: vi.fn(),
    },
    storage: { from: vi.fn() },
  },
  navigateMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseMock,
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

vi.mock("@/features/auth/lib/authToast", () => ({
  authInfoToast: vi.fn(),
}));

vi.mock("@/features/auth/lib/signupEmailOtp", () => ({
  resendSignupEmailOtp: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/features/auth/components/SignupEmailOtpForm", () => ({
  SignupEmailOtpForm: ({
    onConfirmed,
  }: {
    onConfirmed: (session: Session) => void | Promise<void>;
  }) => (
    <button
      type="button"
      onClick={() =>
        void onConfirmed({
          user: { id: "otp-user-id", email: "otp@test.com" },
        } as Session)
      }
    >
      Confirmar OTP teste
    </button>
  ),
}));

vi.mock("@/features/auth/components/GoogleButton", () => ({
  GoogleButton: () => <div data-testid="google-button" />,
}));

const toastMock = vi.mocked(toast);

function renderPage(token = "test-token") {
  return render(
    <MemoryRouter initialEntries={[`/ativar-paciente?token=${token}`]}>
      <Routes>
        <Route path="/ativar-paciente" element={<AtivarContaPacientePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AtivarContaPacientePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock.rpc.mockReset();
    supabaseMock.auth.signUp.mockReset();
  });

  it("verify already_has_account mostra tela Entrar", async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      data: {
        valid: false,
        reason: "already_has_account",
        nome: "João",
        barbearia_nome: "Clínica A",
      },
      error: null,
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: /esta conta já existe/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^entrar$/i })).toHaveAttribute("href", "/login?role=patient");
  });

  it("verify already_used mostra link já utilizado", async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      data: { valid: false, reason: "already_used" },
      error: null,
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: /link já utilizado/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^entrar$/i })).toBeInTheDocument();
  });

  it("verify expired mostra link expirado", async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      data: { valid: false, reason: "expired" },
      error: null,
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: /link expirado/i })).toBeInTheDocument();
  });

  it("verify not_found mostra link inválido", async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      data: { valid: false, reason: "not_found" },
      error: null,
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: /link de ativação inválido/i })).toBeInTheDocument();
  });

  it("sucesso por senha redireciona para /agendar/{slug}", async () => {
    supabaseMock.rpc
      .mockResolvedValueOnce({
        data: {
          valid: true,
          nome: "Maria",
          barbearia_nome: "Clínica B",
          barbearia_slug: "clinica-b",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { success: true, barbearia_slug: "clinica-b" },
        error: null,
      });

    supabaseMock.auth.signUp.mockResolvedValueOnce({
      data: {
        user: { id: "user-1", email: "maria@test.com", email_confirmed_at: "2026-01-01" },
        session: { user: { id: "user-1" } },
      },
      error: null,
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: /ativar minha conta/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^e-mail$/i), { target: { value: "maria@test.com" } });
    fireEvent.change(screen.getByLabelText(/crie uma senha/i), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText(/confirmar senha/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /concluir ativação/i }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/agendar/clinica-b", { replace: true });
    });
    expect(toastMock).toHaveBeenCalledWith({ title: "Conta ativada com sucesso!" });
  });

  it("sucesso por OTP redireciona para /agendar/{slug}", async () => {
    supabaseMock.rpc
      .mockResolvedValueOnce({
        data: {
          valid: true,
          nome: "Maria",
          barbearia_nome: "Clínica B",
          barbearia_slug: "clinica-otp",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { success: true, barbearia_slug: "clinica-otp" },
        error: null,
      });

    supabaseMock.auth.signUp.mockResolvedValueOnce({
      data: {
        user: { id: "user-2", email: "otp@test.com", identities: [{ id: "1" }] },
        session: null,
      },
      error: null,
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: /ativar minha conta/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^e-mail$/i), { target: { value: "otp@test.com" } });
    fireEvent.change(screen.getByLabelText(/crie uma senha/i), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText(/confirmar senha/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /concluir ativação/i }));

    expect(await screen.findByRole("button", { name: /confirmar otp teste/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /confirmar otp teste/i }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/agendar/clinica-otp", { replace: true });
    });
  });

  it("signUp com e-mail já cadastrado mostra tela conta existente sem pedir senha de login", async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      data: {
        valid: true,
        nome: "Maria",
        barbearia_nome: "Clínica B",
        barbearia_slug: "clinica-b",
      },
      error: null,
    });

    supabaseMock.auth.signUp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: "User already registered", code: "user_already_exists" } as never,
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: /ativar minha conta/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^e-mail$/i), { target: { value: "existente@test.com" } });
    fireEvent.change(screen.getByLabelText(/crie uma senha/i), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText(/confirmar senha/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /concluir ativação/i }));

    expect(await screen.findByRole("heading", { name: /esta conta já existe/i })).toBeInTheDocument();
    expect(supabaseMock.auth.signInWithPassword).not.toHaveBeenCalled();
  });
});
