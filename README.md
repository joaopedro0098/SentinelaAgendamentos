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

## Deploy

Um único build (`app`) no EasyPanel, domínio `sentinelagendamentos.com`, fallback SPA para `index.html`.

Supabase Auth: incluir `https://sentinelagendamentos.com/auth/callback` nas redirect URLs.
