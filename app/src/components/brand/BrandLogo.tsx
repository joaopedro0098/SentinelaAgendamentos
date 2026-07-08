import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export const BRAND_LOGO_SRC = "/landing-logo.png";
/** @deprecated Use {@link BRAND_LOGO_SRC} */
export const LANDING_LOGO_SRC = BRAND_LOGO_SRC;

const brandMarkClassName = "object-contain rounded-[6px]";

const sizeClasses = {
  xs: "h-7 w-7",
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
  xl: "h-16 w-16",
  "2xl": "h-20 w-20",
} as const;

type BrandLogoProps = {
  size?: keyof typeof sizeClasses;
  showName?: boolean;
  /** Exibe "Sentinela Agendamentos" por completo (sem ocultar no mobile). */
  showFullName?: boolean;
  linkTo?: string;
  /** Sobrescreve a logo padrão da marca (ex.: logo de cliente no link público). */
  markSrc?: string;
  className?: string;
  imageClassName?: string;
  nameClassName?: string;
};

export function BrandLogo({
  size = "sm",
  showName = false,
  showFullName = false,
  linkTo,
  markSrc = BRAND_LOGO_SRC,
  className,
  imageClassName,
  nameClassName,
}: BrandLogoProps) {
  const content = (
    <>
      <img
        src={markSrc}
        alt=""
        className={cn(sizeClasses[size], brandMarkClassName, imageClassName)}
        width={64}
        height={64}
        decoding="async"
        draggable={false}
      />
      {showName ? (
        <span className={cn("font-display font-bold text-base sm:text-lg whitespace-nowrap", nameClassName)}>
          Sentinela{" "}
          <span className={showFullName ? "inline" : "hidden sm:inline"}>Agendamentos</span>
        </span>
      ) : null}
    </>
  );

  const wrapperClass = cn("inline-flex items-center gap-2 min-w-0", className);

  if (linkTo) {
    return (
      <Link to={linkTo} className={wrapperClass}>
        {content}
      </Link>
    );
  }

  return <div className={wrapperClass}>{content}</div>;
}
