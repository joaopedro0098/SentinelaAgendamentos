import { Clock, TrendingUp, Timer, Heart, CalendarRange, MessageCircle } from "lucide-react";

const benefits = [
  { icon: Clock, title: "Atendimento 24/7", desc: "Sua agência nunca dorme. Responde até de madrugada." },
  { icon: TrendingUp, title: "Mais clientes fechados", desc: "Resposta imediata = mais agendamentos confirmados." },
  { icon: Timer, title: "Economia de tempo", desc: "Pare de digitar a mesma coisa. Foque no que importa." },
  { icon: Heart, title: "Clientes mais satisfeitos", desc: "Atendimento ágil e sem espera gera fidelidade." },
  { icon: CalendarRange, title: "Agenda organizada", desc: "Tudo no Google Sheets, sem conflitos de horário." },
  { icon: MessageCircle, title: "Integração com WhatsApp", desc: "Funciona no app que seus clientes já usam." },
];

const Benefits = () => (
  <section id="beneficios" className="py-24 relative">
    <div className="container">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <span className="text-sm font-semibold text-gradient uppercase tracking-wider">Benefícios</span>
        <h2 className="text-4xl md:text-5xl font-bold mt-3 font-display">
          Tudo que seu negócio <span className="text-gradient">precisa</span>
        </h2>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto">
        {benefits.map((b, i) => (
          <div
            key={i}
            className="group relative glass rounded-2xl p-6 hover:bg-secondary/50 transition-all hover:shadow-soft"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-soft border border-border flex items-center justify-center mb-4 group-hover:bg-gradient-brand transition-all">
              <b.icon className="w-5 h-5 text-[hsl(var(--brand-violet))] group-hover:text-white transition-colors" />
            </div>
            <h3 className="font-bold text-lg mb-1">{b.title}</h3>
            <p className="text-sm text-muted-foreground">{b.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default Benefits;
