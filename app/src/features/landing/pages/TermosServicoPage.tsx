import { LegalPageShell } from "@/features/landing/components/LegalPageShell";
import { Link } from "react-router-dom";

const ULTIMA_ATUALIZACAO = "09 de agosto de 2026";

const TermosServico = () => (
  <LegalPageShell title="Termos de serviço" subtitle={`Última atualização: ${ULTIMA_ATUALIZACAO}`}>
    <p>
      Estes Termos de Serviço (&quot;<strong className="text-foreground font-medium">Termos</strong>&quot;) constituem um acordo entre você e
      o <strong className="text-foreground font-medium">Sentinela Agendamentos</strong> (&quot;
      <strong className="text-foreground font-medium">nós</strong>&quot;, &quot;
      <strong className="text-foreground font-medium">Sentinela</strong>&quot;) e regem o acesso e uso do site{" "}
      <strong className="text-foreground font-medium">sentinelagendamentos.com</strong> e dos serviços digitais oferecidos, incluindo
      cadastro, área logada, agendamento online e funcionalidades relacionadas (incluindo confirmações e lembretes de agendamento enviados
      via WhatsApp). Ao utilizar o serviço, você concorda com estes Termos. Se não concordar, não utilize o site nem o serviço.
    </p>
    <p className="text-muted-foreground text-sm">
      A forma como tratamos dados pessoais está descrita na{" "}
      <Link to="/politica-de-privacidade" className="text-foreground hover:underline">
        Política de Privacidade
      </Link>
      , que integra estes Termos.
    </p>

    <h2>1. O serviço</h2>
    <p>
      O Sentinela Agendamentos é uma plataforma de licenciamento de software que oferece ferramentas de agendamento online para
      profissionais e estabelecimentos da área de saúde e bem-estar, incluindo gestão de agenda, colaboradores, serviços, horários e envio
      de confirmações/lembretes de agendamento por WhatsApp. Funcionalidades, limites e disponibilidade podem variar conforme o plano
      contratado. Não garantimos resultados comerciais específicos.
    </p>
    <p>
      Nosso serviço se limita ao licenciamento de software e à intermediação tecnológica de gestão de pacientes, não participando da
      execução dos serviços de saúde/bem-estar prestados pelos profissionais e estabelecimentos, que são de responsabilidade exclusiva
      deles.
    </p>

    <h2>2. Usuários</h2>
    <p>Consideramos usuários do Sentinela:</p>
    <p>
      <strong className="text-foreground">a) Profissionais/Estabelecimentos:</strong> pessoas físicas ou jurídicas que contratam o
      Sentinela para gerenciar sua agenda, colaboradores e atendimentos, e que cadastram dados de seus próprios clientes/pacientes para fins
      de agendamento.
    </p>
    <p>
      <strong className="text-foreground">b) Clientes/Pacientes:</strong> pessoas atendidas pelos Profissionais/Estabelecimentos, cujos
      dados (como nome e telefone) são inseridos na plataforma pelo próprio Profissional/Estabelecimento para viabilizar o agendamento e o
      envio de confirmações e lembretes.
    </p>
    <p>
      Cada Profissional/Estabelecimento é responsável por avisar seus próprios clientes/pacientes sobre a coleta dos dados pessoais deles,
      e por obter as autorizações necessárias, conforme detalhado na{" "}
      <Link to="/politica-de-privacidade" className="text-foreground hover:underline">
        Política de Privacidade
      </Link>
      .
    </p>

    <h2>3. Elegibilidade e conta</h2>
    <p>
      Você declara ter capacidade legal para contratar na sua jurisdição. Ao criar conta ou utilizar login (incluindo Google), você se
      compromete a fornecer dados verdadeiros e a manter a segurança da sua senha e do seu dispositivo. Você é responsável pelas atividades
      realizadas na sua conta, salvo uso não autorizado comprovado que nos seja reportado prontamente pelos canais do site.
    </p>

    <h2>4. Uso aceitável</h2>
    <p>É vedado utilizar o serviço para:</p>
    <ul>
      <li>
        violar lei, direitos de terceiros ou políticas de plataformas integradas (incluindo, sem limitação, as políticas do WhatsApp
        Business Platform (Meta) e demais provedores de mensageria, nuvem ou pagamento integrados ao Sentinela);
      </li>
      <li>enviar spam, conteúdo ilícito, ofensivo ou enganoso, inclusive por WhatsApp;</li>
      <li>
        utilizar o envio de mensagens automáticas para finalidade diversa de confirmação e lembrete de agendamentos efetivamente
        realizados;
      </li>
      <li>tentar acessar áreas ou dados sem autorização, sobrecarregar sistemas ou contornar medidas de segurança;</li>
      <li>realizar engenharia reversa desnecessária ou uso que prejudique a estabilidade do serviço para outros usuários.</li>
    </ul>
    <p>
      Podemos suspender ou encerrar o acesso em caso de violação grave ou reiterada destes Termos, inclusive quando a violação comprometer
      nossa conformidade com políticas de provedores integrados (como a Meta/WhatsApp).
    </p>

    <h2>5. Planos, pagamentos e terceiros</h2>
    <p>
      Preços, faturamento e condições comerciais específicas constam na página de planos ou em proposta/contrato à parte. O processamento
      de pagamentos é realizado por processadores de pagamento terceiros (Stripe e/ou Mercado Pago), sujeitos aos respectivos termos desses
      fornecedores; não armazenamos dados completos de cartão de crédito.
    </p>
    <p>
      O envio de mensagens de confirmação e lembrete de agendamento via WhatsApp depende da infraestrutura da API do WhatsApp Business
      (operada pela Meta) e de um provedor (BSP) de mensageria integrado, estando sujeito à disponibilidade e às políticas desses serviços.
    </p>
    <p>
      Demais integrações (autenticação e banco de dados via Supabase, login via Google, hospedagem) dependem igualmente da disponibilidade e
      das políticas desses fornecedores.
    </p>

    <h2>6. Propriedade intelectual</h2>
    <p>
      O conteúdo do site (textos, marca, layout, software) pertence a nós ou a licenciantes, salvo indicação em contrário. Concedemos
      apenas uma licença limitada, não exclusiva, revogável e intransferível para uso do serviço conforme estes Termos. O conteúdo e os
      dados que você insere permanecem seus, na medida em que nos conceda a licença mínima necessária para operar o serviço em seu favor.
    </p>

    <h2>7. Isenções e limite de responsabilidade</h2>
    <p>
      O serviço é fornecido &quot;no estado em que se encontra&quot;, na medida permitida pela lei aplicável. Não nos responsabilizamos por
      indisponibilidades causadas por terceiros (incluindo interrupções na API do WhatsApp/Meta, processadores de pagamento ou provedores de
      infraestrutura), pela internet, ou por caso fortuito ou força maior.
    </p>
    <p>
      Não somos responsáveis pela qualidade, execução ou resultado dos serviços de saúde/bem-estar prestados pelos
      Profissionais/Estabelecimentos, sendo estes os exclusivos responsáveis perante seus clientes/pacientes.
    </p>
    <p>
      A responsabilidade total por danos diretos, na medida máxima permitida em lei, limita-se ao valor pago por você a nós no período de
      doze meses anterior ao evento (ou a zero, se não houver pagamento), salvo dolo ou culpa grave nossa.
    </p>

    <h2>8. Confidencialidade e segurança</h2>
    <p>
      Tratamos como confidenciais as informações da sua conta e as protegemos com medidas técnicas e organizacionais razoáveis, conforme
      detalhado na{" "}
      <Link to="/politica-de-privacidade" className="text-foreground hover:underline">
        Política de Privacidade
      </Link>
      . Não nos responsabilizamos por violações de dados decorrentes de ação criminosa de terceiros que rompam sistemas de segurança além da
      previsibilidade técnica no momento em que ocorrerem.
    </p>

    <h2>9. Alterações</h2>
    <p>
      Podemos alterar estes Termos publicando a versão atualizada nesta página. O uso continuado após mudança relevante pode significar
      aceitação; quando exigido por lei, indicaremos o meio adequado de consentimento ou aviso.
    </p>

    <h2>10. Lei aplicável e foro</h2>
    <p>
      Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da comarca de São Paulo/SP, sem prejuízo do
      foro do domicílio do consumidor, quando aplicável o Código de Defesa do Consumidor.
    </p>

    <h2>11. Contato</h2>
    <p>
      Dúvidas sobre estes Termos: utilize os canais indicados em{" "}
      <strong className="text-foreground font-medium">sentinelagendamentos.com</strong> (incluindo WhatsApp comercial, quando disponível) ou
      o e-mail{" "}
      <a href="mailto:joaopedro.suporte98@gmail.com" className="text-foreground hover:underline">
        joaopedro.suporte98@gmail.com
      </a>
      .
    </p>
  </LegalPageShell>
);

export default TermosServico;
