import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PATIENT_NOT_LINKED_MESSAGE,
  resolvePatientPostLoginPath,
} from "@/features/auth/lib/resolvePatientPostLoginPath";

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseMock,
}));

function mockFromChain(finalResult: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue(finalResult),
  };
  supabaseMock.from.mockReturnValue(chain);
  return chain;
}

describe("resolvePatientPostLoginPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("respeita rota from quando já é /agendar/{slug}", async () => {
    const result = await resolvePatientPostLoginPath("user-1", {
      pathname: "/agendar/clinica-a/agendar",
      search: "?x=1",
    });

    expect(result).toEqual({
      ok: true,
      path: "/agendar/clinica-a/agendar?x=1",
    });
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("redireciona para clínica vinculada ao auth_user_id", async () => {
    const clientesChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [{ barbearia_id: "shop-1", updated_at: "2026-01-01" }],
        error: null,
      }),
    };
    const barbeariasChain = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [{ id: "shop-1", slug: "minha-clinica", ativa: true }],
        error: null,
      }),
    };

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "clientes") return clientesChain;
      if (table === "barbearias") return barbeariasChain;
      throw new Error(`unexpected table ${table}`);
    });

    const result = await resolvePatientPostLoginPath("user-1");

    expect(result).toEqual({ ok: true, path: "/agendar/minha-clinica" });
  });

  it("falha quando paciente não tem cadastro vinculado", async () => {
    mockFromChain({ data: [], error: null });

    const result = await resolvePatientPostLoginPath("user-1");

    expect(result).toEqual({ ok: false, error: PATIENT_NOT_LINKED_MESSAGE });
  });
});
