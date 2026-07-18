# Sentinela Connect (Chrome Extension)

Painel lateral no [WhatsApp Web](https://web.whatsapp.com) com histórico do paciente (mesma regra da aba Pacientes).

## Pré-requisitos

1. Migrations Connect aplicadas (`db push`).
2. Edge Function `extension-connect` deployada.
3. Token gerado em **Painel → Connect** (desktop).

## Instalação (dev)

1. `chrome://extensions` → Modo desenvolvedor → Carregar sem compactação → esta pasta.
2. Aba **Connect** no Sentinela → **Gerar token** → **Aplicar na extensão**.
3. Abrir [web.whatsapp.com](https://web.whatsapp.com) e selecionar conversa individual.

**Após recarregar a extensão** em `chrome://extensions`, dê **F5 na aba do WhatsApp** — senão aparece *Extension context invalidated*.

O wa-js precisa ser injetado no carregamento da página; após atualizar a extensão, **feche e abra de novo** a aba do WhatsApp (ou Ctrl+Shift+R).

## Painel

- Cabeçalho: foto, nome, WhatsApp.
- Botão **Agendar** (sem ação por enquanto).
- **Agendamentos**: abas **Últimos** e **Futuros** (uma lista por vez; mesma regra da aba Pacientes).
- **Mensagens pré-definidas**: botão fixo no rodapé do painel; insere texto no WhatsApp (`%paciente%`, `%clinica%`, `%consultorio%`, `%agendamento%`).

## Modo debug

Opções da extensão → **Modo debug** → mostra `id=` / `jid=` no rodapé do painel.

## Deploy

```bash
cd app
npx supabase db push
npx supabase functions deploy extension-connect
```
