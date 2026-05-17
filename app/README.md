# Sentinela Agendamentos — Frontend

## Arquitetura (`src/`)

```text
src/
├── app/
│   ├── App.tsx           # Providers globais
│   └── router.tsx        # Rotas da aplicação
├── features/
│   ├── landing/          # Marketing (home, planos, legais)
│   ├── auth/             # Login, cadastro, recuperação
│   ├── agenda/           # Wrappers do módulo de agendamento (@agenda)
│   └── dashboard/        # Painel (/app/agendar, /app/agendamentos, /app/settings)
├── components/
│   ├── ui/               # Design system (shadcn)
│   ├── guards/           # RequireAuth
│   └── theme/            # Tema por rota + toggle claro/escuro
├── hooks/
├── integrations/supabase/
├── lib/
├── pages/NotFound.tsx
└── styles/index.css

agenda/                   # Módulo de agendamento (importado via @agenda)
└── src/
    ├── pages/            # PublicBooking, MeusAgendamentos
    └── components/agenda/
```

## Scripts

```bash
npm run dev      # desenvolvimento (porta 8080)
npm run build    # produção
npm run start    # serve dist na porta 3000
```

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha as chaves do Supabase.
