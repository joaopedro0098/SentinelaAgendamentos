const Hero = () => {
  return (
    <section className="relative pt-36 pb-0 overflow-hidden">
      {/* glow orbs */}
      <div className="absolute top-20 left-1/4 w-72 h-72 rounded-full bg-[hsl(var(--brand-green)/0.18)] blur-3xl animate-pulse-glow" />
      <div className="absolute top-40 right-1/4 w-72 h-72 rounded-full bg-[hsl(var(--brand-mint)/0.2)] blur-3xl" />

      <div className="container relative">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h1 className="text-5xl md:text-7xl font-bold leading-[1.05] font-display">
            Organize seus agendamentos sem{" "}
            <span className="text-gradient animate-gradient bg-gradient-text">complicar a rotina</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            Link de agendamento fácil para quem marca horário; painel simples para quem gerencia equipe,
            serviços e agenda.
          </p>

          <div className="pt-2 space-y-3">
            <h2 className="text-3xl md:text-4xl font-bold font-display">
              Veja a Sentinela em <span className="text-gradient">ação</span>
            </h2>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
