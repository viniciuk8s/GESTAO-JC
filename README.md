# JC Gestão — JC Elétrica & Solar

Sistema de gestão para a JC Elétrica & Solar: agenda de serviços, dias trabalhados,
colaboradores, movimentações financeiras, relatórios/documentos e **projetos (obras)** —
cada obra reúne, num só lugar, seus agendamentos, documentos e o financeiro. O repositório reúne
três partes que trabalham juntas mas evoluem de forma independente:

| Pasta | O que é | Precisa de |
|---|---|---|
| **`web/`** | O site (HTML/CSS/JS já prontos). Deploy no GitHub Pages. | Nada — abre no navegador |
| **`scss/`** | O sistema de estilos em SCSS (compila para `web/css/app.css`). | Node + `sass` |
| **`logica-ts/`** | Domínio tipado + testes + **API local** + bundles das telas. | Node 20+ |

O front é **estático e separado**: cada página carrega `css/app.css`, os scripts de
`js/` e — via CDN — os ícones (**Iconify/Lucide**), as fontes (Inter/Sora) e o
**ApexCharts**. Nada é embutido no HTML, o que deixa as páginas pequenas (2–15 KB).

---

## Começar rápido

> 🚀 **Primeira vez? Siga o [GUIA-PRIMEIROS-PASSOS.md](GUIA-PRIMEIROS-PASSOS.md)** — passo a passo
> para rodar, fazer login e cadastrar tudo do zero (inclui o modo "banco vazio" `SEED_DEMO=0`).

**Ver o protótipo** (sem instalar nada): abra `web/index.html` no navegador, ou sirva a
pasta para os caminhos relativos funcionarem melhor:

```bash
npm run serve        # http://localhost:8080  (serve a pasta web/)
```

As telas de **Movimentações**, **Relatórios** e **Colaboradores** usam a API local
(seção abaixo); sem ela, mostram um estado offline amigável e as demais seguem normais.

---

## Estrutura

```
jc-gestao/
├── web/                     # SITE ESTÁTICO (deploy) — commitado, pronto pro Pages
│   ├── index.html + telas   #   home, agendamentos, relatorios, movimentacoes, …
│   ├── css/app.css          #   compilado do SCSS
│   ├── js/                  #   bundles das telas (mov.js, rel.js, agenda.js…) + *.init.js
│   └── img/                 #   logo e ícone
├── scss/                    # FONTE do CSS (padrão 7-1: abstracts/base/layout/components/pages)
├── assets/                  # imagens-fonte da marca (icon.png, logo-branca.png)
├── build_site.py            # gerador: monta web/*.html a partir dos templates + bundles + CSS
├── logica-ts/               # DOMÍNIO + API (TypeScript)
│   ├── src/                 #   agendamentos, jornadas, movimentacoes, documentos, fiscal, planilhas
│   │   └── db/              #   Postgres via Drizzle (schema, repos, migração)
│   ├── dist/                #   bundles compilados (esbuild) → viram web/js/
│   └── drizzle/             #   migração das tabelas
├── package.json             # orquestra o build (css + js + site)
└── .github/workflows/       # deploy automático no GitHub Pages
```

---

## Build

Regenera o site a partir das fontes (SCSS + TypeScript):

```bash
npm install                 # instala o sass (compilador SCSS)
npm run build               # css + bundles + site  →  atualiza web/
```

Por etapas:

```bash
npm run build:css           # scss/main.scss  → web/css/app.css
npm run build:js            # logica-ts: esbuild dos 5 bundles → logica-ts/dist/
npm run build:site          # build_site.py: gera web/*.html e web/js/
```

Durante o desenvolvimento do estilo: `npm run build:css:dev` (recompila ao salvar).

### Ícones (Iconify / Lucide)
Os ícones não são mais SVG embutido: cada um é `<iconify-icon icon="lucide:nome">`,
resolvido em runtime pelo web component do **Iconify** (CDN). Isso enxugou o HTML e mantém
o visual Lucide. Para dimensionar/colorir, o CSS mira tanto `svg` quanto `iconify-icon`
(mixin `icon()` no SCSS) — as classes-wrapper (`.doc-ic`, `.excat`, `.ki`…) seguem iguais.

---

## Deploy

### GitHub Pages (front)
O workflow `.github/workflows/pages.yml` publica a pasta `web/` a cada push na `main`
(recompila o CSS antes). Ative em **Settings → Pages → Source: GitHub Actions**.

### API (back) e front hospedado
Conforme o plano do projeto: **Render** para a API (`logica-ts`, com `DATABASE_URL` de um
Postgres/Neon) e **Vercel** para o front (raiz do projeto = `web/`).

---

## API local (Postgres via Drizzle + fotos + import/export)

Express + TypeScript, com **persistência real em Postgres**. Sem `DATABASE_URL` usa
**PGlite** (Postgres embarcado, em `logica-ts/data/pg/`); com a variável definida, usa um
Postgres/Neon real — os mesmos endpoints nos dois modos.

```bash
cd logica-ts
npm install
npm run api                 # http://localhost:3000  (PGlite, já com dados de exemplo)

# Postgres real:
# DATABASE_URL=postgres://user:senha@host:5432/banco npm run db:push
# DATABASE_URL=postgres://user:senha@host:5432/banco npm run api
```

Deixe a API no ar e abra `web/colaboradores.html`: envie a foto de um colaborador e ela
substitui o avatar de iniciais em todas as telas. Em `web/movimentacoes.html` e
`web/relatorios.html`, o CRUD, o upload de documentos, o painel fiscal e o import/export
CSV/XLSX passam a operar com dados reais. Para apontar as telas a outra URL de API, defina
`window.JC_API` antes de carregar a página.

### Principais endpoints
```
GET/POST/DELETE /api/funcionarios/:id/foto
GET/POST/DELETE /api/agendamentos · POST /api/agendamentos/:id/concluir
GET /api/jornadas · GET /api/jornadas/por-funcionario
GET /api/documentos · GET /api/documentos/a-vencer?dias=30 · POST/DELETE /api/documentos[/:id]
GET /api/fiscal · POST /api/fiscal/obrigacoes/:id/pagar
GET /api/movimentacoes · GET /api/movimentacoes/resumo · POST/PUT/DELETE /api/movimentacoes[/:id]
GET /api/projetos · GET /api/projetos/:id (visão 360°) · POST/PUT/DELETE /api/projetos[/:id]
POST /api/importar (CSV/XLSX; ?dry=1 = só prévia) · GET /api/exportar?tipo=&formato=
GET /api/uploads/:id                          (fotos/documentos servidos do banco)
```

---

## Autenticação & Acesso

Login real com **autenticação própria** (sem serviço externo): senha em hash **scrypt** e
**JWT** assinado pelo backend. **Não há cadastro nem solicitação de acesso** — o sistema tem
**2 usuários fixos**, o **CEO** e o **TI**, ambos com **acesso total**. A API exige estar
logado (sem token → 401). Os **uploads** (fotos e documentos) ficam **no banco** (base64),
servidos por `GET /api/uploads/:id` — persistentes mesmo em Neon/Render.

**Como funciona no app**
- Toda página verifica o token; sem sessão, redireciona para `login.html` (só "Entrar").
- Os 2 usuários são semeados no banco na 1ª execução; para trocar as senhas, use `seed:admin`.

**Configuração** (veja `logica-ts/.env.example`): `AUTH_JWT_SECRET`, `AUTH_TOKEN_TTL`,
`ALLOWED_ORIGINS` (CORS de produção) e os dados dos 2 usuários: `CEO_NOME/EMAIL/SENHA` e
`TI_NOME/EMAIL/SENHA`.

```bash
cd logica-ts
npm run api                    # sobe a API; na 1ª vez cria os 2 usuários (CEO e TI)
# produção / trocar senhas:
CEO_SENHA=senhaForte TI_SENHA=outraSenha npm run seed:admin
```

**Credenciais de exemplo (seed local):** CEO `ceo@jcsolar.com` / `ceo123` ·
TI `ti@jcsolar.com` / `ti123`. **Troque em produção.**

Rotas de auth:
```
POST /auth/login            {email,senha} → {token,user}        (público)
GET  /auth/me                                                    (token)
POST /auth/senha            {atual,nova}                         (token)
```

> Observação: a API exige login para tudo; escrita continua protegida (os 2 usuários são
> admin). `agendamentos.html` e `dias-trabalhados.html` são telas de protótipo em
> `localStorage` (não passam pela API). Os `uploads` são servidos por id não-adivinhável.

---

## Testes

```bash
cd logica-ts
npm test            # 79 testes  → 79/79  (inclui auth: scrypt + JWT)
npm run typecheck   # tipos em modo estrito, 0 erros
```

A lógica de negócio é tipada e testada (dinheiro em centavos, datas `YYYY-MM-DD`, sem
float) — a mesma que roda no protótipo e na API.
