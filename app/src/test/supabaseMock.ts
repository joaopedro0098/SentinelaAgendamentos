import { vi } from "vitest";

export function createSupabaseMock() {
  const rpc = vi.fn();
  const signUp = vi.fn();
  const signInWithPassword = vi.fn();
  const getSession = vi.fn();
  const storageFrom = vi.fn(() => ({
    upload: vi.fn().mockResolvedValue({ error: null }),
    getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://example.com/a.jpg" } })),
  }));

  return {
    rpc,
    auth: {
      signUp,
      signInWithPassword,
      getSession,
    },
    storage: {
      from: storageFrom,
    },
  };
}

export type SupabaseMock = ReturnType<typeof createSupabaseMock>;
