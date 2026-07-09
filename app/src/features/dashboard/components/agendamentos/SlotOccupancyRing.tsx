import { cn } from "@/lib/utils";

type Props = {
  occupied: number;
  total: number;
  size?: number;
  className?: string;
};

export function SlotOccupancyRing({ occupied, total, size = 48, className }: Props) {
  const pct = total > 0 ? Math.min(1, Math.max(0, occupied / total)) : 0;
  const stroke = 3;
  const r = (size - stroke * 2) / 2;
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - pct);

  return (
    <div
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      aria-label={`${occupied} de ${total} horários ocupados`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-border/50"
        />
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="stroke-accent transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold tabular-nums leading-none text-foreground">
        {occupied}/{total}
      </span>
    </div>
  );
}
