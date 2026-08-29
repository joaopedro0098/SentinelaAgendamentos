const META_APP_ID = String(import.meta.env.VITE_META_APP_ID ?? "").trim();
const META_EMBEDDED_SIGNUP_CONFIG_ID = String(import.meta.env.VITE_META_EMBEDDED_SIGNUP_CONFIG_ID ?? "").trim();
const INFOBIP_SOLUTION_ID = String(import.meta.env.VITE_INFOBIP_SOLUTION_ID ?? "").trim();

/** Timeout de engenharia: aguardar FB.init após injetar/carregar sdk.js */
const SDK_INIT_TIMEOUT_MS = 15_000;
/** Timeout de engenharia: aguardar postMessage WA_EMBEDDED_SIGNUP após FB.login */
const EMBEDDED_SIGNUP_TIMEOUT_MS = 120_000;

/** Mensagem exibida quando a Meta envia event: ERROR no postMessage do Embedded Signup. */
export const META_EMBEDDED_SIGNUP_FLOW_ERROR_MESSAGE =
  "Ocorreu um erro na Meta durante a conexão, tente novamente.";

export type WabaConnectMode = "meta_direct" | "infobip";

export function getWabaConnectMode(): WabaConnectMode {
  const raw = String(import.meta.env.VITE_WABA_CONNECT_MODE ?? "infobip").trim().toLowerCase();
  if (raw === "meta_direct") return "meta_direct";
  return "infobip";
}

export type WabaFlowType = "new_phone_number" | "only_waba" | "existing_phone_number";

export function getMetaEmbeddedSignupConfig() {
  const mode = getWabaConnectMode();
  const baseConfigured = Boolean(META_APP_ID && META_EMBEDDED_SIGNUP_CONFIG_ID);
  return {
    appId: META_APP_ID,
    configId: META_EMBEDDED_SIGNUP_CONFIG_ID,
    solutionId: INFOBIP_SOLUTION_ID,
    mode,
    isConfigured: mode === "meta_direct"
      ? baseConfigured
      : baseConfigured && Boolean(INFOBIP_SOLUTION_ID),
  };
}

type FbLoginOptions = {
  config_id: string;
  auth_type: string;
  response_type: string;
  override_default_response_type: boolean;
  extras: {
    sessionInfoVersion: number;
    setup: Record<string, string>;
    featureType: string;
  };
};

type FacebookLoginResponse = {
  authResponse?: {
    code?: string;
  };
};

type FacebookSdk = {
  init: (params: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void;
  login: (callback: (response: FacebookLoginResponse) => void, options: FbLoginOptions) => void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

let sdkLoadPromise: Promise<void> | null = null;

function loadFacebookSdkScript(appId: string): Promise<void> {
  if (window.FB) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise((resolve, reject) => {
    let settled = false;

    const complete = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(initTimeoutId);
      window.clearInterval(waitForFbIntervalId);
      fn();
    };

    const initTimeoutId = window.setTimeout(() => {
      complete(() => reject(new Error("SDK do Facebook não inicializou.")));
    }, SDK_INIT_TIMEOUT_MS);

    let waitForFbIntervalId = 0;

    window.fbAsyncInit = () => {
      if (!window.FB) {
        complete(() => reject(new Error("SDK do Facebook não inicializou.")));
        return;
      }
      window.FB.init({
        appId,
        cookie: true,
        xfbml: false,
        version: "v21.0",
      });
      complete(resolve);
    };

    if (document.getElementById("facebook-jssdk")) {
      waitForFbIntervalId = window.setInterval(() => {
        if (window.FB) {
          complete(resolve);
        }
      }, 50);
      return;
    }

    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.async = true;
    script.defer = true;
    script.src = "https://connect.facebook.net/pt_BR/sdk.js";
    script.onerror = () => complete(() => reject(new Error("Não foi possível carregar o SDK do Facebook.")));
    document.body.appendChild(script);
  });

  return sdkLoadPromise;
}

function mapEventToFlowType(event: string): WabaFlowType | null {
  if (event === "FINISH") return "new_phone_number";
  if (event === "FINISH_ONLY_WABA") return "only_waba";
  if (event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") return "existing_phone_number";
  return null;
}

export type EmbeddedSignupSuccess = {
  kind: "success";
  waba_id: string;
  phone_number_id: string;
  code: string;
  code_captured_at_ms: number;
  flow_type: WabaFlowType;
  business_id?: string;
};

export type EmbeddedSignupOutcome =
  | EmbeddedSignupSuccess
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

export async function runEmbeddedSignup(): Promise<EmbeddedSignupOutcome> {
  const { appId, configId, solutionId, mode, isConfigured } = getMetaEmbeddedSignupConfig();
  if (!isConfigured) {
    const missing = mode === "meta_direct"
      ? "VITE_META_APP_ID / VITE_META_EMBEDDED_SIGNUP_CONFIG_ID"
      : "VITE_META_APP_ID / VITE_META_EMBEDDED_SIGNUP_CONFIG_ID / VITE_INFOBIP_SOLUTION_ID";
    return {
      kind: "error",
      message: `Integração Meta não configurada (${missing}).`,
    };
  }

  await loadFacebookSdkScript(appId);

  return new Promise((resolve) => {
    let settled = false;
    let signupTimeoutId = 0;

    let sessionWabaId = "";
    let sessionPhoneNumberId = "";
    let sessionFlowType: WabaFlowType | null = null;
    let sessionBusinessId: string | undefined;
    let authCode: string | null = null;
    let authCodeCapturedAtMs: number | null = null;

    const finish = (outcome: EmbeddedSignupOutcome) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(signupTimeoutId);
      window.removeEventListener("message", listener);
      window.removeEventListener("beforeunload", beforeUnloadCleanup);
      resolve(outcome);
    };

    const tryCompleteSuccess = () => {
      if (!sessionWabaId || !sessionPhoneNumberId || !sessionFlowType || !authCode || authCodeCapturedAtMs === null) {
        return;
      }
      finish({
        kind: "success",
        waba_id: sessionWabaId,
        phone_number_id: sessionPhoneNumberId,
        code: authCode,
        code_captured_at_ms: authCodeCapturedAtMs,
        flow_type: sessionFlowType,
        business_id: sessionBusinessId,
      });
    };

    const beforeUnloadCleanup = () => {
      window.removeEventListener("message", listener);
      window.clearTimeout(signupTimeoutId);
    };

    const listener = (event: MessageEvent) => {
      console.log("[EmbeddedSignup] postMessage recebido", { origin: event.origin, data: event.data }); // DEBUG TEMP

      const originOk = event.origin.endsWith("facebook.com");
      console.log("[EmbeddedSignup] filtro origin facebook.com:", originOk ? "PASSOU" : "FALHOU", event.origin); // DEBUG TEMP
      if (!originOk) return;

      try {
        const data = JSON.parse(String(event.data)) as {
          type?: string;
          event?: string;
          data?: {
            phone_number_id?: string;
            waba_id?: string;
            business_id?: string;
            current_step?: string;
            error_message?: string;
            error_code?: string | number;
            session_id?: string;
            timestamp?: string | number;
          };
        };

        const typeOk = data.type === "WA_EMBEDDED_SIGNUP";
        console.log("[EmbeddedSignup] filtro type WA_EMBEDDED_SIGNUP:", typeOk ? "PASSOU" : "FALHOU", data.type); // DEBUG TEMP
        if (!typeOk) return;

        const flowType = mapEventToFlowType(String(data.event ?? ""));
        const isFinish = flowType !== null;
        console.log("[EmbeddedSignup] filtro FINISH/FINISH_ONLY_WABA:", isFinish ? "PASSOU" : "FALHOU", data.event); // DEBUG TEMP
        if (isFinish) {
          const wabaId = String(data.data?.waba_id ?? "").trim();
          const phoneNumberId = String(data.data?.phone_number_id ?? "").trim();
          const idsOk = Boolean(wabaId && phoneNumberId);
          console.log("[EmbeddedSignup] filtro waba_id + phone_number_id:", idsOk ? "PASSOU" : "FALHOU", { wabaId, phoneNumberId }); // DEBUG TEMP
          if (!idsOk) {
            finish({ kind: "error", message: "Meta não retornou waba_id ou phone_number_id." });
            return;
          }
          sessionWabaId = wabaId;
          sessionPhoneNumberId = phoneNumberId;
          sessionFlowType = flowType;
          const businessId = String(data.data?.business_id ?? "").trim();
          sessionBusinessId = businessId || undefined;
          tryCompleteSuccess();
          return;
        }

        const isCancel = data.event === "CANCEL";
        console.log("[EmbeddedSignup] filtro CANCEL:", isCancel ? "PASSOU" : "FALHOU", data.event); // DEBUG TEMP
        if (isCancel) {
          console.log("[EmbeddedSignup] evento CANCEL da Meta", {
            current_step: data.data?.current_step ?? null,
            error_message: data.data?.error_message ?? null,
            error_code: data.data?.error_code ?? null,
            session_id: data.data?.session_id ?? null,
            timestamp: data.data?.timestamp ?? null,
          });
          finish({ kind: "cancelled" });
          return;
        }

        const isError = data.event === "ERROR";
        console.log("[EmbeddedSignup] filtro ERROR:", isError ? "PASSOU" : "FALHOU", data.event); // DEBUG TEMP
        if (isError) {
          console.error("[EmbeddedSignup] evento ERROR da Meta", {
            error_message: data.data?.error_message ?? null,
            error_code: data.data?.error_code ?? null,
            current_step: data.data?.current_step ?? null,
            session_id: data.data?.session_id ?? null,
            timestamp: data.data?.timestamp ?? null,
          });
          finish({
            kind: "error",
            message: META_EMBEDDED_SIGNUP_FLOW_ERROR_MESSAGE,
          });
          return;
        }
      } catch (parseErr) {
        console.log("[EmbeddedSignup] JSON.parse falhou (non-JSON):", parseErr, event.data); // DEBUG TEMP
        /* non-JSON */
      }
    };

    window.addEventListener("message", listener);
    window.addEventListener("beforeunload", beforeUnloadCleanup);

    if (!window.FB) {
      finish({
        kind: "error",
        message: "SDK do Facebook indisponível. Recarregue a página e tente novamente.",
      });
      return;
    }

    signupTimeoutId = window.setTimeout(() => {
      finish({ kind: "error", message: "Tempo esgotado aguardando resposta da Meta." });
    }, EMBEDDED_SIGNUP_TIMEOUT_MS);

    const extrasSetup = mode === "infobip" ? { solutionID: solutionId } : {};

    window.FB.login(
      (response) => {
        const code = String(response.authResponse?.code ?? "").trim();
        if (!code) return;
        authCode = code;
        authCodeCapturedAtMs = Date.now();
        console.log("[EmbeddedSignup] code capturado no callback FB.login", {
          capturedAtMs: authCodeCapturedAtMs,
        }); // DEBUG TEMP
        tryCompleteSuccess();
      },
      {
        config_id: configId,
        auth_type: "rerequest",
        response_type: "code",
        override_default_response_type: true,
        extras: {
          sessionInfoVersion: 3,
          setup: extrasSetup,
          featureType: "whatsapp_business_app_onboarding",
        },
      },
    );
  });
}
