const BOOKING_CACHE_TTL_MS = 5 * 60 * 1000;

type BookingStaticCache = {
  barbearia: {
    id: string;
    nome: string;
    logo_url: string | null;
    ativa: boolean;
    telefone: string | null;
    allow_client_public_booking: boolean;
  };
  barbeiros: unknown[];
  slotInterval: number;
  showServicePrices: boolean;
  fromYmd: string;
  toYmd: string;
  fetchedAt: number;
};

const staticCache = new Map<string, BookingStaticCache>();

function isFresh(fetchedAt: number) {
  return Date.now() - fetchedAt < BOOKING_CACHE_TTL_MS;
}

export function getBookingStaticCache(slug: string, fromYmd: string, toYmd: string) {
  const entry = staticCache.get(slug);
  if (!entry) return null;
  if (entry.fromYmd !== fromYmd || entry.toYmd !== toYmd) return null;
  if (!isFresh(entry.fetchedAt)) return null;
  return entry;
}

export function setBookingStaticCache(slug: string, entry: Omit<BookingStaticCache, "fetchedAt">) {
  staticCache.set(slug, { ...entry, fetchedAt: Date.now() });
}

export function clearBookingStaticCache(slug?: string) {
  if (slug) staticCache.delete(slug);
  else staticCache.clear();
}
