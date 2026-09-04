import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SDK_INIT_TIMEOUT_MS = 15_000;
const EMBEDDED_SIGNUP_TIMEOUT_MS = 3_600_000;

const META_TIMEOUT_MESSAGE =
  "A conexão com a Meta não foi concluída dentro do tempo limite. Feche o popup e tente novamente.";
const FB_UNAVAILABLE_MESSAGE =
  "SDK do Facebook indisponível. Recarregue a página e tente novamente.";
const SDK_INIT_ERROR_MESSAGE = "SDK do Facebook não inicializou.";
const META_FLOW_ERROR_MESSAGE =
  "Ocorreu um erro na Meta durante a conexão, tente novamente.";

const TEST_AUTH_CODE = "test-oauth-code";

type MockFb = {
  init: ReturnType<typeof vi.fn>;
  login: ReturnType<typeof vi.fn>;
};

function createMockFb(loginImpl?: (callback: (response: unknown) => void) => void): MockFb {
  return {
    init: vi.fn(),
    login: vi.fn((callback: (response: unknown) => void) => {
      if (loginImpl) {
        loginImpl(callback);
        return;
      }
      callback({ authResponse: { code: TEST_AUTH_CODE } });
    }),
  };
}

function dispatchEmbeddedSignupMessage(
  event: string,
  payload?: {
    waba_id?: string;
    phone_number_id?: string;
    business_id?: string;
    error_message?: string;
    error_code?: string | number;
    current_step?: string;
    session_id?: string;
    timestamp?: string | number;
  },
) {
  window.dispatchEvent(
    new MessageEvent("message", {
      origin: "https://www.facebook.com",
      data: JSON.stringify({
        type: "WA_EMBEDDED_SIGNUP",
        event,
        data: payload,
      }),
    }),
  );
}

async function importEmbeddedSignupModule() {
  return import("@/features/dashboard/lib/metaEmbeddedSignup");
}

function resetDomAndWindow() {
  document.getElementById("facebook-jssdk")?.remove();
  delete window.FB;
  delete window.fbAsyncInit;
}

describe("runEmbeddedSignup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetDomAndWindow();
    vi.stubEnv("VITE_META_APP_ID", "test-meta-app-id");
    vi.stubEnv("VITE_META_EMBEDDED_SIGNUP_CONFIG_ID", "test-embedded-config-id");
    vi.stubEnv("VITE_INFOBIP_SOLUTION_ID", "test-infobip-solution-id");
    vi.stubEnv("VITE_WABA_CONNECT_MODE", "infobip");
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    resetDomAndWindow();
  });

  describe("regressão postMessage (A/B/C)", () => {
    it("A) FINISH resolve com success quando code e postMessage chegam", async () => {
      window.FB = createMockFb();
      const { runEmbeddedSignup } = await importEmbeddedSignupModule();

      const resultPromise = runEmbeddedSignup();
      await vi.advanceTimersByTimeAsync(0);

      dispatchEmbeddedSignupMessage("FINISH", {
        waba_id: "waba-1",
        phone_number_id: "phone-1",
      });

      await expect(resultPromise).resolves.toEqual({
        kind: "success",
        waba_id: "waba-1",
        phone_number_id: "phone-1",
        code: TEST_AUTH_CODE,
        code_captured_at_ms: expect.any(Number),
        flow_type: "new_phone_number",
      });
    });

    it("FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING resolve com flow_type existing_phone_number", async () => {
      window.FB = createMockFb();
      const { runEmbeddedSignup } = await importEmbeddedSignupModule();

      const resultPromise = runEmbeddedSignup({ flowIntent: "coexistence" });
      await vi.advanceTimersByTimeAsync(0);

      dispatchEmbeddedSignupMessage("FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", {
        waba_id: "waba-coexist",
        phone_number_id: "phone-coexist",
        business_id: "biz-1",
      });

      await expect(resultPromise).resolves.toEqual({
        kind: "success",
        waba_id: "waba-coexist",
        phone_number_id: "phone-coexist",
        code: TEST_AUTH_CODE,
        code_captured_at_ms: expect.any(Number),
        flow_type: "existing_phone_number",
        business_id: "biz-1",
      });
    });

    it("FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING aceita payload só com waba_id", async () => {
      window.FB = createMockFb();
      const { runEmbeddedSignup } = await importEmbeddedSignupModule();

      const resultPromise = runEmbeddedSignup({ flowIntent: "coexistence" });
      await vi.advanceTimersByTimeAsync(0);

      dispatchEmbeddedSignupMessage("FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", {
        waba_id: "waba-coexist-only",
      });

      await expect(resultPromise).resolves.toEqual({
        kind: "success",
        waba_id: "waba-coexist-only",
        phone_number_id: "",
        code: TEST_AUTH_CODE,
        code_captured_at_ms: expect.any(Number),
        flow_type: "existing_phone_number",
      });
    });

    it("B) CANCEL resolve com cancelled", async () => {
      window.FB = createMockFb();
      const { runEmbeddedSignup } = await importEmbeddedSignupModule();

      const resultPromise = runEmbeddedSignup();
      await vi.advanceTimersByTimeAsync(0);

      dispatchEmbeddedSignupMessage("CANCEL");

      await expect(resultPromise).resolves.toEqual({ kind: "cancelled" });
    });

    it("CANCEL com current_step e error_code loga detalhes e resolve cancelled", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      window.FB = createMockFb();
      const { runEmbeddedSignup } = await importEmbeddedSignupModule();

      const resultPromise = runEmbeddedSignup();
      await vi.advanceTimersByTimeAsync(0);

      dispatchEmbeddedSignupMessage("CANCEL", {
        current_step: "PHONE_NUMBER_SETUP",
        error_message: "User reported issue",
        error_code: 12345,
        session_id: "sess-abc",
        timestamp: 1700000000,
      });

      await expect(resultPromise).resolves.toEqual({ kind: "cancelled" });
      expect(logSpy).toHaveBeenCalledWith(
        "[EmbeddedSignup] evento CANCEL da Meta",
        expect.objectContaining({
          current_step: "PHONE_NUMBER_SETUP",
          error_code: 12345,
          session_id: "sess-abc",
        }),
      );
      logSpy.mockRestore();
    });

    it("C) ERROR resolve com error e mensagem amigável pro usuário", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      window.FB = createMockFb();
      const { runEmbeddedSignup } = await importEmbeddedSignupModule();

      const resultPromise = runEmbeddedSignup();
      await vi.advanceTimersByTimeAsync(0);

      dispatchEmbeddedSignupMessage("ERROR", { error_message: "Falha Meta teste" });

      await expect(resultPromise).resolves.toEqual({
        kind: "error",
        message: META_FLOW_ERROR_MESSAGE,
      });
      expect(errorSpy).toHaveBeenCalledWith(
        "[EmbeddedSignup] evento ERROR da Meta",
        expect.objectContaining({ error_message: "Falha Meta teste" }),
      );
      errorSpy.mockRestore();
    });
  });

  describe("buffer code + postMessage", () => {
    it("resolve quando code chega após postMessage FINISH", async () => {
      window.FB = createMockFb((callback) => {
        setTimeout(() => callback({ authResponse: { code: TEST_AUTH_CODE } }), 10);
      });
      const { runEmbeddedSignup } = await importEmbeddedSignupModule();

      const resultPromise = runEmbeddedSignup();
      await vi.advanceTimersByTimeAsync(0);

      dispatchEmbeddedSignupMessage("FINISH", {
        waba_id: "waba-delay",
        phone_number_id: "phone-delay",
      });

      await vi.advanceTimersByTimeAsync(10);

      await expect(resultPromise).resolves.toEqual({
        kind: "success",
        waba_id: "waba-delay",
        phone_number_id: "phone-delay",
        code: TEST_AUTH_CODE,
        code_captured_at_ms: expect.any(Number),
        flow_type: "new_phone_number",
      });
    });

    it("timeout se postMessage FINISH chega sem code", async () => {
      window.FB = createMockFb((callback) => {
        callback({});
      });
      const { runEmbeddedSignup } = await importEmbeddedSignupModule();

      const resultPromise = runEmbeddedSignup();
      await vi.advanceTimersByTimeAsync(0);

      dispatchEmbeddedSignupMessage("FINISH", {
        waba_id: "waba-no-code",
        phone_number_id: "phone-no-code",
      });

      await vi.advanceTimersByTimeAsync(EMBEDDED_SIGNUP_TIMEOUT_MS);

      await expect(resultPromise).resolves.toEqual({
        kind: "error",
        message: META_TIMEOUT_MESSAGE,
      });
    });
  });

  describe("FB.login extras", () => {
    it("modo infobip envia setup.solutionID no extras", async () => {
      window.FB = createMockFb();
      const { runEmbeddedSignup } = await importEmbeddedSignupModule();

      const resultPromise = runEmbeddedSignup();
      await vi.advanceTimersByTimeAsync(0);

      expect(window.FB?.login).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          config_id: "test-embedded-config-id",
          extras: expect.objectContaining({
            sessionInfoVersion: 3,
            setup: {
              solutionID: "test-infobip-solution-id",
            },
          }),
        }),
      );
      expect(window.FB?.login).toHaveBeenCalledWith(
        expect.any(Function),
        expect.not.objectContaining({
          extras: expect.objectContaining({
            featureType: "whatsapp_business_app_onboarding",
          }),
        }),
      );

      dispatchEmbeddedSignupMessage("CANCEL");
      await expect(resultPromise).resolves.toEqual({ kind: "cancelled" });
    });

    it("modo meta_direct envia setup vazio (sem solutionID)", async () => {
      vi.stubEnv("VITE_WABA_CONNECT_MODE", "meta_direct");
      vi.resetModules();
      window.FB = createMockFb();
      const { runEmbeddedSignup } = await importEmbeddedSignupModule();

      const resultPromise = runEmbeddedSignup();
      await vi.advanceTimersByTimeAsync(0);

      expect(window.FB?.login).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          extras: expect.objectContaining({
            setup: {},
          }),
        }),
      );
      expect(window.FB?.login).toHaveBeenCalledWith(
        expect.any(Function),
        expect.not.objectContaining({
          extras: expect.objectContaining({
            featureType: "whatsapp_business_app_onboarding",
          }),
        }),
      );

      dispatchEmbeddedSignupMessage("CANCEL");
      await expect(resultPromise).resolves.toEqual({ kind: "cancelled" });
    });
  });

  describe("getWabaConnectMode", () => {
    it("default infobip quando env ausente ou inválido", async () => {
      vi.unstubAllEnvs();
      vi.stubEnv("VITE_META_APP_ID", "x");
      vi.stubEnv("VITE_META_EMBEDDED_SIGNUP_CONFIG_ID", "y");
      vi.resetModules();
      const { getWabaConnectMode } = await importEmbeddedSignupModule();
      expect(getWabaConnectMode()).toBe("infobip");
    });

    it("meta_direct quando env definido", async () => {
      vi.stubEnv("VITE_WABA_CONNECT_MODE", "meta_direct");
      vi.resetModules();
      const { getWabaConnectMode } = await importEmbeddedSignupModule();
      expect(getWabaConnectMode()).toBe("meta_direct");
    });
  });

  describe("proteções de engenharia (D/E/F/G)", () => {
    it("D) timeout 1h sem postMessage — error e listener removido", async () => {
      window.FB = createMockFb((callback) => {
        callback({});
      });
      const removeListenerSpy = vi.spyOn(window, "removeEventListener");
      const { runEmbeddedSignup } = await importEmbeddedSignupModule();

      const resultPromise = runEmbeddedSignup();
      await vi.advanceTimersByTimeAsync(0);

      await vi.advanceTimersByTimeAsync(EMBEDDED_SIGNUP_TIMEOUT_MS);

      await expect(resultPromise).resolves.toEqual({
        kind: "error",
        message: META_TIMEOUT_MESSAGE,
      });

      expect(removeListenerSpy).toHaveBeenCalledWith("message", expect.any(Function));

      removeListenerSpy.mockClear();
      dispatchEmbeddedSignupMessage("FINISH", {
        waba_id: "late-waba",
        phone_number_id: "late-phone",
      });
      await vi.advanceTimersByTimeAsync(0);

      expect(removeListenerSpy).not.toHaveBeenCalledWith("message", expect.any(Function));
    });

    it("E) window.FB ausente após load — error imediato sem timeout", async () => {
      window.FB = createMockFb();
      const { runEmbeddedSignup } = await importEmbeddedSignupModule();

      const resultPromise = runEmbeddedSignup();
      delete window.FB;

      await expect(resultPromise).resolves.toEqual({
        kind: "error",
        message: FB_UNAVAILABLE_MESSAGE,
      });

      await vi.advanceTimersByTimeAsync(EMBEDDED_SIGNUP_TIMEOUT_MS);
    });

    it("F) SDK não inicializa em 15s — rejeita sem pendurar runEmbeddedSignup", async () => {
      const { runEmbeddedSignup } = await importEmbeddedSignupModule();

      const resultPromise = runEmbeddedSignup();
      const assertRejected = expect(resultPromise).rejects.toThrow(SDK_INIT_ERROR_MESSAGE);

      await vi.advanceTimersByTimeAsync(0);
      expect(document.getElementById("facebook-jssdk")).not.toBeNull();

      await vi.advanceTimersByTimeAsync(SDK_INIT_TIMEOUT_MS);
      await assertRejected;
    });

    it("G) postMessage FINISH após timeout — settled guard, resolve uma vez", async () => {
      window.FB = createMockFb((callback) => {
        callback({});
      });
      const { runEmbeddedSignup } = await importEmbeddedSignupModule();

      const outcomes: unknown[] = [];
      const resultPromise = runEmbeddedSignup().then((outcome) => {
        outcomes.push(outcome);
        return outcome;
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(EMBEDDED_SIGNUP_TIMEOUT_MS);

      const firstResult = await resultPromise;

      expect(firstResult).toEqual({
        kind: "error",
        message: META_TIMEOUT_MESSAGE,
      });

      dispatchEmbeddedSignupMessage("FINISH", {
        waba_id: "waba-late",
        phone_number_id: "phone-late",
      });
      await vi.advanceTimersByTimeAsync(0);

      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]).toEqual({
        kind: "error",
        message: META_TIMEOUT_MESSAGE,
      });
    });
  });
});
