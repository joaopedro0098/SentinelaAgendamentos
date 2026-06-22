import { Download } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import type { PwaInstallHelpVariant } from "@/components/pwa/PwaInstallHelpDialog";
import { cn } from "@/lib/utils";

type Props = {
  label?: string;
  helpVariant?: PwaInstallHelpVariant;
  className?: string;
  buttonClassName?: string;
  onNavigate?: () => void;
} & Pick<ButtonProps, "size" | "variant">;

export function PwaInstallButton({
  label = "Instalar",
  helpVariant = "app",
  className,
  buttonClassName,
  onNavigate,
  size = "sm",
  variant = "outline",
}: Props) {
  const { showInstall, tryNativeInstall, openInstallHelp } = usePwaInstall();

  if (!showInstall) return null;

  async function onClick() {
    const installed = await tryNativeInstall();
    if (installed) {
      onNavigate?.();
      return;
    }
    openInstallHelp(helpVariant, { onAfterClose: onNavigate, mode: "install" });
  }

  return (
    <div className={className}>
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
    </div>
  );
}
