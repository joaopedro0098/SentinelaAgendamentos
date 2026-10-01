import { ADMIN_NICHE_PREVIEW_OPTIONS } from "@/features/dashboard/lib/adminNichePreview";
import { useAdminNichePreview } from "@/providers/AdminNichePreviewProvider";
import { cn } from "@/lib/utils";

export function AdminNichePreviewSelector() {
  const preview = useAdminNichePreview();

  return (
    <div className="rounded-xl border border-border/70 bg-card p-4 shadow-soft">
      <p className="text-sm font-medium text-foreground">Visualizar como nicho</p>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
        Só afeta sua sessão de admin ao desenvolver telas por especialidade. A escolha fica salva
        neste navegador (último nicho apenas).
      </p>
      <div
        className="mt-3 flex flex-wrap gap-2"
        role="group"
        aria-label="Selecionar nicho para visualização"
      >
        {ADMIN_NICHE_PREVIEW_OPTIONS.map((option) => {
          const selected = preview.enabled && preview.nicheId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() => preview.setNicheId(option.id)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/80 bg-background text-foreground hover:bg-secondary/60",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
