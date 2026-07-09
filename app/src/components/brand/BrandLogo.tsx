import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const BRAND_LOGO_SRC = "/landing-logo.png";

const brandMarkClassName = "object-contain rounded-[6px]";

const sizeClasses = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
} as const;

type BrandLogoProps = {
  size?: keyof typeof sizeClasses;
  showName?: boolean;
  /** Exibe "Sentinela Agendamentos" por completo (sem ocultar no mobile). */
  showFullName?: boolean;
  linkTo?: string;
  className?: string;
};

export function BrandLogo({
  size = "sm",
  showName = false,
  showFullName = false,
  linkTo,
  className,
}: BrandLogoProps) {
  const content = (
    <>
      <img
        src={BRAND_LOGO_SRC}
        alt={showName ? "Logo Sentinela Agendamentos" : "Sentinela Agendamentos"}
        className={cn(sizeClasses[size], brandMarkClassName)}
        width={64}
        height={64}
        decoding="async"
        draggable={false}
      />
      {showName ? (
        <span className="font-display font-bold text-base sm:text-lg whitespace-nowrap">
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
