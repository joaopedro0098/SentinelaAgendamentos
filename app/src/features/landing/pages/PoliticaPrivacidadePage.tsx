import { LegalPageShell } from "@/features/landing/components/LegalPageShell";
import { Link } from "react-router-dom";

const ULTIMA_ATUALIZACAO = "10 de agosto de 2026";

const PoliticaPrivacidade = () => (
  <LegalPageShell title="Política de privacidade" subtitle={`Última atualização: ${ULTIMA_ATUALIZACAO}`}>
    <p>
      O <strong className="text-foreground font-medium">Sentinela Agendamentos</strong> (&quot;
      <strong className="text-foreground font-medium">nós</strong>&quot;, &quot;
      <strong className="text-foreground font-medium">Sentinela</strong>&quot;) descreve aqui, de forma objetiva, como tratamos dados
      pessoais quando você usa o site <strong className="text-foreground font-medium">sentinelagendamentos.com</strong> e os serviços
      relacionados (incluindo conta, área logada, agendamento online e envio de confirmações/lembretes via WhatsApp). Ao utilizar o
      serviço, você reconhece estas práticas. Leia também os{" "}
      <Link to="/termos-de-servico" className="text-foreground hover:underline">
        Termos de Serviço
      </Link>
      , que integram esta Política.
    </p>

    <p>
      Esta Política é regida pela Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 – LGPD).
    </p>

    <p>
      Nosso Encarregado pelo Tratamento de Dados Pessoais (DPO) é João Pedro Lemos. O contato com o Encarregado pode ser feito pelo
      e-mail:{" "}
      <a href="mailto:joaopedro.suporte98@gmail.com" className="text-foreground hover:underline">
        joaopedro.suporte98@gmail.com
      </a>
      .
    </p>

    <h2>1. Papéis no tratamento de dados (controlador e operador)</h2>
    <p>
      O Sentinela é licenciador de software e atua, na maior parte das operações, como Operador dos dados pessoais tratados na plataforma.
      Os Profissionais/Estabelecimentos que contratam o Sentinela são os Controladores dos dados pessoais de seus próprios
      clientes/pacientes: são eles que inserem esses dados na plataforma e que definem a finalidade da coleta.
    </p>
    <p>
      Cada Profissional/Estabelecimento é responsável por informar seus clientes/pacientes sobre a coleta e o tratamento dos dados
      pessoais deles e por obter as bases legais e autorizações necessárias. Solicitações de titulares relacionadas a dados inseridos por
      um Profissional/Estabelecimento devem ser direcionadas prioritariamente a ele; auxiliamos no atendimento técnico dessas solicitações
      na qualidade de Operador.
    </p>

    <h2>2. Dados pessoais que podemos coletar</h2>
    <p>
      <strong className="text-foreground">a) Que você (Profissional/Estabelecimento) nos fornece:</strong> nome, e-mail e dados de perfil
      ao criar conta ou falar com suporte; dados necessários à contratação ou faturamento; conteúdo de mensagens ou formulários enviados a
      nós.
    </p>
    <p>
      <strong className="text-foreground">b) Que o Profissional/Estabelecimento insere sobre seus clientes/pacientes:</strong> nome e
      número de telefone (WhatsApp), utilizados para viabilizar o agendamento e o envio de confirmações e lembretes; e, quando aplicável,
      dados sensíveis de saúde (prontuários, fichas de anamnese, histórico clínico), inseridos e geridos pelo próprio
      Profissional/Estabelecimento no exercício de sua atividade — ver tratamento específico no item e).
    </p>
    <p>
      <strong className="text-foreground">c) Do uso do serviço:</strong> informações técnicas enviadas pelo navegador ou dispositivo (tipo
      de dispositivo, sistema, idioma), endereço IP, registros de diagnóstico e de segurança, e dados de utilização do site/app (páginas ou
      funcionalidades acessadas, datas e horários), na medida necessária para operar e proteger o serviço.
    </p>
    <p>
      <strong className="text-foreground">d) Cookies e tecnologias semelhantes:</strong> usamos cookies estritamente necessários à sessão
      e ao funcionamento do site; outras tecnologias de medição ou preferências, se existirem, serão indicadas quando ativadas.
    </p>
    <p>
      <strong className="text-foreground">e) Dados sensíveis de saúde:</strong> como o Sentinela é uma plataforma voltada à área de
      saúde, os Profissionais/Estabelecimentos podem inserir dados sensíveis de seus clientes/pacientes na plataforma, como prontuários,
      fichas de anamnese e histórico clínico, nos termos do art. 5º, II e art. 11 da LGPD. Esses dados são inseridos e geridos pelo
      próprio Profissional/Estabelecimento, na qualidade de Controlador, sendo dele a responsabilidade por obter a base legal e o
      consentimento específico do titular quando exigido. O Sentinela, na qualidade de Operador, aplica controles de acesso restritos a
      esses dados e não os utiliza para finalidade diversa da disponibilização ao próprio Profissional/Estabelecimento. As mensagens de
      confirmação e lembrete de agendamento enviadas via WhatsApp não contêm dados de saúde, prontuário ou diagnóstico — apenas nome,
      horário e serviço agendado.
    </p>
    <p>
      <strong className="text-foreground">f) Menores de idade:</strong> o produto não se dirige a menores de 18 anos; se tomarmos
      conhecimento de cadastro indevido, tomaremos medidas para eliminar os dados.
    </p>

    <h2>3. Como usamos os dados</h2>
    <ul>
      <li>Fornecer, manter e melhorar o serviço de agendamento e a experiência no site.</li>
      <li>Criar e gerir contas, autenticação (incluindo login com Google) e segurança.</li>
      <li>Enviar confirmações e lembretes de agendamento por WhatsApp, vinculados a um agendamento real realizado na plataforma.</li>
      <li>Processar pagamentos de planos contratados.</li>
      <li>Prevenir fraude, abuso e incidentes; investigar problemas técnicos.</li>
      <li>Cumprir obrigações legais e responder a pedidos legítimos de autoridades.</li>
      <li>Comunicar avisos importantes sobre o serviço (por exemplo, alterações de segurança ou de política).</li>
    </ul>

    <h2>4. Como compartilhamos dados</h2>
    <p>
      Podemos compartilhar dados com fornecedores que nos auxiliam a operar o serviço, cada qual tratando dados segundo suas próprias
      políticas:
    </p>
    <ul>
      <li>
        <strong className="text-foreground">Supabase:</strong> hospedagem de banco de dados e autenticação.
      </li>
      <li>
        <strong className="text-foreground">Google:</strong> quando você utiliza login com Google.
      </li>
      <li>
        <strong className="text-foreground">Meta (WhatsApp Business Platform):</strong> infraestrutura oficial pela qual as mensagens de
        confirmação e lembrete de agendamento são entregues.
      </li>
      <li>
        <strong className="text-foreground">Twilio:</strong> provedor de mensageria integrado à API do WhatsApp Business responsável pelo
        envio técnico das mensagens em nome do Sentinela.
      </li>
      <li>
        <strong className="text-foreground">Stripe e Mercado Pago:</strong> processamento de pagamentos dos planos contratados; não
        armazenamos dados completos de cartão de crédito.
      </li>
    </ul>
    <p>Também podemos compartilhar dados com:</p>
    <ul>
      <li>
        <strong className="text-foreground">Autoridades e defesa de direitos:</strong> quando exigido por lei ou para proteger usuários,
        nós ou terceiros.
      </li>
      <li>
        <strong className="text-foreground">Transações societárias:</strong> em caso de fusão, venda ou reorganização, os dados podem ser
        transferidos ao sucessor, respeitando esta Política ou equivalente comunicada.
      </li>
    </ul>
    <p>Não vendemos seus dados pessoais a listas de terceiros para marketing deles.</p>

    <h2>5. Transferência internacional de dados</h2>
    <p>
      Alguns dos fornecedores mencionados no item 4 podem processar dados em servidores localizados fora do Brasil, inclusive nos Estados
      Unidos. Nesses casos, buscamos contratar fornecedores que adotem padrões de segurança e proteção de dados compatíveis com a
      legislação brasileira aplicável.
    </p>

    <h2>6. Retenção</h2>
    <p>
      Guardamos os dados pelo tempo necessário às finalidades acima e ao cumprimento de obrigação legal, contratual ou de resolução de
      litígios. Depois, eliminamos ou anonimizamos os dados, salvo obrigação de arquivo mínima prevista em lei.
    </p>

    <h2>7. Segurança</h2>
    <p>
      Aplicamos medidas técnicas e organizacionais razoáveis (controle de acesso, HTTPS, boas práticas junto a fornecedores) para proteger
      os dados pessoais tratados. Nenhum sistema é totalmente isento de risco; não nos responsabilizamos por danos decorrentes de acesso
      não autorizado que resulte de ação criminosa de terceiros além da previsibilidade técnica no momento em que ocorrer.
    </p>

    <h2>8. Seus direitos e escolhas</h2>
    <p>
      Você pode solicitar a exclusão total ou parcial dos seus dados, bem como tratamento, acesso, correção, anonimização, ou qualquer
      outro tipo de alteração de dados pessoais. Para exercer esses direitos, entre em contato pelos canais do site ou pelo e-mail{" "}
      <a href="mailto:joaopedro.suporte98@gmail.com" className="text-foreground hover:underline">
        joaopedro.suporte98@gmail.com
      </a>{" "}
      ou pelo contato de suporte do WhatsApp do próprio site. Veja mais sobre excluir/alterar dados pessoais{" "}
      <Link to="/exclusao-de-dados-pessoais" className="text-foreground hover:underline">
        clicando aqui
      </Link>
      .
    </p>
    <p>
      Informamos que você também poderá contatar diretamente o Profissional/Estabelecimento que lhe prestou atendimento, que é o
      Controlador responsável pela finalidade da coleta, para exclusão total ou parcial dos seus dados bem como qualquer tipo de
      alteração.
    </p>

    <h2>9. Alterações nesta política</h2>
    <p>
      Podemos atualizar esta página; a data no topo indica a última revisão. Alterações relevantes podem ser comunicadas por meios
      adequados (site ou e-mail da conta, quando disponível).
    </p>

    <h2>10. Contato</h2>
    <p>
      Questões sobre privacidade ou dados pessoais:{" "}
      <strong className="text-foreground font-medium">sentinelagendamentos.com</strong> (canais de contato e WhatsApp comercial, quando
      indicados) ou pelo e-mail{" "}
      <a href="mailto:joaopedro.suporte98@gmail.com" className="text-foreground hover:underline">
        joaopedro.suporte98@gmail.com
      </a>
      .
    </p>
  </LegalPageShell>
);

export default PoliticaPrivacidade;
