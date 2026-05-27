import { cn } from "@/lib/utils";
import { ResponsivePagedStrip } from "@/components/agenda/ResponsivePagedStrip";

export interface ServicoItem {
  id: string;
  nome: string;
  duracao_minutos: number;
}

interface Props {
  servicos: ServicoItem[];
  selecionados: string[];
  onToggle: (id: string) => void;
  stripClassName?: string;
  bleedClassName?: string;
}

export const ServicosCarousel = ({
  servicos,
  selecionados,
  onToggle,
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
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onToggle(s.id)}
              className={cn(
                "snap-start shrink-0 min-w-[8.5rem] h-14 px-3 rounded-2xl flex flex-col items-center justify-center font-semibold transition active:scale-95 md:h-12",
                sel ? "bg-foreground text-background" : "bg-muted text-foreground",
              )}
            >
              <span className="text-sm leading-tight truncate max-w-[8rem]">{s.nome}</span>
              <span className="text-[10px] opacity-80 mt-0.5">{s.duracao_minutos} min</span>
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
