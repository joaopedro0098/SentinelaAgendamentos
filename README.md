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

## Deploy (Vercel)

Frontend na **Vercel**, pasta raiz do repositório: `app`.

| Campo | Valor |
|-------|--------|
| **Root Directory** | `app` |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |

Domínio: `sentinelagendamentos.com` (HTTPS).

### Variáveis de ambiente

Configure em **Settings → Environment Variables** (Production e Preview):

```env
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua_chave_anon_publica
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

(Alternativa aceita: `VITE_SUPABASE_ANON_KEY` no lugar de `VITE_SUPABASE_PUBLISHABLE_KEY`.)

**Onde pegar no Supabase:** Project Settings → API → **Project URL** e **anon public** (chave longa que começa com `eyJ…`). Não use a `service_role`. Sem aspas nos valores. URL sem `/rest/v1` no final.

O Vite grava isso **na hora do build**. Após alterar variáveis, faça um **novo deploy** (não basta reiniciar).

Se o build falhar com `[build] Variáveis do Supabase ausentes`, as variáveis não estão disponíveis durante o build — confira no painel da Vercel e tente de novo.

**Supabase Auth:** redirect URL `https://sentinelagendamentos.com/auth/callback`
