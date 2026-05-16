export function isInvalidLoginCredentials(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("invalid login credentials") ||
    m.includes("invalid credentials") ||
    (m.includes("credenciais") && (m.includes("inválid") || m.includes("invalid")))
  );
}
