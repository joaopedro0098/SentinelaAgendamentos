const STORAGE_KEY = "sentinela:pending_face_embedding";

export type PendingFacePayload = {
  embedding: number[];
  email?: string;
};

function readStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function savePendingFaceEmbedding(embedding: number[], email?: string) {
  const storage = readStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ embedding, email: email?.trim().toLowerCase() }));
  } catch {
    /* ignore quota errors */
  }
}

export function loadPendingFaceEmbedding(expectedEmail?: string): PendingFacePayload | null {
  const storage = readStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingFacePayload;
    if (!Array.isArray(parsed.embedding) || parsed.embedding.length !== 128) return null;
    const normExpected = expectedEmail?.trim().toLowerCase();
    if (normExpected && parsed.email && parsed.email !== normExpected) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingFaceEmbedding() {
  readStorage()?.removeItem(STORAGE_KEY);
}
