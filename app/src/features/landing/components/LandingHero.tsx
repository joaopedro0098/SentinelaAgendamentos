import { Link } from "react-router-dom";
import { Reveal } from "@/components/layout/PageReveal";
import { Button } from "@/components/ui/button";

export function LandingHero() {
  return (
    <section className="pt-28 md:pt-36 pb-10 md:pb-14">
      <div className="container max-w-4xl text-center">
        <Reveal index={0}>
          <p className="text-[11px] md:text-xs font-semibold tracking-[0.22em] uppercase text-primary/80 mb-5">
            Agendamento inteligente
          </p>
        </Reveal>
        <Reveal index={1}>
          <h1 className="font-display text-[2rem] sm:text-5xl md:text-[3.25rem] font-bold leading-[1.08] tracking-tight text-foreground">
            Seu consultório em <span className="text-primary">harmonia</span>
            <br />
            com seu tempo.
          </h1>
        </Reveal>
        <Reveal index={2}>
          <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            A plataforma de agendamento e gestão que prioriza o bem-estar do profissional e a facilidade para o
            paciente. Minimalista, ágil e segura.
          </p>
        </Reveal>
        <Reveal index={3}>
          <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 max-w-md sm:max-w-none mx-auto">
            <Button
              type="button"
              disabled
              className="h-12 rounded-full bg-primary/90 text-primary-foreground px-8 text-base font-medium opacity-80 cursor-default"
            >
              Especialidades
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-12 rounded-full border-border bg-card px-8 text-base font-medium hover:bg-secondary/50"
            >
              <Link to="/signup">Testar 14 dias Grátis</Link>
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
