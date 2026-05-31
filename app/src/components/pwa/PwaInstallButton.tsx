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
import { cn } from "@/lib/utils";

type Props = {
  label?: string;
  helpPresentation?: "inline" | "dialog";
  className?: string;
  buttonClassName?: string;
  onNavigate?: () => void;
} & Pick<ButtonProps, "size" | "variant">;

function InstallHelpText({ isIos }: { isIos: boolean }) {
  if (isIos) {
    return (
      <>
        No <strong>Safari</strong>, toque em <strong>Compartilhar</strong> →{" "}
        <strong>Adicionar à Tela de Início</strong>. Depois abra pelo ícone na tela inicial.
      </>
    );
  }
  return (
    <>
      Toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong> no menu do navegador.
      No Chrome, também pode aparecer um banner de instalação.
    </>
  );
}

export function PwaInstallButton({
  label = "Instalar",
  helpPresentation = "dialog",
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
          <Card className="p-3 text-xs text-muted-foreground space-y-1.5 border-border/70">
            <p className="font-semibold text-foreground text-sm">Como instalar</p>
            <p>
              <InstallHelpText isIos={isIos} />
            </p>
          </Card>
        )}
      </div>

      {helpPresentation === "dialog" && (
        <AlertDialog open={showHelp} onOpenChange={setShowHelp}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Como instalar o app</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="text-sm leading-relaxed space-y-2 pt-1">
                  <p>
                    <InstallHelpText isIos={isIos} />
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction className="rounded-full">Entendi</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
