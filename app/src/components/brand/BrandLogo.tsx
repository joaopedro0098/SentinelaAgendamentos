import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const LOGO_SRC = "/brand-logo.png";

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
  linkTo?: string;
  className?: string;
  imageClassName?: string;
  nameClassName?: string;
};

export function BrandLogo({
  size = "sm",
  showName = false,
  linkTo,
  className,
  imageClassName,
  nameClassName,
}: BrandLogoProps) {
  const content = (
    <>
      <img
        src={LOGO_SRC}
        alt="Sentinela Agendamentos"
        className={cn("shrink-0 rounded-[22%] object-cover shadow-glow", sizeClasses[size], imageClassName)}
      />
      {showName ? (
        <span className={cn("font-display font-bold text-base sm:text-lg whitespace-nowrap", nameClassName)}>
          Sentinela <span className="hidden sm:inline">Agendamentos</span>
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
