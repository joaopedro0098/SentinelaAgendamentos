// Teste de integração: simula um cliente novo (sem conversa prévia) enviando
// a primeira mensagem para uma barbearia, e garante que:
//  1. A Edge Function responde 200
//  2. Uma conversa nova é criada (conversation_id presente)
//  3. O n8n configurado responde com texto (ai_reply preenchido) OU
//     que o erro do n8n é reportado de forma clara em n8n_error.
//
// Como rodar:
//   Use a ferramenta supabase--test_edge_functions com {"functions":["send-message"]}.

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const ANON_KEY =
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

// Slug da barbearia que tem n8n_webhook_url configurado (sua "Don Pepa").
const BARBERSHOP_SLUG = "joaopedro-suporte98";

async function callSendMessage(body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON_KEY}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, json: json as Record<string, unknown> | null, raw: text };
}

Deno.test("primeiro contato: cria conversa e dispara o n8n", async () => {
  // visitor_id novo a cada execução -> garante que NÃO existe conversa prévia
  const visitorId = crypto.randomUUID();

  const { status, json, raw } = await callSendMessage({
    barbershop_slug: BARBERSHOP_SLUG,
    visitor_id: visitorId,
    message: "oi",        // mensagem inicial qualquer (ativa o bot)
  });

  console.log("send-message resposta:", { status, body: json ?? raw });

  assertEquals(status, 200, `Edge Function retornou ${status}: ${raw}`);
  assert(json, "Resposta sem corpo JSON");
  assertEquals(json!.success, true);
  assert(
    typeof json!.conversation_id === "string" && (json!.conversation_id as string).length > 10,
    "conversation_id ausente — a conversa não foi criada",
  );

  // O n8n deve ter respondido. Se não respondeu, n8n_error explica o motivo
  // (workflow inativo, URL errada, timeout, etc.) — falhamos com mensagem clara.
  if (!json!.ai_reply) {
    throw new Error(
      `n8n não respondeu. n8n_error=${JSON.stringify(json!.n8n_error)}. ` +
        `Verifique se o workflow está ATIVO no n8n (toggle Active) e se a URL ` +
        `é a de produção (/webhook/...) — a URL /webhook-test/ só funciona ` +
        `enquanto você clica em "Test workflow" no editor.`,
    );
  }

  assert(
    typeof json!.ai_reply === "string" && (json!.ai_reply as string).trim().length > 0,
    "ai_reply veio vazio",
  );
});

Deno.test("validação: rejeita requisição sem barbershop_slug", async () => {
  const { status, json } = await callSendMessage({
    visitor_id: crypto.randomUUID(),
    message: "oi",
  });
  assertEquals(status, 400);
  assert(json?.error, "Esperava campo error na resposta 400");
});

Deno.test("validação: rejeita requisição sem mensagem", async () => {
  const { status, json } = await callSendMessage({
    barbershop_slug: BARBERSHOP_SLUG,
    visitor_id: crypto.randomUUID(),
    message: "",
  });
  assertEquals(status, 400);
  assert(json?.error, "Esperava campo error na resposta 400");
});
