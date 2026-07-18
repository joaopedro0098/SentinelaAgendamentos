# Sentinela Connect (Chrome Extension)

Painel lateral no [WhatsApp Web](https://web.whatsapp.com) com dados do paciente no Sentinela Agendamentos.

## Pré-requisitos

1. Migration `20260717120000_extension_connect.sql` aplicada no Supabase.
2. Edge Function `extension-connect` deployada.
3. Token gerado em **Painel → Configurações → Sentinela Connect**.

## Carregar no Chrome (desenvolvimento)

1. Abra `chrome://extensions/`.
2. Ative **Modo do desenvolvedor**.
3. **Carregar sem compactação** → selecione esta pasta (`app/extension/sentinela-connect`).
4. Clique no ícone da extensão ou em **Detalhes → Opções da extensão**.
5. Cole o token `sc_live_…` e clique **Testar conexão** → **Salvar**.
6. Abra [web.whatsapp.com](https://web.whatsapp.com) e selecione uma conversa **individual**.

## Permissões

- `storage` — salvar token e preferências.
- `https://web.whatsapp.com/*` — content script e painel.
- `https://*.supabase.co/*` — chamadas à Edge Function (service worker).

A extensão **não envia** mensagens WhatsApp; só lê o DOM da conversa aberta.

## Modo debug

Nas opções, marque **Modo debug** para ver o telefone detectado no rodapé do painel. Use se o WhatsApp Web atualizar o DOM e a detecção falhar.

## Seletores frágeis

O WhatsApp Web muda o HTML com frequência. Estratégias atuais (em ordem):

1. `#main [data-id]` com sufixo `@c.us` / `@s.whatsapp.net`
2. `#main header [title]` com padrão de telefone
3. Texto do header

**Grupos** (`@g.us`): painel exibe “Abra conversa individual”.

Valide manualmente após updates do WhatsApp e ajuste `content.js` se necessário.

## Deploy da API

```bash
cd app
npx supabase functions deploy extension-connect
npx supabase db push
```

## Escopo CT/CA

O lookup usa as mesmas regras de `painel_barbearia_ids_visiveis` / toggles de visualização de CA agregada. Só retorna pacientes com **agendamento** em barbearia visível ao usuário do token.
