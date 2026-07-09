import { cn } from "@/lib/utils";

type LandingSectionHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "center" | "left";
  className?: string;
};

export function LandingSectionHeader({
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: LandingSectionHeaderProps) {
  return (
    <header
      className={cn(
        "mb-10 md:mb-14",
        align === "center" && "text-center mx-auto max-w-2xl",
        align === "left" && "text-left max-w-xl",
        className,
      )}
    >
      {eyebrow ? <p className="landing-eyebrow text-primary mb-3">{eyebrow}</p> : null}
      <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-balance leading-tight text-foreground">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-[15px] sm:text-base md:text-lg leading-relaxed text-balance text-muted-foreground">
          {description}
        </p>
      ) : null}
    </header>
  );
}
