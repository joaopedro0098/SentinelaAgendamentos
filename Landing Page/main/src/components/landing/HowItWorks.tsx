import { MessageSquare, Bot, CalendarCheck } from "lucide-react";

const steps = [
  {
    icon: MessageSquare,
    title: "Cliente envia mensagem",
    desc: "Seu cliente chama no WhatsApp, a qualquer hora do dia ou da noite.",
  },
  {
    icon: Bot,
    title: "IA responde instantaneamente",
    desc: "O Sentinela entende, conversa de forma natural faz os agendamento e tira dúvidas.",
  },
  {
    icon: CalendarCheck,
    title: "Agendamento automático",
    desc: "O horário é registrado direto na sua planilha do Google Sheets.",
  },
];

const HowItWorks = () => (
  <section id="como-funciona" className="py-24 relative">
    <div className="container">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <span className="text-sm font-semibold text-gradient uppercase tracking-wider">Como funciona</span>
        <h2 className="text-4xl md:text-5xl font-bold mt-3 font-display">
          Simples como mandar um <span className="text-gradient">"oi"</span>
        </h2>
      </div>

      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto relative">
        {/* connecting line */}
        <div className="hidden md:block absolute top-16 left-[16%] right-[16%] h-px bg-gradient-brand opacity-30" />

        {steps.map((s, i) => (
          <div key={i} className="relative glass rounded-2xl p-8 hover:-translate-y-1 transition-transform">
            <div className="w-14 h-14 rounded-2xl bg-gradient-brand flex items-center justify-center shadow-glow mb-5">
              <s.icon className="w-6 h-6 text-white" />
            </div>
            <div className="text-xs text-muted-foreground mb-2">PASSO {i + 1}</div>
            <h3 className="text-xl font-bold mb-2">{s.title}</h3>
            <p className="text-muted-foreground text-sm">{s.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default HowItWorks;
