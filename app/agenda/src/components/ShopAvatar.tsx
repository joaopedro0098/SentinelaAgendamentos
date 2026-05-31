import { Scissors } from "lucide-react";
import { cn } from "@/lib/utils";

export function ShopAvatar({
  logoUrl,
  name,
  className,
}: {
  logoUrl: string | null;
  name: string;
  className?: string;
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className={cn("rounded-full object-cover bg-foreground shrink-0", className)}
      />
    );
  }
  return (
    <div
      className={cn(
        "rounded-full bg-foreground text-background flex items-center justify-center shrink-0",
        className,
      )}
    >
      <Scissors className="h-5 w-5" />
    </div>
  );
}
