/**
 * Utilitário de Criptografia AES-256-GCM para Tokens/Credenciais sensíveis WABA/Twilio
 * Utiliza Web Crypto API nativa do Deno (crypto.subtle).
 */

async function getCryptoKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  // Usa SHA-256 para derivar uma chave de exatamente 256 bits (32 bytes) a partir da string de ambiente
  const hash = await crypto.subtle.digest("SHA-256", keyData);
  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Cifra um texto puro (ex: Auth Token da subconta Twilio) usando AES-256-GCM.
 * Retorna string no formato `v1:ivBase64:ciphertextBase64`
 */
export async function encryptWabaToken(plainText: string, secretKey?: string): Promise<string> {
  const secret = secretKey ?? Deno.env.get("WABA_TOKEN_ENCRYPTION_KEY");
  if (!secret) {
    throw new Error("WABA_TOKEN_ENCRYPTION_KEY não configurada no servidor.");
  }

  const key = await getCryptoKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV para GCM
  const encoder = new TextEncoder();
  const encodedData = encoder.encode(plainText);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodedData
  );

  const ivBase64 = btoa(String.fromCharCode(...iv));
  const cipherBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));

  return `v1:${ivBase64}:${cipherBase64}`;
}

/**
 * Decifra uma string cifrada no formato `v1:ivBase64:ciphertextBase64` de volta para texto puro.
 */
export async function decryptWabaToken(encryptedPayload: string, secretKey?: string): Promise<string> {
  if (!encryptedPayload) return "";
  if (!encryptedPayload.startsWith("v1:")) {
    // Se o valor não estiver cifrado no formato v1, retorna como está (fallback legados)
    return encryptedPayload;
  }

  const secret = secretKey ?? Deno.env.get("WABA_TOKEN_ENCRYPTION_KEY");
  if (!secret) {
    throw new Error("WABA_TOKEN_ENCRYPTION_KEY não configurada no servidor.");
  }

  const parts = encryptedPayload.split(":");
  if (parts.length !== 3) {
    throw new Error("Formato de payload cifrado inválido.");
  }

  const [, ivBase64, cipherBase64] = parts;
  const iv = Uint8Array.from(atob(ivBase64), (c) => c.charCodeAt(0));
  const cipherData = Uint8Array.from(atob(cipherBase64), (c) => c.charCodeAt(0));

  const key = await getCryptoKey(secret);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipherData
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}
