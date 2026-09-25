import { cn } from "@/lib/utils";
import { formatTotalServiceMinutes } from "@/lib/formatDuration";
import { formatServicePrice } from "@/lib/servicePrice";
import { BookingScrollChipList } from "@/components/agenda/BookingScrollChipList";

export interface ServicoItem {
  id: string;
  nome: string;
  duracao_minutos: number;
  preco_centavos?: number;
}

interface Props {
  servicos: ServicoItem[];
  selecionados: string[];
  onToggle: (id: string) => void;
  showPrices?: boolean;
  stripClassName?: string;
  bleedClassName?: string;
  /** Lista vertical com scroll próprio (3+ itens no painel e no link público). */
  vertical?: boolean;
  /** Força coluna vertical mesmo com poucos itens (modal do painel). */
  forceVertical?: boolean;
  /** Coluna direita no layout lado a lado (3+ profissionais). */
  inSplitColumn?: boolean;
}

function formatPanelServicePrice(cents: number) {
  const value = cents > 0 ? formatServicePrice(cents) : "";
  if (value) return value;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(0);
}

function renderServicoButtons(
  servicos: ServicoItem[],
  selecionados: string[],
  onToggle: (id: string) => void,
  showPrices: boolean,
) {
  return servicos.map((s) => {
    const sel = selecionados.includes(s.id);
    const priceLabel = showPrices ? formatPanelServicePrice(s.preco_centavos ?? 0) : null;
    return (
      <button
        key={s.id}
        type="button"
        onClick={() => onToggle(s.id)}
        className={cn(
          "snap-start shrink-0 min-w-[8.5rem] w-max max-w-[calc(100vw-2.5rem)] min-h-14 h-auto px-3 py-2 rounded-2xl font-semibold transition active:scale-95 md:min-h-12 md:max-w-none",
          showPrices
            ? "flex flex-row items-center justify-between gap-3 text-left"
            : "flex flex-col items-center justify-center",
          sel
            ? "bg-foreground/50 text-white ring-1 ring-foreground/15 dark:bg-foreground/16 dark:text-foreground dark:ring-foreground/15"
            : "bg-muted text-foreground",
        )}
      >
        <span
          className={cn(
            "text-sm leading-snug whitespace-normal break-words",
            showPrices ? "min-w-0 flex-1" : "text-center",
          )}
        >
          {s.nome}
        </span>
        {priceLabel ? (
          <span
            className={cn(
              "shrink-0 text-xs font-normal tabular-nums leading-none",
              showPrices ? "opacity-90" : "opacity-70 mt-0.5",
            )}
          >
            {priceLabel}
          </span>
        ) : null}
      </button>
    );
  });
}

export const ServicosCarousel = ({
  servicos,
  selecionados,
  onToggle,
  showPrices = false,
  stripClassName,
  bleedClassName,
  vertical = false,
  forceVertical = false,
  inSplitColumn = false,
}: Props) => {
  if (!servicos.length) return null;
  const total = servicos.filter((s) => selecionados.includes(s.id)).reduce((a, s) => a + s.duracao_minutos, 0);
  const buttons = renderServicoButtons(servicos, selecionados, onToggle, showPrices);
  const useStackedList = inSplitColumn && servicos.length < 3;

  return (
    <div>
      {useStackedList ? (
        <div className="flex flex-col gap-2 [&>button]:w-full [&>button]:min-w-0 [&>button]:max-w-none">
          {buttons}
        </div>
      ) : (
        <BookingScrollChipList
          vertical={vertical || forceVertical}
          verticalScrollAfter={3}
          verticalItemCount={servicos.length}
          bleedClassName={bleedClassName}
          mobileClassName={stripClassName}
        >
          {buttons}
        </BookingScrollChipList>
      )}
      {total > 0 && (
        <p className="mt-1.5 text-[11px] text-muted-foreground text-center md:text-left">
          Tempo total: <b className="text-foreground">{formatTotalServiceMinutes(total)}</b>
        </p>
      )}
    </div>
  );
};
