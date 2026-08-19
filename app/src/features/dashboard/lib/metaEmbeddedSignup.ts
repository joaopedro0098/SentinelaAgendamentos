import { unmaskPhone } from "@agenda/lib/phone";

const META_APP_ID = String(import.meta.env.VITE_META_APP_ID ?? "").trim();
const META_EMBEDDED_SIGNUP_CONFIG_ID = String(import.meta.env.VITE_META_EMBEDDED_SIGNUP_CONFIG_ID ?? "").trim();

export function getMetaEmbeddedSignupConfig() {
  return {
    appId: META_APP_ID,
    configId: META_EMBEDDED_SIGNUP_CONFIG_ID,
    isConfigured: Boolean(META_APP_ID && META_EMBEDDED_SIGNUP_CONFIG_ID),
  };
}

/** Normaliza dígitos BR para E.164 com prefixo + (ex.: +5511999999999). */
export function toBrazilE164Phone(phoneInput: string): string {
  let digits = unmaskPhone(phoneInput);
  if (digits.startsWith("0") && digits.length > 11) {
    digits = digits.replace(/^0+/, "");
  }
  if (digits.length >= 12 && digits.startsWith("55")) {
    return `+${digits}`;
  }
  if (digits.length >= 10 && digits.length <= 11) {
    return `+55${digits}`;
  }
  return digits.startsWith("+") ? digits : `+${digits}`;
}

type FbLoginOptions = {
  config_id: string;
  auth_type: string;
  response_type: string;
  override_default_response_type: boolean;
  extras: { sessionInfoVersion: number };
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
    window.fbAsyncInit = () => {
      window.FB?.init({
        appId,
        cookie: true,
        xfbml: false,
        version: "v21.0",
      });
      resolve();
    };

    if (document.getElementById("facebook-jssdk")) {
      const waitForFb = window.setInterval(() => {
        if (window.FB) {
          window.clearInterval(waitForFb);
          resolve();
        }
      }, 50);
      window.setTimeout(() => {
        window.clearInterval(waitForFb);
        if (!window.FB) reject(new Error("SDK do Facebook não inicializou."));
      }, 15_000);
      return;
    }

    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.async = true;
    script.defer = true;
    script.src = "https://connect.facebook.net/pt_BR/sdk.js";
    script.onerror = () => reject(new Error("Não foi possível carregar o SDK do Facebook."));
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
  const { appId, configId, isConfigured } = getMetaEmbeddedSignupConfig();
  if (!isConfigured) {
    return {
      kind: "error",
      message: "Integração Meta não configurada (VITE_META_APP_ID / VITE_META_EMBEDDED_SIGNUP_CONFIG_ID).",
    };
  }

  await loadFacebookSdkScript(appId);

  return new Promise((resolve) => {
    let settled = false;

    const finish = (outcome: EmbeddedSignupOutcome) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", listener);
      resolve(outcome);
    };

    const listener = (event: MessageEvent) => {
      if (!event.origin.endsWith("facebook.com")) return;
      try {
        const data = JSON.parse(String(event.data)) as {
          type?: string;
          event?: string;
          data?: { phone_number_id?: string; waba_id?: string; current_step?: string; error_message?: string };
        };

        if (data.type !== "WA_EMBEDDED_SIGNUP") return;

        if (data.event === "FINISH" || data.event === "FINISH_ONLY_WABA") {
          const wabaId = String(data.data?.waba_id ?? "").trim();
          const phoneNumberId = String(data.data?.phone_number_id ?? "").trim();
          if (!wabaId || !phoneNumberId) {
            finish({ kind: "error", message: "Meta não retornou waba_id ou phone_number_id." });
            return;
          }
          finish({ kind: "success", waba_id: wabaId, phone_number_id: phoneNumberId });
          return;
        }

        if (data.event === "CANCEL") {
          finish({ kind: "cancelled" });
          return;
        }

        if (data.event === "ERROR") {
          finish({
            kind: "error",
            message: String(data.data?.error_message ?? "Erro no fluxo da Meta."),
          });
        }
      } catch {
        /* non-JSON */
      }
    };

    window.addEventListener("message", listener);

    window.FB?.login(
      () => {
        /* dados vêm via postMessage */
      },
      {
        config_id: configId,
        auth_type: "rerequest",
        response_type: "code",
        override_default_response_type: true,
        extras: {
          sessionInfoVersion: 3,
        },
      },
    );
  });
}
