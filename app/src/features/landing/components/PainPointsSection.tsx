import { MessageSquare, CalendarX, UserX, BarChart3 } from "lucide-react";
import { Reveal } from "@/components/layout/PageReveal";
import { PAIN_POINTS } from "@/features/landing/content/landingContent";
import { LandingSection } from "@/features/landing/components/LandingSection";
import { LandingSectionHeader } from "@/features/landing/components/LandingSectionHeader";

const PAIN_ICONS = {
  whatsapp: MessageSquare,
  agenda: CalendarX,
  faltas: UserX,
  visao: BarChart3,
} as const;

export function PainPointsSection() {
  return (
    <LandingSection id="desafios" variant="muted">
      <LandingSectionHeader
        eyebrow="O dia a dia do consultório"
        title="Você reconhece algum desses cenários?"
        description="Profissionais de saúde perdem horas com tarefas que não são atendimento. O Sentinela existe para devolver esse tempo."
        align="center"
      />

      <div className="grid sm:grid-cols-2 gap-4 md:gap-5 max-w-4xl mx-auto">
        {PAIN_POINTS.map((point, i) => {
          const Icon = PAIN_ICONS[point.id as keyof typeof PAIN_ICONS];
          return (
            <Reveal key={point.id} index={i}>
              <article className="h-full rounded-2xl border border-border/70 bg-card p-5 md:p-6 shadow-soft">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive mb-4">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="font-display text-lg font-semibold text-foreground leading-snug">{point.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{point.description}</p>
              </article>
            </Reveal>
          );
        })}
      </div>
    </LandingSection>
  );
}
