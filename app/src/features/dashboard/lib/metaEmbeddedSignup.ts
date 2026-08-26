const META_APP_ID = String(import.meta.env.VITE_META_APP_ID ?? "").trim();
const META_EMBEDDED_SIGNUP_CONFIG_ID = String(import.meta.env.VITE_META_EMBEDDED_SIGNUP_CONFIG_ID ?? "").trim();
const INFOBIP_SOLUTION_ID = String(import.meta.env.VITE_INFOBIP_SOLUTION_ID ?? "").trim();

/** Timeout de engenharia: aguardar FB.init após injetar/carregar sdk.js */
const SDK_INIT_TIMEOUT_MS = 15_000;
/** Timeout de engenharia: aguardar postMessage WA_EMBEDDED_SIGNUP após FB.login */
const EMBEDDED_SIGNUP_TIMEOUT_MS = 120_000;

export function getMetaEmbeddedSignupConfig() {
  return {
    appId: META_APP_ID,
    configId: META_EMBEDDED_SIGNUP_CONFIG_ID,
    solutionId: INFOBIP_SOLUTION_ID,
    isConfigured: Boolean(META_APP_ID && META_EMBEDDED_SIGNUP_CONFIG_ID && INFOBIP_SOLUTION_ID),
  };
}

type FbLoginOptions = {
  config_id: string;
  auth_type: string;
  response_type: string;
  override_default_response_type: boolean;
  extras: {
    sessionInfoVersion: number;
    setup: {
      solutionID: string;
    };
  };
};

type FacebookSdk = {
  init: (params: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void;
  login: (callback: (response: unknown) => void, options: FbLoginOptions) => void;
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

export type EmbeddedSignupSuccess = {
  kind: "success";
  waba_id: string;
  phone_number_id: string;
};

export type EmbeddedSignupOutcome =
  | EmbeddedSignupSuccess
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

export async function runEmbeddedSignup(): Promise<EmbeddedSignupOutcome> {
  const { appId, configId, solutionId, isConfigured } = getMetaEmbeddedSignupConfig();
  if (!isConfigured) {
    return {
      kind: "error",
      message:
        "Integração Meta não configurada (VITE_META_APP_ID / VITE_META_EMBEDDED_SIGNUP_CONFIG_ID / VITE_INFOBIP_SOLUTION_ID).",
    };
  }

  await loadFacebookSdkScript(appId);

  return new Promise((resolve) => {
    let settled = false;
    let signupTimeoutId = 0;

    const finish = (outcome: EmbeddedSignupOutcome) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(signupTimeoutId);
      window.removeEventListener("message", listener);
      window.removeEventListener("beforeunload", beforeUnloadCleanup);
      resolve(outcome);
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
          data?: { phone_number_id?: string; waba_id?: string; current_step?: string; error_message?: string };
        };

        const typeOk = data.type === "WA_EMBEDDED_SIGNUP";
        console.log("[EmbeddedSignup] filtro type WA_EMBEDDED_SIGNUP:", typeOk ? "PASSOU" : "FALHOU", data.type); // DEBUG TEMP
        if (!typeOk) return;

        const isFinish = data.event === "FINISH" || data.event === "FINISH_ONLY_WABA";
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
          finish({ kind: "success", waba_id: wabaId, phone_number_id: phoneNumberId });
          return;
        }

        const isCancel = data.event === "CANCEL";
        console.log("[EmbeddedSignup] filtro CANCEL:", isCancel ? "PASSOU" : "FALHOU", data.event); // DEBUG TEMP
        if (isCancel) {
          finish({ kind: "cancelled" });
          return;
        }

        const isError = data.event === "ERROR";
        console.log("[EmbeddedSignup] filtro ERROR:", isError ? "PASSOU" : "FALHOU", data.event); // DEBUG TEMP
        if (isError) {
          finish({
            kind: "error",
            message: String(data.data?.error_message ?? "Erro no fluxo da Meta."),
          });
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

    window.FB.login(
      () => {
        /* dados vêm via postMessage WA_EMBEDDED_SIGNUP — não tratar response aqui */
      },
      {
        config_id: configId,
        auth_type: "rerequest",
        response_type: "code",
        override_default_response_type: true,
        extras: {
          sessionInfoVersion: 3,
          setup: {
            solutionID: solutionId,
          },
        },
      },
    );
  });
}
