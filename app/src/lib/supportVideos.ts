export type SupportVideo = {
  title: string;
  /** ID do YouTube (ex.: dQw4w9WgXcQ) ou URL completa (youtube.com / youtu.be) */
  youtubeIdOrUrl: string;
};

/** Troque os valores vazios pelo ID ou link do YouTube quando os vídeos estiverem prontos. */
export const SUPPORT_VIDEOS: SupportVideo[] = [
  { title: "Primeiros passos no Sentinela", youtubeIdOrUrl: "" },
  { title: "Agenda e agendamentos", youtubeIdOrUrl: "" },
  { title: "Configurações e link para clientes", youtubeIdOrUrl: "" },
];

export function resolveYouTubeVideoId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.slice(1).split("/")[0] || null;
    }
    if (url.hostname.includes("youtube.com")) {
      return url.searchParams.get("v") || url.pathname.split("/").filter(Boolean).pop() || null;
    }
  } catch {
    return null;
  }

  return null;
}
