// Edge Function: send-message
// Recebe uma mensagem do cliente, salva no banco, encaminha para o webhook do n8n
// global (platform_settings) e salva a resposta da IA.
//
// PAYLOAD enviado para o n8n (POST JSON):
// {
//   "barbershop_id": "uuid",
//   "barbershop_slug": "demo",
//   "barbershop_name": "Barbearia Demo",
//   "conversation_id": "uuid",
//   "customer_phone": "(11) 91234-5678",
//   "customer_name": "João" | null,
//   "message": "Texto que o cliente enviou",
//   "message_id": "uuid",
//   "timestamp": "2026-04-27T18:00:00.000Z",
//   "history": [ { "sender": "customer"|"ai", "content": "...", "created_at": "..." }, ... ]  // últimas 20
// }
//
// RESPOSTA esperada do n8n (qualquer um destes formatos):
// { "reply": "texto da IA" }
// { "message": "texto da IA" }
// { "output": "texto da IA" }
// "texto da IA"  (string pura)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SendMessageBody {
  barbershop_slug: string;
  visitor_id: string;            // ID anônimo do navegador (uuid)
  customer_phone?: string | null; // opcional — preenchido depois que a IA pedir
  customer_name?: string | null;
  message: string;
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '');
}

function formatPhoneDisplay(raw: string): string {
  const d = normalizePhone(raw);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}

/** n8n com "Respond Immediately" devolve isto antes do fluxo terminar — não é resposta da IA. */
function isN8nImmediateAck(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  if (typeof obj.message !== 'string') return false;
  return /^workflow was started$/i.test(obj.message.trim());
}

function extractReply(data: unknown): string | null {
  if (typeof data === 'string') return data;
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (typeof obj.reply === 'string') return obj.reply;
    if (typeof obj.message === 'string') {
      const m = obj.message.trim();
      if (/^workflow was started$/i.test(m)) return null;
      return obj.message;
    }
    if (typeof obj.output === 'string') return obj.output;
    if (typeof obj.text === 'string') return obj.text;
    // n8n às vezes devolve [{ output: "..." }]
    if (Array.isArray(data) && data.length > 0) return extractReply(data[0]);
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body: SendMessageBody = await req.json();

    // ---------- Validação ----------
    if (!body.barbershop_slug || typeof body.barbershop_slug !== 'string') {
      return new Response(JSON.stringify({ error: 'barbershop_slug é obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!body.visitor_id || typeof body.visitor_id !== 'string' || body.visitor_id.length < 8) {
      return new Response(JSON.stringify({ error: 'visitor_id é obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const phoneDigits = body.customer_phone ? normalizePhone(body.customer_phone) : '';
    const hasValidPhone = phoneDigits.length === 10 || phoneDigits.length === 11;
    if (!body.message || typeof body.message !== 'string' || body.message.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Mensagem vazia' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (body.message.length > 2000) {
      return new Response(JSON.stringify({ error: 'Mensagem muito longa (máx. 2000)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const phoneFormatted = hasValidPhone ? formatPhoneDisplay(body.customer_phone!) : null;
    // Identificador único da conversa: telefone se houver, senão visitor:uuid
    const conversationKey = phoneFormatted ?? `visitor:${body.visitor_id}`;

    // ---------- Buscar barbearia ----------
    const { data: shop, error: shopErr } = await supabase
      .from('barbershops')
      .select('id, slug, display_name, welcome_message, sheet_url')
      .eq('slug', body.barbershop_slug)
      .maybeSingle();

    if (shopErr || !shop) {
      return new Response(JSON.stringify({ error: 'Barbearia não encontrada' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ---------- Upsert conversa ----------
    // 1) tenta achar pela chave atual
    let { data: conv } = await supabase
      .from('conversations')
      .select('id, customer_name, customer_phone')
      .eq('barbershop_id', shop.id)
      .eq('customer_phone', conversationKey)
      .maybeSingle();

    // 2) se não achou e agora temos telefone, tenta migrar a conversa do visitor:
    if (!conv && phoneFormatted) {
      const { data: visitorConv } = await supabase
        .from('conversations')
        .select('id, customer_name, customer_phone')
        .eq('barbershop_id', shop.id)
        .eq('customer_phone', `visitor:${body.visitor_id}`)
        .maybeSingle();
      if (visitorConv) {
        await supabase
          .from('conversations')
          .update({ customer_phone: phoneFormatted })
          .eq('id', visitorConv.id);
        conv = { ...visitorConv, customer_phone: phoneFormatted };
      }
    }

    if (!conv) {
      const { data: newConv, error: convErr } = await supabase
        .from('conversations')
        .insert({
          barbershop_id: shop.id,
          customer_phone: conversationKey,
          customer_name: body.customer_name ?? null,
        })
        .select('id, customer_name, customer_phone')
        .single();
      if (convErr) throw convErr;
      conv = newConv;
    } else if (body.customer_name && body.customer_name !== conv.customer_name) {
      await supabase.from('conversations').update({ customer_name: body.customer_name }).eq('id', conv.id);
    }

    // ---------- Salvar mensagem do cliente ----------
    const { data: customerMsg, error: msgErr } = await supabase
      .from('messages')
      .insert({
        conversation_id: conv!.id,
        barbershop_id: shop.id,
        sender: 'customer',
        content: body.message.trim(),
        status: 'sent',
      })
      .select('id, created_at')
      .single();
    if (msgErr) throw msgErr;

    // ---------- Buscar histórico (últimas 20) ----------
    const { data: history } = await supabase
      .from('messages')
      .select('sender, content, created_at')
      .eq('conversation_id', conv!.id)
      .order('created_at', { ascending: false })
      .limit(20);

    const historyAsc = (history ?? []).reverse();

    // ---------- Encaminhar ao n8n ----------
    // URL única da plataforma (admin configura em platform_settings id=1).
    // Opcional: secrets N8N_WEBHOOK_URL na Edge Function; fallback fixo em último caso.
    const { data: plat, error: platErr } = await supabase
      .from('platform_settings')
      .select('n8n_webhook_url')
      .eq('id', 1)
      .maybeSingle();

    const fromDb = (!platErr && plat?.n8n_webhook_url?.trim()) ? plat.n8n_webhook_url.trim() : '';
    const fromEnv = (Deno.env.get('N8N_WEBHOOK_URL') ?? '').trim();
    const FALLBACK_N8N_WEBHOOK_URL =
      'https://n8n.sentinelagendamentos.com/webhook/agente';

    const N8N_WEBHOOK_URL = fromDb || fromEnv || FALLBACK_N8N_WEBHOOK_URL;
    let aiReply: string | null = null;
    let n8nError: string | null = null;

    try {
      const n8nPayload = {
        chatInput: body.message.trim(),
        sheet_url: shop.sheet_url,
        barbershop_id: shop.id,
        barbershop_slug: shop.slug,
        barbershop_name: shop.display_name,
        conversation_id: conv!.id,
        sessionId: conv!.id,
        visitor_id: body.visitor_id,
        customer_phone: phoneFormatted,
        has_phone: !!phoneFormatted,
        customer_name: body.customer_name ?? conv!.customer_name ?? null,
        message: body.message.trim(),
        message_id: customerMsg.id,
        timestamp: customerMsg.created_at,
        history: historyAsc,
      };

      console.log('[send-message] POST →', N8N_WEBHOOK_URL, 'shop:', shop.slug);
      const n8nRes = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(n8nPayload),
      });

      const ct = n8nRes.headers.get('content-type') ?? '';
      const raw = ct.includes('application/json') ? await n8nRes.json() : await n8nRes.text();
      console.log('[send-message] n8n status:', n8nRes.status, 'body:', typeof raw === 'string' ? raw.slice(0, 200) : JSON.stringify(raw).slice(0, 200));

      if (n8nRes.ok) {
        aiReply = extractReply(raw);
        if (!aiReply && isN8nImmediateAck(raw)) {
          n8nError =
            'O n8n respondeu só "Workflow was started" (modo imediato). No workflow, use "Respond to Webhook" no final com JSON {"reply":"texto da IA"} ou mude o Webhook para responder com o texto real (não "Immediately").';
        } else if (!aiReply) {
          n8nError = 'n8n respondeu OK mas sem campo reply/message/output/text';
        }
      } else {
        n8nError = `n8n respondeu ${n8nRes.status}: ${typeof raw === 'string' ? raw.slice(0, 200) : JSON.stringify(raw).slice(0, 200)}`;
        console.error('[send-message]', n8nError);
      }
    } catch (e) {
      n8nError = e instanceof Error ? e.message : 'Falha ao chamar n8n';
      console.error('[send-message] n8n fetch failed (servidor offline?):', n8nError);
    }

    // ---------- Salvar resposta da IA ----------
    if (aiReply) {
      await supabase.from('messages').insert({
        conversation_id: conv!.id,
        barbershop_id: shop.id,
        sender: 'ai',
        content: aiReply,
        status: 'sent',
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        conversation_id: conv!.id,
        ai_reply: aiReply,
        n8n_error: n8nError,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('send-message error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
