# Sentinela Agendamentos — Frontend

## Arquitetura (`src/`)

```text
src/
├── app/
│   ├── App.tsx           # Providers globais
│   └── router.tsx        # Definição de rotas
├── features/
│   ├── landing/          # Marketing (home, planos, legais)
│   ├── auth/             # Login, cadastro, recuperação
│   ├── chat/             # Chat público (/c/:slug)
│   ├── dashboard/        # Painel do barbeiro (/app)
│   └── admin/            # Painel admin
├── components/
│   ├── ui/               # Design system (shadcn)
│   ├── guards/           # RequireAuth, RequireAdmin
│   └── theme/            # ThemeFromRoute
├── hooks/
├── integrations/supabase/
├── lib/
├── pages/NotFound.tsx
└── styles/index.css
```

## Scripts

```bash
npm run dev      # desenvolvimento
npm run build    # produção
npm run test     # testes (vitest)
```

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha as chaves do Supabase.
