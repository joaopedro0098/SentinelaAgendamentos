import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  busy?: boolean;
  onToggle: () => void;
  hint?: string;
};

export function PermissionToggleRow({ id, label, description, checked, disabled, busy, onToggle, hint }: Props) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="text-sm font-medium leading-none">
          {label}
        </label>
        <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{description}</p>
        {hint && <p className="mt-0.5 text-[11px] leading-tight text-destructive">{hint}</p>}
      </div>
      {busy ? (
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={onToggle}
          className={cn(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors",
            checked ? "border-primary bg-primary" : "border-border bg-input",
            disabled && "opacity-60",
          )}
        >
          <span
            className={cn(
              "inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-1 ring-border transition-transform",
              checked ? "translate-x-6" : "translate-x-1",
            )}
          />
        </button>
      )}
    </div>
  );
}
