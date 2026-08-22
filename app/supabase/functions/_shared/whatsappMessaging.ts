/**
 * Camada de abstração de envio WhatsApp por barbearia (Twilio ou Infobip).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendWhatsAppTemplate } from "./twilioWhatsapp.ts";
import { resolveBarbershopTwilioCredentials } from "./barbershopTwilioCredentials.ts";
import { sendWhatsAppTemplateInfobip } from "./infobipWhatsapp.ts";
import {
  resolveBarbershopInfobipCredentials,
  resolveBarbershopMessagingProvider,
  type WhatsAppMessagingProvider,
} from "./barbershopMessagingProvider.ts";

export type WhatsAppTemplateKind = "lembrete_d1" | "lembrete_3h" | "alerta_profissional";

export type SendTemplateResult = {
  externalMessageId: string;
  provider: WhatsAppMessagingProvider;
  status: string;
};

type TemplateVariables = {
  clienteNome?: string;
  barbeariaNome?: string;
  dataHora?: string;
  agendamentoId?: string;
  hora?: string;
  mensagem?: string;
};

function twilioContentSid(kind: WhatsAppTemplateKind): string {
  const envMap: Record<WhatsAppTemplateKind, string | undefined> = {
    lembrete_d1: Deno.env.get("TWILIO_CONTENT_SID_REMINDER")?.trim(),
    lembrete_3h: Deno.env.get("TWILIO_CONTENT_SID_LEMBRETE_3H")?.trim(),
    alerta_profissional: Deno.env.get("TWILIO_CONTENT_SID_PROFESSIONAL_ALERT")?.trim(),
  };
  const sid = envMap[kind];
  if (!sid) {
    throw new Error(`Template Twilio não configurado para ${kind}.`);
  }
  return sid;
}

function infobipTemplateName(kind: WhatsAppTemplateKind): string {
  const envMap: Record<WhatsAppTemplateKind, string | undefined> = {
    lembrete_d1: Deno.env.get("INFOBIP_TEMPLATE_REMINDER")?.trim(),
    lembrete_3h: Deno.env.get("INFOBIP_TEMPLATE_LEMBRETE_3H")?.trim(),
    alerta_profissional: Deno.env.get("INFOBIP_TEMPLATE_PROFESSIONAL_ALERT")?.trim(),
  };
  const name = envMap[kind];
  if (!name) {
    throw new Error(`Template Infobip não configurado para ${kind}.`);
  }
  return name;
}

function twilioVariables(kind: WhatsAppTemplateKind, variables: TemplateVariables): Record<string, string> {
  if (kind === "lembrete_d1") {
    return {
      "1": variables.clienteNome ?? "",
      "2": variables.barbeariaNome ?? "",
      "3": variables.dataHora ?? "",
      "4": variables.agendamentoId ?? "",
    };
  }
  if (kind === "lembrete_3h") {
    return {
      "1": variables.clienteNome ?? "",
      "2": variables.hora ?? "",
    };
  }
  return { "1": variables.mensagem ?? "" };
}

function infobipPlaceholders(kind: WhatsAppTemplateKind, variables: TemplateVariables): string[] {
  if (kind === "lembrete_d1") {
    return [
      variables.clienteNome ?? "",
      variables.barbeariaNome ?? "",
      variables.dataHora ?? "",
    ];
  }
  if (kind === "lembrete_3h") {
    return [variables.clienteNome ?? "", variables.hora ?? ""];
  }
  return [variables.mensagem ?? ""];
}

export async function sendWhatsAppTemplateForBarbershop(
  supabase: SupabaseClient,
  params: {
    to: string;
    templateKind: WhatsAppTemplateKind;
    variables: TemplateVariables;
    barbeariaId: string;
    overrideProvider?: WhatsAppMessagingProvider;
  },
): Promise<SendTemplateResult> {
  const provider =
    params.overrideProvider ?? (await resolveBarbershopMessagingProvider(supabase, params.barbeariaId));

  if (provider === "infobip") {
    const credentials = await resolveBarbershopInfobipCredentials(supabase, params.barbeariaId);
    const result = await sendWhatsAppTemplateInfobip({
      to: params.to,
      templateName: infobipTemplateName(params.templateKind),
      placeholders: infobipPlaceholders(params.templateKind, params.variables),
      credentials,
    });
    return {
      externalMessageId: result.messageId,
      provider: "infobip",
      status: result.status,
    };
  }

  const shopCredentials = await resolveBarbershopTwilioCredentials(supabase, params.barbeariaId);
  const result = await sendWhatsAppTemplate({
    to: params.to,
    contentSid: twilioContentSid(params.templateKind),
    contentVariables: twilioVariables(params.templateKind, params.variables),
    credentials: shopCredentials,
  });

  return {
    externalMessageId: result.sid,
    provider: "twilio",
    status: result.status,
  };
}

export type { WhatsAppMessagingProvider };
