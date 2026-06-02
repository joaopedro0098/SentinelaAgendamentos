import { Link } from "react-router-dom";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { cn } from "@/lib/utils";

type AuthBrandHeaderProps = {
  className?: string;
  size?: "md" | "lg" | "xl";
  linkTo?: string;
};

export function AuthBrandHeader({ className, size = "lg", linkTo = "/" }: AuthBrandHeaderProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 text-center", className)}>
      <BrandLogo size={size} showName showFullName linkTo={linkTo} nameClassName="text-lg sm:text-xl" />
      <div className="space-y-1 max-w-[320px]">
        <p className="text-sm font-semibold text-foreground font-display tracking-tight">
          Sistema de agendamento para barbearias
        </p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Este site é o <strong className="font-medium text-foreground">Sentinela Agendamentos</strong> (
          <span className="whitespace-nowrap">sentinelagendamentos.com</span>
          ). Não é o WhatsApp e não possui vínculo com a Meta.
        </p>
      </div>
    </div>
  );
}
