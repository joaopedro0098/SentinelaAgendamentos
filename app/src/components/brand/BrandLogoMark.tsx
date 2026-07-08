import { cn } from "@/lib/utils";

/** Ícone da marca — quadrado verde com recorte circular (tom sage dos prints). */
export function BrandLogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <rect width="32" height="32" rx="8" fill="hsl(var(--brand-green))" />
      <circle cx="16" cy="16" r="6.5" fill="hsl(var(--background))" />
    </svg>
  );
}
