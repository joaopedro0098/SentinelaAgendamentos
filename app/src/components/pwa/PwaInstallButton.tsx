import { Download } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { isSocialInAppBrowser } from "@/lib/pwaInstall";
import { cn } from "@/lib/utils";

type HelpVariant = "landing" | "app";

type Props = {
  label?: string;
  helpPresentation?: "inline" | "dialog";
  helpVariant?: HelpVariant;
  className?: string;
  buttonClassName?: string;
  onNavigate?: () => void;
} & Pick<ButtonProps, "size" | "variant">;

function PwaInstallStepsContent({ isIos, variant }: { isIos: boolean; variant: HelpVariant }) {
  const fromSocial = isSocialInAppBrowser();
  const isApp = variant === "app";

  const socialNoteClass = isApp
    ? "rounded-2xl border border-border/60 bg-secondary/40 px-3 py-2.5 text-foreground/90"
    : "rounded-xl bg-muted/60 px-3 py-2.5 text-foreground/90";

  const stepBadgeClass = isApp
    ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-[11px] font-semibold text-white shadow-glow"
    : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground";

  function Step({ n, children }: { n: number; children: React.ReactNode }) {
    return (
      <li className="flex items-start gap-3">
        <span className={stepBadgeClass}>{n}</span>
        <span className="pt-0.5 leading-snug">{children}</span>
      </li>
    );
  }

  if (isIos) {
    return (
      <div className="space-y-4">
        {fromSocial && (
          <p className={socialNoteClass}>
            Veio pelo Instagram ou TikTok? Antes dos passos, toque nos <strong>3 pontinhos</strong> e escolha{" "}
            <strong>Abrir com navegador</strong>.
          </p>
        )}
        <ol className="space-y-3">
          <Step n={1}>
            Toque em <strong>Compartilhar</strong>
          </Step>
          <Step n={2}>
            <strong>Adicionar à Tela de Início</strong>
          </Step>
          <Step n={3}>
            Abra pelo <strong>ícone</strong> na tela inicial
          </Step>
        </ol>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {fromSocial && (
        <p className={socialNoteClass}>
          Veio pelo Instagram ou TikTok? Antes dos passos, clique nos <strong>3 pontinhos</strong> e escolha{" "}
          <strong>Abrir com navegador</strong>.
        </p>
      )}
      <ol className="space-y-3">
        <Step n={1}>
          Clique nos <strong>3 pontinhos</strong> do navegador
        </Step>
        <Step n={2}>
          <strong>Adicionar à tela inicial</strong>
        </Step>
        <Step n={3}>
          <strong>Instalar</strong>
        </Step>
      </ol>
    </div>
  );
}

function getDialogClassName(variant: HelpVariant) {
  if (variant === "app") {
    return "max-w-sm glass-panel rounded-2xl border-border/80 sm:rounded-2xl shadow-xl";
  }
  return "max-w-sm sm:rounded-2xl";
}

function getActionClassName(variant: HelpVariant) {
  if (variant === "app") {
    return "w-full rounded-full bg-gradient-brand text-white border-0 hover:opacity-90 sm:w-auto";
  }
  return "rounded-full";
}

export function PwaInstallButton({
  label = "Instalar",
  helpPresentation = "dialog",
  helpVariant = "app",
  className,
  buttonClassName,
  onNavigate,
  size = "sm",
  variant = "outline",
}: Props) {
  const { showInstall, isIos, showHelp, setShowHelp, handleInstall } = usePwaInstall();

  if (!showInstall) return null;

  async function onClick() {
    onNavigate?.();
    await handleInstall();
  }

  return (
    <>
      <div className={cn(helpPresentation === "inline" && "space-y-2", className)}>
        <Button
          type="button"
          size={size}
          variant={variant}
          className={cn("rounded-full", buttonClassName)}
          onClick={() => void onClick()}
        >
          <Download className="h-4 w-4" />
          {label}
        </Button>

        {helpPresentation === "inline" && showHelp && (
          <Card className="p-3 text-xs text-muted-foreground border-border/70">
            <p className="font-semibold text-foreground text-sm mb-2">Como instalar</p>
            <PwaInstallStepsContent isIos={isIos} variant={helpVariant} />
          </Card>
        )}
      </div>

      {helpPresentation === "dialog" && (
        <AlertDialog open={showHelp} onOpenChange={setShowHelp}>
          <AlertDialogContent className={getDialogClassName(helpVariant)}>
            <AlertDialogHeader>
              <AlertDialogTitle className={cn(helpVariant === "app" && "text-base")}>
                Como instalar
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="text-sm leading-relaxed pt-1 text-muted-foreground">
                  <PwaInstallStepsContent isIos={isIos} variant={helpVariant} />
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className={cn(helpVariant === "app" && "sm:justify-stretch")}>
              <AlertDialogAction className={getActionClassName(helpVariant)}>Entendi</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
