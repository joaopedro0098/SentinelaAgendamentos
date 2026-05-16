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
| **Porta do domínio** | `3000` (tem que ser a mesma do `npm run start`) |

Adicione `sentinelagendamentos.com` + HTTPS. O `.easypanel.host` pode continuar em paralelo.

### Variáveis de ambiente (obrigatório no EasyPanel)

No painel, seção **Ambiente** (antes do build), adicione:

```env
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua_chave_anon_publica
```

O Vite grava isso **na hora do build**. Sem essas variáveis, o site pode abrir só o fundo escuro sem conteúdo (JavaScript quebra).

**“Service is not reachable” ou 404?** Veja os logs. Se o app não sobe na porta **80**, use porta **3000** no `npm run start` **e** nos domínios do EasyPanel (`:3000`, não `:80`). Pasta raiz: `app`.

Supabase Auth: `https://sentinelagendamentos.com/auth/callback`
