import { Headphones } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useSupportWhatsApp } from "@/hooks/useSupportWhatsApp";
import { openSupportWhatsApp } from "@/lib/supportWhatsApp";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  onNavigate?: () => void;
};

export function SupportNavItem({ className, onNavigate }: Props) {
  const { phone, loading } = useSupportWhatsApp();

  function handleClick() {
    onNavigate?.();
    if (loading) return;

    if (!phone) {
      toast({
        title: "Suporte indisponível",
        description: "O WhatsApp de suporte ainda não foi configurado.",
        variant: "destructive",
      });
      return;
    }

    if (!openSupportWhatsApp(phone)) {
      toast({
        title: "Não foi possível abrir",
        description: "Verifique o número de suporte configurado.",
        variant: "destructive",
      });
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition justify-start",
        "text-muted-foreground hover:bg-secondary/80 hover:text-foreground disabled:opacity-60",
        className,
      )}
    >
      <Headphones className="h-4 w-4 shrink-0" />
      <span>Suporte</span>
    </button>
  );
}
