/**
 * Cliente Graph API Meta: message_templates (GET/POST/UPDATE).
 * Sem Twilio/Infobip — token Bearer por tenant.
 */
import { getMetaGraphConfig } from "./metaWabaConnect.ts";
import type { MetaTemplateComponents } from "./metaTemplateProduct.ts";

export type MetaMessageTemplateNode = {
  id?: string;
  name?: string;
  language?: string;
  status?: string;
  category?: string;
  components?: unknown[];
  rejected_reason?: string;
};

export type MetaGraphErrorBody = {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    error_user_msg?: string;
    error_user_title?: string;
  };
};

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function fetchMessageTemplates(
  accessToken: string,
  wabaId: string,
  query?: Record<string, string>,
): Promise<MetaMessageTemplateNode[]> {
  const { apiVersion } = getMetaGraphConfig();
  const url = new URL(`https://graph.facebook.com/${apiVersion}/${wabaId}/message_templates`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }

  const items: MetaMessageTemplateNode[] = [];
  let nextUrl: string | null = url.toString();

  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: authHeaders(accessToken) });
    const data = await res.json().catch(() => ({})) as {
      data?: MetaMessageTemplateNode[];
      paging?: { next?: string };
    } & MetaGraphErrorBody;

    if (!res.ok) {
      throw new MetaGraphRequestError(res.status, data);
    }

    items.push(...(data.data ?? []));
    nextUrl = data.paging?.next ?? null;
  }

  return items;
}

export async function fetchApprovedUtilityTemplates(
  accessToken: string,
  wabaId: string,
): Promise<MetaMessageTemplateNode[]> {
  return fetchMessageTemplates(accessToken, wabaId, {
    status: "APPROVED",
    category: "UTILITY",
  });
}

export type CreateMessageTemplateResult = {
  id: string;
  status: string;
  category?: string;
};

export async function createMessageTemplate(
  accessToken: string,
  wabaId: string,
  payload: {
    name: string;
    language: string;
    category: "UTILITY";
    components: MetaTemplateComponents;
  },
): Promise<CreateMessageTemplateResult> {
  const { apiVersion } = getMetaGraphConfig();
  const url = `https://graph.facebook.com/${apiVersion}/${wabaId}/message_templates`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: payload.name,
      language: payload.language,
      category: payload.category,
      parameter_format: "POSITIONAL",
      components: payload.components,
    }),
  });

  const data = await res.json().catch(() => ({})) as CreateMessageTemplateResult & MetaGraphErrorBody;

  if (!res.ok || !data.id) {
    throw new MetaGraphRequestError(res.status, data);
  }

  return {
    id: String(data.id),
    status: String(data.status ?? "PENDING"),
    category: data.category,
  };
}

export type UpdateMessageTemplateResult = {
  success?: boolean;
  id?: string;
  status?: string;
};

/** Reenvia template existente para revisão (mesmo ID Meta). */
export async function updateMessageTemplate(
  accessToken: string,
  metaTemplateId: string,
  payload: {
    category: "UTILITY";
    components: MetaTemplateComponents;
  },
): Promise<UpdateMessageTemplateResult> {
  const { apiVersion } = getMetaGraphConfig();
  const url = `https://graph.facebook.com/${apiVersion}/${metaTemplateId}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      category: payload.category,
      parameter_format: "POSITIONAL",
      components: payload.components,
    }),
  });

  const data = await res.json().catch(() => ({})) as UpdateMessageTemplateResult & MetaGraphErrorBody;

  if (!res.ok) {
    throw new MetaGraphRequestError(res.status, data);
  }

  return data;
}

export async function fetchMessageTemplateById(
  accessToken: string,
  metaTemplateId: string,
  fields = "id,name,language,status,category,rejected_reason,components",
): Promise<MetaMessageTemplateNode | null> {
  const { apiVersion } = getMetaGraphConfig();
  const url = new URL(`https://graph.facebook.com/${apiVersion}/${metaTemplateId}`);
  url.searchParams.set("fields", fields);

  const res = await fetch(url.toString(), { headers: authHeaders(accessToken) });
  const data = await res.json().catch(() => ({})) as MetaMessageTemplateNode & MetaGraphErrorBody;

  if (!res.ok) {
    if (res.status === 404) return null;
    throw new MetaGraphRequestError(res.status, data);
  }

  return data;
}

export class MetaGraphRequestError extends Error {
  status: number;
  metaCode?: number;
  userMessage?: string;

  constructor(status: number, body: MetaGraphErrorBody) {
    const msg = body.error?.error_user_msg ?? body.error?.message ?? "Erro na Graph API Meta.";
    super(msg);
    this.name = "MetaGraphRequestError";
    this.status = status;
    this.metaCode = body.error?.code;
    this.userMessage = body.error?.error_user_msg ?? body.error?.message;
  }
}
