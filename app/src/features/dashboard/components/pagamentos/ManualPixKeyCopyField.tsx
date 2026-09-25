import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  pixKey: string;
  className?: string;
};

export function ManualPixKeyCopyField({ pixKey, className }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!pixKey.trim()) return;
    try {
      await navigator.clipboard.writeText(pixKey.trim());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [pixKey]);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="min-w-0 flex-1 rounded-xl border border-border/70 bg-background/60 px-3 py-2.5 text-sm truncate">
        {pixKey.trim() || "Nenhuma chave cadastrada em Pagamentos."}
      </div>
      <button
        type="button"
        disabled={!pixKey.trim()}
        aria-label="Copiar chave Pix"
        onClick={() => void handleCopy()}
        className={cn(
          "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          "bg-primary/15 text-primary hover:bg-primary/25 transition-colors",
          "disabled:opacity-40 disabled:pointer-events-none",
        )}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}
