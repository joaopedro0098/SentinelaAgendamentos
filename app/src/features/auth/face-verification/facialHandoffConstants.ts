/** TTL padrão alinhado ao backend (10 min). */
export const FACIAL_HANDOFF_TTL_MS = 10 * 60 * 1000;

export const FACIAL_HANDOFF_POLL_INTERVAL_MS = 2000;

export const FACIAL_HANDOFF_BROADCAST_EVENT = "facial_handoff_completed";

export function facialHandoffChannelName(sessionId: string) {
  return `sentinela:facial-handoff:${sessionId}`;
}

export function facialHandoffPublicPath(sessionId: string) {
  return `/verificacao-facial?session=${encodeURIComponent(sessionId)}`;
}
