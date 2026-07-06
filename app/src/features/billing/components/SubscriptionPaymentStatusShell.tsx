import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SubscriptionPaymentStatusShellProps = {
  icon: ReactNode;
  title: string;
  description: string;
  primaryAction?: {
    label: string;
    to?: string;
    onClick?: () => void;
  };
  secondaryAction?: {
    label: string;
    to?: string;
    onClick?: () => void;
  };
  className?: string;
};

export function SubscriptionPaymentStatusShell({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  className,
}: SubscriptionPaymentStatusShellProps) {
  return (
    <div className={cn("p-4 md:p-8 max-w-lg mx-auto w-full min-h-[min(70vh,32rem)] flex flex-col justify-center", className)}>
      <div className="text-center space-y-6">
        <div className="mx-auto flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-[hsl(var(--brand-green)/0.12)] border border-[hsl(var(--brand-green)/0.25)]">
          {icon}
        </div>

        <div className="space-y-3 px-1">
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-md mx-auto">{description}</p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 pt-2">
          {primaryAction ? (
            primaryAction.to ? (
              <Button
                asChild
                size="lg"
                className="w-full sm:w-auto min-w-[200px] h-11 sm:h-12 rounded-full bg-gradient-brand hover:opacity-90 text-white border-0 shadow-glow px-8"
              >
                <Link to={primaryAction.to}>{primaryAction.label}</Link>
              </Button>
            ) : (
              <Button
                type="button"
                size="lg"
                className="w-full sm:w-auto min-w-[200px] h-11 sm:h-12 rounded-full bg-gradient-brand hover:opacity-90 text-white border-0 shadow-glow px-8"
                onClick={primaryAction.onClick}
              >
                {primaryAction.label}
              </Button>
            )
          ) : null}

          {secondaryAction ? (
            secondaryAction.to ? (
              <Button asChild variant="outline" size="lg" className="w-full sm:w-auto rounded-full px-8">
                <Link to={secondaryAction.to}>{secondaryAction.label}</Link>
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full sm:w-auto rounded-full px-8"
                onClick={secondaryAction.onClick}
              >
                {secondaryAction.label}
              </Button>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function SubscriptionPaymentStatusLoading() {
  return (
    <div className="p-4 md:p-8 max-w-lg mx-auto w-full min-h-[min(70vh,32rem)] flex flex-col items-center justify-center gap-4">
      <div className="h-10 w-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" aria-hidden />
      <p className="text-sm text-muted-foreground">Verificando pagamento…</p>
    </div>
  );
}
