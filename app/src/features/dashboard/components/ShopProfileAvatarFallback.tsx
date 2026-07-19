import { User } from "lucide-react";
import { AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type ShopProfileAvatarFallbackProps = {
  className?: string;
  iconClassName?: string;
};

/** Placeholder quando a empresa não tem foto de perfil (sem iniciais). */
export function ShopProfileAvatarFallback({ className, iconClassName }: ShopProfileAvatarFallbackProps) {
  return (
    <AvatarFallback className={cn("bg-muted text-muted-foreground", className)}>
      <User className={cn("h-[42%] w-[42%] min-h-4 min-w-4", iconClassName)} strokeWidth={1.75} aria-hidden />
    </AvatarFallback>
  );
}
