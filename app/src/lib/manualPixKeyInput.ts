/** Chave PIX manual: apenas letras e números (sem espaços ou pontuação). */
export function sanitizeManualPixKeyInput(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "");
}
