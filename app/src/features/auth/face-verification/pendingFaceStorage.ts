const STORAGE_KEY = "sentinela:pending_face_embedding";

export type PendingFacePayload = {
  embedding: number[];
};

export function savePendingFaceEmbedding(embedding: number[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ embedding }));
  } catch {
    /* ignore quota errors */
  }
}

export function loadPendingFaceEmbedding(): PendingFacePayload | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingFacePayload;
    if (!Array.isArray(parsed.embedding) || parsed.embedding.length !== 128) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingFaceEmbedding() {
  sessionStorage.removeItem(STORAGE_KEY);
}
