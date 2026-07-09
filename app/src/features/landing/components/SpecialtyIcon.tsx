import { cn } from "@/lib/utils";

type SpecialtyIconProps = {
  src: string;
  alt: string;
  className?: string;
};

export function SpecialtyIcon({ src, alt, className }: SpecialtyIconProps) {
  return (
    <img
      src={src}
      alt={alt}
      className={cn("h-10 w-10 shrink-0 rounded-xl object-cover md:h-11 md:w-11", className)}
      loading="lazy"
      decoding="async"
    />
  );
}
