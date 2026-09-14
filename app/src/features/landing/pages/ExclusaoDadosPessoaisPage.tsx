import { LegalPageShell } from "@/features/landing/components/LegalPageShell";
import { Link } from "react-router-dom";

const ULTIMA_ATUALIZACAO = "11 de agosto de 2026";

const ExclusaoDadosPessoais = () => (
  <LegalPageShell
    title="Exclusão de dados pessoais"
    subtitle={`Última atualização: ${ULTIMA_ATUALIZACAO}`}
    showFooter={false}
  >
    <h2>Como um paciente pode ter seus dados alterados ou excluídos</h2>
    <p>
      Para solicitar a exclusão dos seus dados pessoais do Sentinela Agendamentos, envie um e-mail para{" "}
      <strong className="text-foreground">joaopedro.suporte98@gmail.com</strong> com o assunto &quot;Exclusão de dados&quot;, informando
      seu nome e e-mail/telefone cadastrado. Processaremos a solicitação em até 7 dias corridos e enviaremos uma confirmação por e-mail
      quando a exclusão for concluída, conforme nossa <strong className="text-foreground">Política de Privacidade</strong>. Você também
      pode seguir com a solicitação via <strong className="text-foreground">WhatsApp</strong> no contato de suporte do nosso site,
      presente na <strong className="text-foreground">página inicial</strong>.
    </p>
    <p>
      Bem como descrito na{" "}
      <Link to="/politica-de-privacidade" className="text-foreground hover:underline">
        Política de Privacidade
      </Link>
      , pacientes também podem solicitar a exclusão e/ou alteração de seus dados pessoais contatando diretamente o
      Profissional/Estabelecimento que lhes prestou atendimento.
    </p>

    <h2>Como um profissional usuário do sentinela pode ter seus dados alterados ou excluídos</h2>
    <p>
      Se você é profissional ou estabelecimento cadastrado no Sentinela Agendamentos — inclusive quem conectou uma conta do WhatsApp
      Business (WABA) pelo login da Meta — e deseja excluir sua conta e os dados associados a ela na plataforma, entre na sua conta dentro
      do Sentinela, vá até a aba <strong className="text-foreground">Integrações</strong> e clique em{" "}
      <strong className="text-foreground">Desconectar</strong>.
    </p>
    <p>
      Você também pode revogar o acesso do Sentinela Agendamentos à sua conta do WhatsApp Business nas configurações de
      segurança/privacidade do Facebook, em aplicativos conectados (o caminho exato pode variar conforme atualizações da Meta). Ao
      desautorizar, o Sentinela deixa de acessar novos dados dessa integração; dados já armazenados permanecem até você desconectar em{" "}
      <strong className="text-foreground">Integrações</strong>, excluir a conta em <strong className="text-foreground">Conta</strong> ou
      solicitar ajuda pelo suporte.
    </p>
    <p>
      Caso queira a exclusão da sua conta propriamente no Sentinela, dentro do sistema navegue até a aba{" "}
      <strong className="text-foreground">Conta</strong>, desça a tela até o final da página e clique em{" "}
      <strong className="text-foreground">Excluir minha conta</strong>. Dúvidas: entre em contato com o suporte pelo botão de{" "}
      <strong className="text-foreground">WhatsApp</strong> na landing page ou pela aba{" "}
      <strong className="text-foreground">Suporte</strong> dentro do painel.
    </p>
  </LegalPageShell>
);

export default ExclusaoDadosPessoais;
