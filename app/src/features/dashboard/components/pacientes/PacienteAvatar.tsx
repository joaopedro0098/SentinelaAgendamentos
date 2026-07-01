import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type Props = {
  nome: string;
  avatarUrl?: string | null;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
};

function pacienteInitials(nome: string) {
  const trimmed = nome.trim();
  if (!trimmed) return "?";
  return trimmed.slice(0, 2).toUpperCase();
}

const fallbackStyles =
  "flex items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold uppercase select-none";

export function PacienteAvatar({
  nome,
  avatarUrl,
  className,
  imageClassName,
  fallbackClassName,
}: Props) {
  const url = avatarUrl?.trim() || null;
  const initials = pacienteInitials(nome);

  if (!url) {
    return (
      <div
        className={cn(fallbackStyles, "shrink-0 text-sm", className, fallbackClassName)}
        aria-label={`Avatar de ${nome}`}
      >
        {initials}
      </div>
    );
  }

  return (
    <Avatar className={cn("shrink-0", className)}>
      <AvatarImage src={url} alt={nome} className={imageClassName} />
      <AvatarFallback
        delayMs={0}
        className={cn(fallbackStyles, "text-sm", fallbackClassName)}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
