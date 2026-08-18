import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Login from "@/features/auth/pages/Login";
import { toast } from "@/hooks/use-toast";

const { supabaseMock, navigateMock, useAuthMock } = vi.hoisted(() => ({
  supabaseMock: {
    rpc: vi.fn(),
    auth: {
      signInWithPassword: vi.fn(),
      getSession: vi.fn(),
    },
  },
  navigateMock: vi.fn(),
  useAuthMock: {
    session: null as { user: { id: string } } | null,
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseMock,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => useAuthMock,
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

vi.mock("@/features/auth/components/GoogleButton", () => ({
  GoogleButton: () => <div data-testid="google-button" />,
}));

const toastMock = vi.mocked(toast);

function renderLogin(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/login${search}`]}>
      <Login />
    </MemoryRouter>,
  );
}

describe("Login — ativação de paciente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.session = null;
    supabaseMock.rpc.mockReset();
    supabaseMock.auth.signInWithPassword.mockReset();
    supabaseMock.auth.getSession.mockReset();
  });

  it("após login com activation_token vincula paciente e redireciona", async () => {
    supabaseMock.auth.signInWithPassword.mockResolvedValueOnce({ error: null });
    supabaseMock.auth.getSession.mockResolvedValueOnce({
      data: { session: { user: { id: "pro-user-id" } } },
      error: null,
    });
    supabaseMock.rpc.mockResolvedValueOnce({
      data: { success: true, barbearia_slug: "clinica-x" },
      error: null,
    });

    renderLogin("?role=patient&activation_token=tok-abc");

    expect(
      await screen.findByText(/concluir a ativação como paciente/i),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^e-mail$/i), { target: { value: "pro@test.com" } });
    fireEvent.change(screen.getByLabelText(/^senha$/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /^entrar$/i }));

    await waitFor(() => {
      expect(supabaseMock.rpc).toHaveBeenCalledWith("concluir_ativacao_paciente", {
        p_token: "tok-abc",
        p_auth_user_id: "pro-user-id",
      });
    });
    expect(navigateMock).toHaveBeenCalledWith("/agendar/clinica-x", { replace: true });
    expect(toastMock).toHaveBeenCalledWith({ title: "Conta ativada com sucesso!" });
  });

  it("sessão existente com activation_token conclui vinculação sem pedir senha", async () => {
    useAuthMock.session = { user: { id: "existing-user" } };
    supabaseMock.rpc.mockResolvedValueOnce({
      data: { success: true, barbearia_slug: "clinica-y" },
      error: null,
    });

    renderLogin("?role=patient&activation_token=tok-existing");

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/agendar/clinica-y", { replace: true });
    });
    expect(supabaseMock.auth.signInWithPassword).not.toHaveBeenCalled();
  });
});
