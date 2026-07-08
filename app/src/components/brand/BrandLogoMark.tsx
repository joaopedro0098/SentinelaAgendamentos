import { cn } from "@/lib/utils";
import { BRAND_LOGO_SRC } from "@/components/brand/BrandLogo";

/** Marca Sentinela — PNG com cantos levemente arredondados. */
export function BrandLogoMark({ className }: { className?: string }) {
  return (
    <img
      src={BRAND_LOGO_SRC}
      alt=""
      className={cn("shrink-0 object-contain rounded-[6px]", className)}
      width={64}
      height={64}
      decoding="async"
      draggable={false}
      aria-hidden
    />
  );
}
