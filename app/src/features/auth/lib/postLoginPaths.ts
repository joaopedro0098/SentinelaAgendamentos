import { getBarberPostLoginPath } from "@/lib/pwaInstall";

export type LoginRole = "patient" | "professional";

export function getPatientPostLoginPath(from?: { pathname?: string; search?: string } | null) {
  const pathname = from?.pathname?.trim();
  if (pathname?.startsWith("/agendar/")) {
    return `${pathname}${from?.search ?? ""}`;
  }
  return "/";
}

export function getPostLoginPathForRole(
  role: LoginRole,
  from?: { pathname?: string; search?: string } | null,
) {
  return role === "patient" ? getPatientPostLoginPath(from) : getBarberPostLoginPath(from);
}
