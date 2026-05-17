# Sentinela Agendamentos

Plataforma web: landing, autenticação, painel do estabelecimento e agendamento online.

## Estrutura do repositório

```text
SentinelaAgendamentos/
└── app/                    # Frontend (React + Vite + Supabase)
    ├── public/
    ├── src/                # App principal (landing, auth, painel)
    ├── agenda/             # Módulo de agendamento (telas públicas)
    └── supabase/           # Migrations e Edge Functions
```

## Desenvolvimento

```bash
cd app
npm install
npm run dev
```

Abre em `http://localhost:8080`.

## Rotas principais

| Rota | Descrição |
|------|-----------|
| `/` | Landing |
| `/planos` | Planos |
| `/login`, `/signup` | Autenticação |
| `/app/agendar` | Agendamento no painel (barbeiro) |
| `/app/settings` | Configurações da empresa |
| `/agendar/:slug` | Agendamento público do cliente |
| `/agendar/:slug/meus` | Meus agendamentos do cliente |

## Deploy (EasyPanel + GitHub)

No serviço **appgithub**, confira:

| Campo | Valor |
|-------|--------|
| **Root directory** | `app` |
| **Build** | `npm install && npm run build` |
| **Start** | `npm run start` |
| **Porta do domínio** | `3000` (tem que ser a mesma do `npm run start`) |

Adicione `sentinelagendamentos.com` + HTTPS. O `.easypanel.host` pode continuar em paralelo.

### Variáveis de ambiente (obrigatório no EasyPanel)

No painel, seção **Ambiente** (antes do build), adicione:

```env
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua_chave_anon_publica
```

(Alternativa aceita: `VITE_SUPABASE_ANON_KEY` no lugar de `VITE_SUPABASE_PUBLISHABLE_KEY`.)

**Onde pegar no Supabase:** Project Settings → API → **Project URL** e **anon public** (chave longa que começa com `eyJ…`). Não use a `service_role`. Sem aspas nos valores. URL sem `/rest/v1` no final.

**Erro "Invalid API Key" no site (mas local funciona)?** O EasyPanel gravou a chave **errada no build**. Confira:

1. **Ambiente** do serviço tem `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (mesmos valores do seu `.env` local).
2. Copie de novo no Supabase: Settings → API → **anon public** (começa com `eyJ`), não a `service_role`.
3. Salve e rode **Deploy/Rebuild** completo (`npm run build`). Só **restart** não atualiza o JS.
4. Se o build falhar com mensagem `[build] Variáveis do Supabase ausentes`, as variáveis não estão visíveis durante o build — ajuste no EasyPanel e tente de novo.

O Vite grava isso **na hora do build**. Sem essas variáveis, o site pode abrir só o fundo escuro sem conteúdo (JavaScript quebra).

**“Service is not reachable” ou 404?** Veja os logs. Se o app não sobe na porta **80**, use porta **3000** no `npm run start` **e** nos domínios do EasyPanel (`:3000`, não `:80`). Pasta raiz: `app`.

Supabase Auth: `https://sentinelagendamentos.com/auth/callback`
