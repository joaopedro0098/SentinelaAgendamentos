import { Reveal } from "@/components/layout/PageReveal";

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
            Agendamento, gestão de pacientes, cobrança automática, gestão de equipe, relatórios e mais! Tudo em um
            só lugar, para quem cuida de gente.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
