# Sentinela Agendamentos

Plataforma web unificada: landing, autenticação, painel do estabelecimento e chat público com IA.

## Estrutura do repositório

```text
SentinelaAgendamentos/
└── app/                    # Frontend (React + Vite + Supabase)
    ├── public/
    ├── src/
    │   ├── app/            # Shell: App, router
    │   ├── features/       # Domínios por funcionalidade
    │   ├── components/     # UI compartilhada (shadcn) e guards
    │   ├── hooks/
    │   ├── integrations/   # Supabase client e types
    │   ├── lib/
    │   ├── pages/          # Páginas globais (404)
    │   └── styles/
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

| Rota | Feature |
|------|---------|
| `/` | Landing |
| `/planos` | Planos |
| `/login`, `/signup` | Auth |
| `/app` | Dashboard |
| `/c/:slug` | Chat do cliente |

## Deploy (EasyPanel + GitHub)

No serviço **appgithub**, confira:

| Campo | Valor |
|-------|--------|
| **Root directory** | `app` |
| **Build** | `npm install && npm run build` |
| **Start** | `npm run start` |
| **Porta do domínio** | `80` |

Adicione `sentinelagendamentos.com` + HTTPS. O `.easypanel.host` pode continuar em paralelo.

**404?** Veja os logs do deploy. Causas comuns: pasta raiz errada (tem que ser `app`), build falhou, ou container sem `npm run start`. **Não** é falta de “apontar para a landing” — a rota `/` já é a home no código.

Supabase Auth: `https://sentinelagendamentos.com/auth/callback`
