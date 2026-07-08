import { Link } from "react-router-dom";
import { Reveal } from "@/components/layout/PageReveal";
import { Button } from "@/components/ui/button";

export function LandingCta() {
  return (
    <section className="py-20 md:py-28 border-t border-border/60">
      <div className="container max-w-3xl text-center">
        <Reveal index={11}>
          <h2 className="font-display text-3xl md:text-[2.5rem] font-bold tracking-tight">
            Pronto para simplificar sua agenda?
          </h2>
        </Reveal>
        <Reveal index={12}>
          <p className="mt-4 text-muted-foreground text-base md:text-lg leading-relaxed">
            Junte-se a centenas de profissionais de saúde que economizam horas por semana com o Sentinela.
          </p>
        </Reveal>
        <Reveal index={13}>
          <Button
            asChild
            className="mt-8 h-12 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground border-0 px-10 text-base font-medium"
          >
            <Link to="/signup">Começar gratuitamente</Link>
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
