/** Tempo em que dados em cache do painel são exibidos sem spinner antes de revalidar em background. */
export const PANEL_CACHE_TTL_MS = 5 * 60 * 1000;

export function isCacheFresh(fetchedAt: number | null, ttlMs = PANEL_CACHE_TTL_MS) {
  return fetchedAt != null && Date.now() - fetchedAt < ttlMs;
}
