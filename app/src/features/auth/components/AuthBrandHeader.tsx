import { BrandLogo } from "@/components/brand/BrandLogo";
import { cn } from "@/lib/utils";

export function AuthBrandHeader({ className, size = "lg" }: { className?: string; size?: "md" | "lg" | "xl" }) {
  return (
    <div className={cn("flex justify-center", className)}>
      <BrandLogo size={size} />
    </div>
  );
}
