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
            Sua agenda organizada.
            <br />
            <span className="text-primary">Seu tempo de volta.</span>
          </h1>
        </Reveal>
        <Reveal index={2}>
          <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Agendamento, gestão de pacientes e cobrança automática — tudo em um só lugar, para quem cuida de gente.
          </p>
        </Reveal>
        <Reveal index={3}>
          <div className="mt-8 flex justify-center">
            <Button
              asChild
              className="h-12 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground border-0 px-8 text-base font-medium"
            >
              <Link to="/signup">Testar 14 dias Grátis</Link>
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
