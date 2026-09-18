import { Quote } from "lucide-react";
import { Reveal } from "@/components/layout/PageReveal";
import { LandingSection } from "@/features/landing/components/LandingSection";
import { LandingSectionHeader } from "@/features/landing/components/LandingSectionHeader";
import { useLandingPageContent } from "@/features/landing/context/LandingPageContentContext";
import { cn } from "@/lib/utils";

export function SocialProofSection() {
  const { socialProof } = useLandingPageContent();
  const gridCols =
    socialProof.testimonials.length === 1 ? "md:grid-cols-1 max-w-xl" : "md:grid-cols-3 max-w-5xl";

  return (
    <LandingSection id="depoimentos" variant="muted" className="pt-24 pb-16 md:pt-28 md:pb-24">
      <LandingSectionHeader
        eyebrow={socialProof.eyebrow}
        title={socialProof.title}
        description={socialProof.description}
      />

      <div
        className={cn(
          "mx-auto mb-12 grid gap-4 md:mb-16 md:gap-8",
          socialProof.stats.length === 2 ? "max-w-md grid-cols-2" : "max-w-3xl grid-cols-3",
        )}
      >
        {socialProof.stats.map((stat, i) => (
          <Reveal key={stat.label} index={i}>
            <div className="text-center">
              <p className="font-display text-2xl md:text-3xl font-semibold text-primary">{stat.value}</p>
              <p className="mt-1 text-xs md:text-sm text-muted-foreground leading-snug">{stat.label}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <div className={cn("grid gap-5 mx-auto", gridCols)}>
        {socialProof.testimonials.map((item, i) => (
          <Reveal key={item.id} index={3 + i}>
            <figure
              className={cn(
                "h-full flex flex-col rounded-2xl border border-border/70 bg-card p-5 md:p-6 shadow-soft",
              )}
            >
              <Quote className="h-5 w-5 text-primary/40 mb-3" aria-hidden />
              <blockquote
                className={cn(
                  "flex-1 text-sm font-normal leading-relaxed text-muted-foreground",
                  socialProof.testimonialQuoteClassName,
                )}
              >
                &ldquo;{item.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3 pt-4 border-t border-border/50">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold"
                  aria-hidden
                >
                  {item.initials}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.role}</p>
                </div>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>
    </LandingSection>
  );
}
