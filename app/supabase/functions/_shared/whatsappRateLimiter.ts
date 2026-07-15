/**
 * Rate limiting simples para envio outbound WhatsApp (lembretes D-1 em lote).
 *
 * TODO(rate-limit-migration): para throughput maior ou por-conta, substitua este módulo
 * por um rate limiter distribuído — a chamada continua sendo processInBatches().
 */

export type BatchThrottleOptions = {
  batchSize: number;
  delayMs: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getOutboundThrottleOptions(): BatchThrottleOptions {
  const batchSize = Number(Deno.env.get("TWILIO_OUTBOUND_BATCH_SIZE") ?? "10");
  const delayMs = Number(Deno.env.get("TWILIO_OUTBOUND_DELAY_MS") ?? "500");
  return {
    batchSize: Number.isFinite(batchSize) && batchSize > 0 ? Math.floor(batchSize) : 10,
    delayMs: Number.isFinite(delayMs) && delayMs >= 0 ? Math.floor(delayMs) : 500,
  };
}

/**
 * Processa itens em lotes com pausa entre lotes.
 * `handler` pode lançar — o erro é propagado ao caller (não interrompe o lote inteiro
 * a menos que o caller trate item a item).
 */
export async function processInBatches<T, R>(
  items: T[],
  options: BatchThrottleOptions,
  handler: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  const { batchSize, delayMs } = options;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    for (const item of batch) {
      results.push(await handler(item));
    }
    if (i + batchSize < items.length && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return results;
}
