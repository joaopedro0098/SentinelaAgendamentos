import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AuthCallback from "@/features/auth/pages/AuthCallback";
import { authInfoToast } from "@/features/auth/lib/authToast";

const { supabaseMock, navigateMock, resolvePatientPostLoginPathMock } = vi.hoisted(() => ({
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
  resolvePatientPostLoginPathMock: vi.fn(),
}));

vi.mock("@/features/auth/lib/resolvePatientPostLoginPath", () => ({
  resolvePatientPostLoginPath: (...args: unknown[]) => resolvePatientPostLoginPathMock(...args),
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

vi.mock("@/features/auth/lib/authToast", () => ({
  authInfoToast: vi.fn(),
}));

vi.mock("@/features/auth/lib/authCallbackHandler", () => ({
  consumeAuthCallbackUrl: vi.fn().mockResolvedValue(undefined),
  urlHasPendingAuthCallback: vi.fn().mockReturnValue(false),
  waitForAuthSession: vi.fn(),
}));

vi.mock("@/features/auth/face-verification/facialVerificationStatus", () => ({
  userNeedsFaceVerification: vi.fn().mockResolvedValue(false),
  markFaceVerificationComplete: vi.fn(),
  canSkipFaceVerification: vi.fn().mockReturnValue(false),
}));

vi.mock("@/features/auth/face-verification/facialRecognitionController", () => ({
  registerUserFacialEmbedding: vi.fn(),
}));

vi.mock("@/features/auth/face-verification/pendingFaceStorage", () => ({
  loadPendingFaceEmbedding: vi.fn().mockReturnValue(null),
  clearPendingFaceEmbedding: vi.fn(),
}));

vi.mock("@/providers/SubscriptionProvider", () => ({
  clearSubscriptionCache: vi.fn(),
}));

vi.mock("@/lib/pwaInstall", () => ({
  getBarberPostLoginPath: vi.fn().mockReturnValue("/app"),
}));

const authInfoToastMock = vi.mocked(authInfoToast);

describe("AuthCallback — patient-activation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock.rpc.mockReset();
    resolvePatientPostLoginPathMock.mockReset();
    supabaseMock.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "google-user", email: "g@test.com" } } },
      error: null,
    });
  });

  it("redireciona para /agendar/{slug} após Google", async () => {
    vi.stubGlobal("location", {
      ...window.location,
      href: "http://localhost/auth/callback?flow=patient-activation&token=tok-google",
      search: "?flow=patient-activation&token=tok-google",
    });

    supabaseMock.rpc.mockResolvedValueOnce({
      data: { success: true, barbearia_slug: "clinica-google" },
      error: null,
    });

    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/agendar/clinica-google", { replace: true });
    });
    expect(authInfoToastMock).toHaveBeenCalledWith("Conta ativada com sucesso!");
    expect(supabaseMock.rpc).toHaveBeenCalledWith("concluir_ativacao_paciente", {
      p_token: "tok-google",
      p_auth_user_id: "google-user",
    });
  });
});

describe("AuthCallback — patient-login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolvePatientPostLoginPathMock.mockReset();
    supabaseMock.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "patient-google", email: "p@test.com" } } },
      error: null,
    });
  });

  it("redireciona para clínica vinculada após Google como paciente", async () => {
    vi.stubGlobal("location", {
      ...window.location,
      href: "http://localhost/auth/callback?flow=patient-login",
      search: "?flow=patient-login",
    });

    resolvePatientPostLoginPathMock.mockResolvedValueOnce({
      ok: true,
      path: "/agendar/clinica-paciente",
    });

    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/agendar/clinica-paciente", { replace: true });
    });
    expect(resolvePatientPostLoginPathMock).toHaveBeenCalledWith("patient-google");
  });
});
