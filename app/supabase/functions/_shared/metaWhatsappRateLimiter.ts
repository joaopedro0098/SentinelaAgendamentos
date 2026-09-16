/**
 * Rate limiting outbound Meta por barbearia/WABA **dentro de uma única invocação** do cron.
 * Edge Functions são stateless ([Supabase Architecture](https://supabase.com/docs/guides/functions/architecture)):
 * não há memória compartilhada entre invocações concorrentes — throttle cross-process exige Postgres.
 */

export type BatchThrottleOptions = {
  batchSize: number;
  delayMs: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getMetaOutboundThrottleOptions(): BatchThrottleOptions {
  const batchSize = Number(Deno.env.get("META_OUTBOUND_BATCH_SIZE") ?? "10");
  const delayMs = Number(Deno.env.get("META_OUTBOUND_DELAY_MS") ?? "500");
  return {
    batchSize: Number.isFinite(batchSize) && batchSize > 0 ? Math.floor(batchSize) : 10,
    delayMs: Number.isFinite(delayMs) && delayMs >= 0 ? Math.floor(delayMs) : 500,
  };
}

async function processSequentialBatch<T, R>(
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

/**
 * Agrupa itens por chave (ex.: barbearia_id) e aplica throttle de lote/pausa
 * separadamente em cada grupo — limites Meta são por número/WABA, não globais.
 */
export async function processInBatchesByKey<T, R>(
  items: T[],
  keyFn: (item: T) => string,
  options: BatchThrottleOptions,
  handler: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item) || "_unknown";
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }

  const orderedKeys = [...groups.keys()].sort();
  const results: R[] = [];

  for (const key of orderedKeys) {
    const groupItems = groups.get(key) ?? [];
    const groupResults = await processSequentialBatch(groupItems, options, handler);
    results.push(...groupResults);
  }

  return results;
}
