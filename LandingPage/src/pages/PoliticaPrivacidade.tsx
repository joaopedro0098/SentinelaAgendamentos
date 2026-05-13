import Navbar from "@/components/landing/Navbar";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const PoliticaPrivacidade = () => {
  return (
    <div className="min-h-screen flex flex-col bg-[hsl(270_32%_7%)] bg-gradient-to-b from-[hsl(265_35%_9%)] via-[hsl(260_38%_6%)] to-[hsl(240_40%_4%)] text-white/90">
      <Navbar />
      <main className="flex-1 pt-28 pb-16 px-4">
        <div className="max-w-2xl mx-auto">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-white/55 hover:text-white/90 transition-colors mb-10"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao início
          </Link>

          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-white tracking-tight mb-2">
            Política de privacidade
          </h1>
          <p className="text-sm text-white/50 mb-10">
            Última atualização: {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
          </p>

          <div className="space-y-8 text-[15px] leading-relaxed text-white/85 [&_h2]:text-white [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:first:mt-0 [&_p]:mb-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ul]:text-white/80">
            <p>
              Esta política descreve, de forma resumida, como o <strong className="text-white font-medium">Sentinela Agendamentos</strong>{" "}
              trata dados pessoais quando você utiliza o site <strong className="text-white font-medium">sentinelagendamentos.com</strong>{" "}
              e serviços digitais relacionados (por exemplo, cadastro e área logada, quando disponíveis).
            </p>

            <h2>1. Responsável pelo tratamento</h2>
            <p>
              O responsável pelos dados pessoais tratados no âmbito deste site e do serviço é o titular do negócio{" "}
              <strong className="text-white font-medium">Sentinela Agendamentos</strong>, conforme canais de contato divulgados no próprio site
              (incluindo WhatsApp comercial, quando indicado).
            </p>

            <h2>2. Quais dados podemos coletar</h2>
            <p>Dependendo de como você interage conosco, podemos tratar, entre outros:</p>
            <ul>
              <li>
                <strong className="text-white/95">Dados de conta e autenticação:</strong> por exemplo, nome, e-mail e identificador de
                utilizador, quando você cria sessão ou utiliza login (incluindo login com Google).
              </li>
              <li>
                <strong className="text-white/95">Dados de utilização e técnicos:</strong> registros necessários à segurança, diagnóstico e
                funcionamento do serviço (como endereço IP e tipo de navegador, de forma agregada ou temporária, conforme a infraestrutura
                utilizada).
              </li>
              <li>
                <strong className="text-white/95">Dados que você nos envia:</strong> informações que insere em formulários, conversas de
                suporte ou configurações do serviço de agendamento.
              </li>
            </ul>
            <p className="text-white/70 text-sm">
              Não vendemos listas de contactos nem utilizamos os seus dados pessoais para fins incompatíveis com os descritos abaixo.
            </p>

            <h2>3. Para que usamos os dados</h2>
            <ul>
              <li>Prestar, manter e melhorar o serviço de agendamento e a experiência no site.</li>
              <li>Autenticar utilizadores, prevenir fraude e proteger a segurança da plataforma.</li>
              <li>Cumprir obrigações legais e responder a pedidos legítimos de autoridades, quando aplicável.</li>
              <li>Comunicações relacionadas com o serviço (por exemplo, recuperação de conta ou avisos importantes).</li>
            </ul>

            <h2>4. Bases legais (LGPD)</h2>
            <p>
              Tratamos dados com base em execução de contrato ou de procedimentos preliminares, legítimo interesse (segurança e melhoria do
              serviço, respeitando os seus direitos), cumprimento de obrigação legal e, quando necessário, consentimento — por exemplo, para
              cookies ou comunicações não essenciais, se ativarmos essas opções no site.
            </p>

            <h2>5. Subprocessadores e serviços de terceiros</h2>
            <p>
              Utilizamos fornecedores de infraestrutura e software para hospedar dados e autenticação. Em particular, o serviço pode depender
              da plataforma <strong className="text-white font-medium">Supabase</strong> (base de dados, autenticação e funções associadas) e,
              se ativar login com Google, do <strong className="text-white font-medium">Google</strong> como fornecedor de identidade. O
              tratamento por esses fornecedores rege-se também pelas respetivas políticas de privacidade.
            </p>

            <h2>6. Conservação</h2>
            <p>
              Conservamos dados apenas pelo tempo necessário às finalidades acima, inclusive para resolução de litígios e cumprimento legal,
              apagando ou anonimizando quando deixarem de ser necessários.
            </p>

            <h2>7. Os seus direitos</h2>
            <p>
              Nos termos da legislação aplicável (incluindo a LGPD, no Brasil), você pode solicitar confirmação de tratamento, acesso,
              correção, anonimização, portabilidade, eliminação de dados desnecessários ou excessivos, informação sobre partilhas e, quando
              aplicável, revogação de consentimento. Para exercer direitos, contacte-nos pelos meios indicados no site.
            </p>

            <h2>8. Segurança</h2>
            <p>
              Adotamos medidas técnicas e organizativas razoáveis para proteger dados contra acesso não autorizado, perda ou alteração. Nenhum
              sistema é 100% seguro; ao utilizar o serviço, você reconhece esse risco residual.
            </p>

            <h2>9. Alterações a esta política</h2>
            <p>
              Podemos atualizar esta página para refletir mudanças no serviço ou na lei. A data no topo indica a última revisão; alterações
              relevantes podem ser comunicadas por meios adequados (por exemplo, aviso no site ou por e-mail, quando disponível).
            </p>

            <h2>10. Contacto</h2>
            <p>
              Em caso de dúvidas sobre privacidade ou para pedidos relacionados aos seus dados, utilize os canais de contacto apresentados no
              site <strong className="text-white font-medium">sentinelagendamentos.com</strong>.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PoliticaPrivacidade;
