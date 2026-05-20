import { LegalPageShell } from "@/features/landing/components/LegalPageShell";
import { Link } from "react-router-dom";

const atualizado = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

const TermosServico = () => (
  <LegalPageShell title="Termos de serviço" subtitle={`Última atualização: ${atualizado}`}>
    <p>
      Estes Termos de Serviço (&quot;<strong className="text-foreground font-medium">Termos</strong>&quot;) regem o acesso e o uso do site{" "}
      <strong className="text-foreground font-medium">sentinelagendamentos.com</strong> e dos serviços digitais oferecidos pelo{" "}
      <strong className="text-foreground font-medium">Sentinela Agendamentos</strong> (&quot;<strong className="text-foreground font-medium">nós</strong>
      &quot;), incluindo informações, cadastro e funcionalidades relacionadas ao produto de agendamento online. Ao
      utilizar o serviço, você concorda com estes Termos. Se não concordar, não utilize o site nem o serviço.
    </p>
    <p className="text-muted-foreground text-sm">
      A forma como tratamos dados pessoais está descrita na{" "}
      <Link to="/politica-de-privacidade" className="text-foreground hover:underline">
        Política de privacidade
      </Link>
      .
    </p>

    <h2>1. O serviço</h2>
    <p>
      O Sentinela Agendamentos oferece ferramentas para apoiar agendamentos, colaboradores, serviços e horários da empresa, conforme
      disponível na sua contratação ou plano. Funcionalidades, limites e disponibilidade podem variar; não
      garantimos resultados comerciais específicos.
    </p>

    <h2>2. Elegibilidade e conta</h2>
    <p>
      Você declara ter capacidade legal para contratar na sua jurisdição. Ao criar conta ou utilizar login (incluindo Google), compromete-se
      a fornecer dados verdadeiros e a manter a segurança da sua senha e do seu dispositivo. Você é responsável pelas atividades feitas na sua
      conta, salvo comprovado uso não autorizado que você nos reporte prontamente pelos canais do site.
    </p>

    <h2>3. Uso aceitável</h2>
    <p>É vedado utilizar o serviço para:</p>
    <ul>
      <li>violar lei, direitos de terceiros ou políticas de plataformas integradas (ex.: provedores de mensagens ou nuvem);</li>
      <li>enviar spam, conteúdo ilícito, ofensivo ou enganoso;</li>
      <li>tentar acessar áreas ou dados sem autorização, sobrecarregar sistemas ou contornar medidas de segurança;</li>
      <li>engenharia reversa desnecessária ou uso que prejudique a estabilidade do serviço para outros utilizadores.</li>
    </ul>
    <p>Podemos suspender ou encerrar o acesso em caso de violação grave ou reiterada destes Termos.</p>

    <h2>4. Planos, pagamentos e terceiros</h2>
    <p>
      Preços, faturação e condições comerciais específicas podem constar em página de planos, proposta ou contrato à parte. Pagamentos ou
      meios externos (ex.: processadores) ficam sujeitos aos termos desses fornecedores. Integrações (Supabase, Google, hospedagem, APIs de
      terceiros) dependem da disponibilidade e das políticas desses serviços.
    </p>

    <h2>5. Propriedade intelectual</h2>
    <p>
      O conteúdo do site (textos, marca, layout, software) pertence a nós ou a licenciantes, salvo indicação em contrário. Concedemos apenas
      uma licença limitada, não exclusiva e revogável para usar o serviço conforme estes Termos. O conteúdo e os dados que você insere
      permanecem seus, na medida em que nos conceda licença mínima necessária para operar o serviço.
    </p>

    <h2>6. Isenções e limite de responsabilidade</h2>
    <p>
      O serviço é fornecido &quot;no estado em que se encontra&quot;, na medida permitida pela lei aplicável. Não nos responsabilizamos por
      indisponibilidades causadas por terceiros, internet, ou caso fortuito. A responsabilidade total por danos diretos, na medida máxima
      permitida em lei, tende a limitar-se ao valor pago por você a nós no período de doze meses anterior ao evento (ou a zero se não houver
      pagamento), salvo dolo ou culpa grave nossa.
    </p>

    <h2>7. Alterações</h2>
    <p>
      Podemos alterar estes Termos publicando a versão atualizada nesta página. O uso continuado após mudança relevante pode significar
      aceitação; quando exigido por lei, indicaremos o meio adequado de consentimento ou aviso.
    </p>

    <h2>8. Lei aplicável e foro</h2>
    <p>
      Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da comarca de domicílio do consumidor no
      Brasil, quando aplicável o Código de Defesa do Consumidor; nos demais casos, prevalece o foro da sede do responsável pelo serviço,
      salvo disposição legal em contrário.
    </p>

    <h2>9. Contato</h2>
    <p>
      Dúvidas sobre estes Termos: utilize os canais indicados em{" "}
      <strong className="text-foreground font-medium">sentinelagendamentos.com</strong> (incluindo WhatsApp comercial, quando disponível).
    </p>
  </LegalPageShell>
);

export default TermosServico;
