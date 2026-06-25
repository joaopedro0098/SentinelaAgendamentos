const Hero = () => {
  return (
    <section className="relative pt-36 pb-6 md:pb-8">
      <div className="container relative">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h1 className="text-[2.625rem] md:text-6xl font-bold leading-[1.05] font-display md:flex md:flex-col md:items-center">
            <span>Organize seus agendamentos</span>
            <span>
              sem{" "}
              <span className="text-gradient animate-gradient bg-gradient-text">complicar a rotina</span>
            </span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            O sistema mais <strong className="font-semibold text-foreground">intuitivo</strong> e{" "}
            <strong className="font-semibold text-foreground">fácil</strong> que você vai conhecer para se usar no
            dia a dia! <strong className="font-semibold text-foreground">Veja</strong> só como funciona na prática e{" "}
            <strong className="font-semibold text-foreground">sem enrolação</strong>.
          </p>
        </div>
      </div>
    </section>
  );
};

export default Hero;
