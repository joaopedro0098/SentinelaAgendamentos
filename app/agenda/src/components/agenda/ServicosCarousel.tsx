import { cn } from "@/lib/utils";
import { formatServicePrice } from "@/lib/servicePrice";
import { ResponsivePagedStrip } from "@/components/agenda/ResponsivePagedStrip";

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
}

export const ServicosCarousel = ({
  servicos,
  selecionados,
  onToggle,
  showPrices = false,
  stripClassName,
  bleedClassName,
}: Props) => {
  if (!servicos.length) return null;
  const total = servicos.filter((s) => selecionados.includes(s.id)).reduce((a, s) => a + s.duracao_minutos, 0);
  return (
    <div>
      <ResponsivePagedStrip bleedClassName={bleedClassName} mobileClassName={stripClassName}>
        {servicos.map((s) => {
          const sel = selecionados.includes(s.id);
          const priceLabel =
            showPrices && (s.preco_centavos ?? 0) > 0 ? formatServicePrice(s.preco_centavos ?? 0) : null;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onToggle(s.id)}
              className={cn(
                "snap-start shrink-0 min-w-[8.5rem] min-h-14 px-3 py-2 rounded-2xl flex flex-col items-center justify-center font-semibold transition active:scale-95 md:min-h-12",
                sel ? "bg-foreground text-background" : "bg-muted text-foreground",
              )}
            >
              <span className="text-sm leading-tight truncate max-w-[8rem]">{s.nome}</span>
              {priceLabel && (
                <span className="text-[10px] font-normal opacity-70 mt-0.5 leading-none">{priceLabel}</span>
              )}
            </button>
          );
        })}
      </ResponsivePagedStrip>
      {total > 0 && (
        <p className="mt-1.5 text-[11px] text-muted-foreground text-center md:text-left">
          Tempo total: <b className="text-foreground">{total} min</b>
        </p>
      )}
    </div>
  );
};
