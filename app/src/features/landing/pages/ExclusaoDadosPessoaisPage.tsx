import { LegalPageShell } from "@/features/landing/components/LegalPageShell";
import { Link } from "react-router-dom";
import { buildLandingSupportWhatsAppUrl } from "@/lib/supportWhatsApp";

const ULTIMA_ATUALIZACAO = "11 de agosto de 2026";

const ExclusaoDadosPessoais = () => (
  <LegalPageShell title="Exclusão de dados pessoais" subtitle={`Última atualização: ${ULTIMA_ATUALIZACAO}`}>
    <p>
      Para solicitar a exclusão dos seus dados pessoais do Sentinela Agendamentos, envie um e-mail para{" "}
      <a href="mailto:joaopedro.suporte98@gmail.com" className="text-foreground hover:underline">
        joaopedro.suporte98@gmail.com
      </a>{" "}
      com o assunto &quot;Exclusão de dados&quot;, informando seu nome e e-mail/telefone cadastrado. Processaremos a solicitação em até 15
      dias corridos e enviaremos uma confirmação por e-mail quando a exclusão for concluída, conforme nossa{" "}
      <Link to="/politica-de-privacidade" className="text-foreground hover:underline">
        Política de Privacidade
      </Link>
      . Você também pode seguir com a solicitação via{" "}
      <a href={buildLandingSupportWhatsAppUrl()} target="_blank" rel="noopener noreferrer" className="text-foreground hover:underline">
        WhatsApp
      </a>{" "}
      no contato de suporte do nosso site, presente na{" "}
      <Link to="/" className="text-foreground hover:underline">
        página inicial
      </Link>
      .
    </p>
    <p>
      Bem como descrito na{" "}
      <Link to="/politica-de-privacidade" className="text-foreground hover:underline">
        Política de Privacidade
      </Link>
      , pacientes também podem solicitar a exclusão e/ou alteração de seus dados pessoais contatando diretamente o
      Profissional/Estabelecimento que lhes prestou atendimento.
    </p>

    <h2>Profissionais que conectaram sua conta do WhatsApp Business</h2>
    <p>
      Se você é um profissional ou estabelecimento que conectou sua conta do WhatsApp Business (WABA) ao Sentinela Agendamentos através
      do login da Meta, e deseja solicitar a exclusão dos dados obtidos por meio dessa integração, utilize os mesmos canais acima (e-mail
      ou{" "}
      <a href={buildLandingSupportWhatsAppUrl()} target="_blank" rel="noopener noreferrer" className="text-foreground hover:underline">
        WhatsApp
      </a>
      ), informando no pedido que se trata de dados da integração com WhatsApp Business. Processaremos essa solicitação dentro do mesmo
      prazo de 15 dias corridos.
    </p>
    <p>
      Alternativamente, você pode revogar o acesso do Sentinela Agendamentos à sua conta diretamente nas configurações de
      segurança/privacidade do Facebook, na seção de aplicativos conectados (o caminho exato pode variar conforme atualizações da Meta).
    </p>
  </LegalPageShell>
);

export default ExclusaoDadosPessoais;
