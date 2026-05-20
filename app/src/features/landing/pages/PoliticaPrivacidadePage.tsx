import { LegalPageShell } from "@/features/landing/components/LegalPageShell";
import { Link } from "react-router-dom";

const atualizado = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

const PoliticaPrivacidade = () => (
  <LegalPageShell title="Política de privacidade" subtitle={`Última atualização: ${atualizado}`}>
    <p>
      O <strong className="text-foreground font-medium">Sentinela Agendamentos</strong> (&quot;
      <strong className="text-foreground font-medium">nós</strong>&quot;) descreve aqui, de forma objetiva, como tratamos dados pessoais quando
      você usa o site <strong className="text-foreground font-medium">sentinelagendamentos.com</strong> e serviços relacionados (incluindo
      conta, área logada e integrações do produto). Ao utilizar o serviço, você reconhece estas práticas. Leia também os{" "}
      <Link to="/termos-de-servico" className="text-foreground hover:underline">
        Termos de serviço
      </Link>
      .
    </p>

    <h2>1. Dados pessoais que podemos coletar</h2>
    <p>
      <strong className="text-foreground">a) Que você nos fornece:</strong> por exemplo, nome, e-mail e dados de perfil ao criar conta ou
      falar com suporte; conteúdo de mensagens ou formulários que nos enviar; dados necessários à contratação ou faturação, quando
      aplicável.
    </p>
    <p>
      <strong className="text-foreground">b) Do uso do serviço:</strong> informações técnicas enviadas pelo navegador ou dispositivo (tipo de
      dispositivo, sistema, idioma), endereço IP, registos de diagnóstico e de segurança, e dados de utilização do site/app (páginas ou
      funcionalidades acedidas, datas e horários), na medida necessária a operar e proteger o serviço.
    </p>
    <p>
      <strong className="text-foreground">c) Cookies e tecnologias semelhantes:</strong> podemos usar cookies estritamente necessários à
      sessão e ao funcionamento do site; outras tecnologias de medição ou preferências, se existirem, serão indicadas quando ativadas.
    </p>
    <p className="text-muted-foreground text-sm">
      Não solicitamos dados sensíveis (saúde, origem racial, etc.) para o funcionamento normal do serviço. O produto não se dirige a
      menores de 18 anos; se tomarmos conhecimento de cadastro indevido, tomaremos medidas para eliminar os dados.
    </p>

    <h2>2. Como usamos os dados</h2>
    <ul>
      <li>Fornecer, manter e melhorar o serviço de agendamento e a experiência no site.</li>
      <li>Criar e gerir contas, autenticação (incluindo login com Google) e segurança.</li>
      <li>Prevenir fraude, abuso e incidentes; investigar problemas técnicos.</li>
      <li>Cumprir obrigações legais e responder a pedidos legítimos de autoridades.</li>
      <li>Comunicar avisos importantes sobre o serviço (por exemplo, alterações de segurança ou de política).</li>
    </ul>

    <h2>3. Como compartilhamos dados</h2>
    <p>Podemos partilhar dados com:</p>
    <ul>
      <li>
        <strong className="text-foreground">Fornecedores:</strong> hospedagem, base de dados, autenticação e infraestrutura — em especial a
        plataforma <strong className="text-foreground font-medium">Supabase</strong> e, quando usar login Google, o{" "}
        <strong className="text-foreground font-medium">Google</strong>, que tratam dados segundo as respetivas políticas.
      </li>
      <li>
        <strong className="text-foreground">Autoridades e defesa de direitos:</strong> quando exigido por lei ou para proteger utilizadores,
        nós ou terceiros.
      </li>
      <li>
        <strong className="text-foreground">Transações societárias:</strong> em caso de fusão, venda ou reorganização, os dados podem ser
        transferidos para o sucessor, respeitando esta política ou equivalente comunicada.
      </li>
    </ul>
    <p>Não vendemos os seus dados pessoais a listas de terceiros para marketing deles.</p>

    <h2>4. Retenção</h2>
    <p>
      Guardamos dados pelo tempo necessário às finalidades acima e ao cumprimento legal, contratual ou resolução de litígios. Depois,
      eliminamos ou anonimizamos, salvo obrigação de arquivo mínima.
    </p>

    <h2>5. Segurança</h2>
    <p>
      Aplicamos medidas técnicas e organizativas razoáveis (controlo de acesso, HTTPS, boas práticas junto de fornecedores). Nenhum sistema
      é totalmente isento de risco.
    </p>

    <h2>6. Os seus direitos e escolhas</h2>
    <p>
      Nos termos da LGPD e legislação aplicável, você pode pedir confirmação de tratamento, acesso, correção, anonimização, eliminação de
      dados desnecessários, portabilidade, informação sobre partilhas e revogação de consentimento, quando cabível. Para exercer direitos,
      contacte-nos pelos canais do site.
    </p>

    <h2>7. Alterações nesta política</h2>
    <p>
      Podemos atualizar esta página; a data no topo indica a última revisão. Alterações relevantes podem ser comunicadas por meios
      adequados (site ou e-mail da conta, quando disponível).
    </p>

    <h2>8. Contato</h2>
    <p>
      Questões sobre privacidade ou dados pessoais:{" "}
      <strong className="text-foreground font-medium">sentinelagendamentos.com</strong> (canais de contacto e WhatsApp comercial, quando
      indicados).
    </p>
  </LegalPageShell>
);

export default PoliticaPrivacidade;
