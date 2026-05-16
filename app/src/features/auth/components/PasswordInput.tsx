import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const PASSWORD_MIN_LENGTH = 6;

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type" | "minLength"> & {
  showHint?: boolean;
  hint?: string;
};

export function PasswordInput({
  className,
  showHint = true,
  hint = `Mínimo de ${PASSWORD_MIN_LENGTH} caracteres`,
  ...props
}: PasswordInputProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="space-y-1">
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          minLength={PASSWORD_MIN_LENGTH}
          className={cn("pr-10", className)}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
        >
          {show ? <EyeOff className="h-4 w-4" strokeWidth={1.75} /> : <Eye className="h-4 w-4" strokeWidth={1.75} />}
        </button>
      </div>
      {showHint && (
        <p className="text-[11px] leading-tight text-muted-foreground/50 pl-0.5">{hint}</p>
      )}
    </div>
  );
}
