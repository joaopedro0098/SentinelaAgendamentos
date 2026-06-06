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
    <div className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-x-3 gap-y-1">
      <label htmlFor={id} className="col-start-1 row-start-1 text-sm font-medium leading-snug">
        {label}
      </label>

      <div className="col-start-2 row-start-1 flex justify-end">
        {busy ? (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <button
            id={id}
            type="button"
            role="switch"
            aria-checked={checked}
            aria-disabled={disabled}
            disabled={disabled}
            onClick={onToggle}
            className={cn(
              "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 transition-colors",
              checked ? "border-primary bg-primary" : "border-neutral-400 bg-neutral-200",
              disabled ? "cursor-not-allowed" : "cursor-pointer",
            )}
          >
            <span
              className={cn(
                "inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-1 ring-neutral-300 transition-transform",
                checked ? "translate-x-[1.35rem]" : "translate-x-0.5",
              )}
            />
          </button>
        )}
      </div>

      <p className="col-span-2 text-[11px] leading-tight text-muted-foreground">{description}</p>
      {hint && (
        <p className="col-span-2 text-[11px] leading-tight text-destructive break-words">{hint}</p>
      )}
    </div>
  );
}
