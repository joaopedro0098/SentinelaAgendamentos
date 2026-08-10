import { LegalPageShell } from "@/features/landing/components/LegalPageShell";
import { Link } from "react-router-dom";

const ULTIMA_ATUALIZACAO = "10 de agosto de 2026";

const ExclusaoDadosPessoais = () => (
  <LegalPageShell title="Exclusão de dados pessoais" subtitle={`Última atualização: ${ULTIMA_ATUALIZACAO}`}>
    <p>
      Para solicitar a exclusão dos seus dados pessoais do Sentinela Agendamentos, envie um e-mail para{" "}
      <a href="mailto:joaopedro.suporte98@gmail.com" className="text-foreground hover:underline">
        joaopedro.suporte98@gmail.com
      </a>{" "}
      com o assunto &quot;Exclusão de dados&quot;, informando seu nome e e-mail/telefone cadastrado. Processaremos a solicitação em até 15
      dias úteis, conforme nossa{" "}
      <Link to="/politica-de-privacidade" className="text-foreground hover:underline">
        Política de Privacidade
      </Link>
      . Você também pode seguir com a solicitação via WhatsApp no contato de suporte do nosso site presente na página inicial.
    </p>
    <p>
      Bem como descrito na{" "}
      <Link to="/politica-de-privacidade" className="text-foreground hover:underline">
        Política de Privacidade
      </Link>
      , você também pode seguir com a solicitação de exclusão e ou alteração de seus dados pessoais contatando diretamente o
      Profissional/Estabelecimento que lhe prestou atendimento.
    </p>
  </LegalPageShell>
);

export default ExclusaoDadosPessoais;
