import { Quote } from "lucide-react";
import { Reveal } from "@/components/layout/PageReveal";
import { SOCIAL_PROOF_STATS, TESTIMONIALS } from "@/features/landing/content/landingContent";
import { LandingSection } from "@/features/landing/components/LandingSection";
import { LandingSectionHeader } from "@/features/landing/components/LandingSectionHeader";
import { cn } from "@/lib/utils";

export function SocialProofSection() {
  return (
    <LandingSection id="depoimentos" variant="muted">
      <LandingSectionHeader
        eyebrow="Quem já usa"
        title="Profissionais que recuperaram tempo na agenda"
        description="Veja o que nossos usuários destacam no dia a dia."
      />

      <div className="grid grid-cols-3 gap-4 md:gap-8 max-w-3xl mx-auto mb-12 md:mb-16">
        {SOCIAL_PROOF_STATS.map((stat, i) => (
          <Reveal key={stat.label} index={i}>
            <div className="text-center">
              <p className="font-display text-2xl md:text-3xl font-semibold text-primary">{stat.value}</p>
              <p className="mt-1 text-xs md:text-sm text-muted-foreground leading-snug">{stat.label}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
        {TESTIMONIALS.map((item, i) => (
          <Reveal key={item.id} index={3 + i}>
            <figure
              className={cn(
                "h-full flex flex-col rounded-2xl border border-border/70 bg-card p-5 md:p-6 shadow-soft",
              )}
            >
              <Quote className="h-5 w-5 text-primary/40 mb-3" aria-hidden />
              <blockquote className="flex-1 text-sm text-muted-foreground leading-relaxed">
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
