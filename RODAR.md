# Como rodar o JC Gestão localmente

Este projeto **já está com todas as correções aplicadas e o front reconstruído**.
Você só precisa instalar as dependências da API uma vez e usar 2 terminais.

Precisa ter o **Node.js 18+** e o **Python 3** instalados.

---

## Passo 1 — instalar (uma única vez)

Abra um terminal **na pasta `logica-ts`** e rode:

```
cd logica-ts
npm install
```

Espere terminar (~1 min).

---

## Passo 2 — ligar a API (Terminal 1)

Ainda **na pasta `logica-ts`**:

```
APP_HOJE=2026-07-22 npm run api
```

> No Windows (PowerShell), use:
> ```
> $env:APP_HOJE="2026-07-22"; npm run api
> ```

Vai aparecer `API JC Elétrica & Solar em http://localhost:3000`.
**Deixe este terminal aberto.**

---

## Passo 3 — ligar a tela (Terminal 2)

Abra **outro** terminal, agora **na pasta raiz do projeto** (`jc-gestao`), e rode:

```
npm run serve
```

Isso serve a interface em **http://localhost:8080**.
**Deixe este terminal aberto também.**

---

## Passo 4 — usar

Abra no navegador:

```
http://localhost:8080
```

Login: **ceo@jcsolar.com** / senha **ceo123**

Pronto. A Agenda, o financeiro, os documentos e tudo mais estão funcionando,
com os dados vindo do banco local (PGlite, criado automaticamente em `logica-ts/data/pg`).

Para **parar**: clique em cada terminal e aperte **Ctrl + C**.

---

## Se um dia você mexer no código (opcional)

Para reconstruir os bundles do front e as páginas depois de editar os `.ts`:

```
npm run build      (na pasta raiz — refaz CSS + bundles + páginas)
```

---

## Para o DEPLOY (quando for colocar no ar)

Em produção, defina estas variáveis de ambiente na API:

- `NODE_ENV=production`
- `ALLOWED_ORIGINS` — o domínio do front, ex.: `https://gestao.jcsolar.com.br` (sem `*`; se faltar, a API recusa subir, de propósito)
- `AUTH_JWT_SECRET` — um segredo forte
- `DATABASE_URL` — Postgres/Neon
- `APP_HOJE` — deixe em branco (usa a data real)

---

## App no celular (PWA) e notificações

O app agora é um **PWA**: pode ser instalado no celular (ícone na tela inicial, abre em tela cheia, sem barra do navegador) e dispara **notificações do sistema** a partir da central de notificações que já existe.

### Requisito importante: HTTPS
Service worker e instalação só funcionam em **contexto seguro**: `https://` **ou** `http://localhost`. Abrir pelo celular via `http://IP-do-PC:8080` **não** habilita (é http comum). Para usar no celular, sirva a pasta `web/` por HTTPS. Opções:
- **Hospedar** a pasta `web/` (Netlify, Vercel, Cloudflare Pages, GitHub Pages…) e a API em outro serviço com HTTPS. Aponte o front para a API definindo, antes dos bundles, `window.JC_API = "https://sua-api"`.
- Ou um **túnel HTTPS** temporário para a porta 8080 (cloudflared, ngrok etc.).

### Instalar
- **Android (Chrome):** abrir o site → menu ⋮ → “Instalar app” / “Adicionar à tela inicial”.
- **iPhone (Safari):** abrir o site → botão Compartilhar → “Adicionar à Tela de Início”.

### Notificações
- Toque no **sino** uma vez para o navegador pedir permissão de notificações.
- A partir daí, quando surgir uma nova pendência (a mesma que aparece no sino), o celular mostra uma **notificação do sistema**. Ela aparece quando o app está **em segundo plano** (se estiver aberto na frente, você já vê no sino). Tocar na notificação abre a tela relacionada.
- As notificações usam o mesmo sinal em tempo real (SSE) do sino — ou seja, dependem do app estar **aberto ou em segundo plano**.

### Notificações com o app fechado (evolução futura)
Para avisar com o app totalmente fechado é preciso **Web Push** iniciado pelo servidor (chaves VAPID + guardar as inscrições + a API enviar os pushes). O service worker já tem o gancho `push` pronto; falta a parte do servidor. É o próximo passo natural quando quiser esse alcance.

---

## Criar conta (com aprovação do TI)

Agora dá para **criar conta** pelo próprio app. O fluxo é: a pessoa solicita → o **TI aprova** → ela entra. O nome informado no cadastro é o que aparece no "Bom dia, Fulano".

### 1) Bootstrap (uma vez)
Na primeira execução a API já cria os dois usuários base (CEO e TI). Para (re)criar/definir senhas manualmente:
```
cd logica-ts
CEO_SENHA=umaSenhaForte TI_SENHA=outraSenha npm run seed:admin
```
O **TI** (padrão `ti@jcsolar.com`) é quem libera as contas novas.

### 2) A pessoa solicita a conta
No app → tela de login → **"Criar conta"** → informa **nome, e-mail e senha** → **Criar conta**. Aparece "Solicitação enviada". (Ela ainda **não** consegue entrar.)

### 3) O TI aprova (pelo terminal)
Na pasta `logica-ts`:
```
npm run contas                       # lista as solicitações pendentes e as contas ativas
npm run contas aprovar EMAIL         # libera o acesso (cria a conta)
npm run contas rejeitar EMAIL        # recusa a solicitação
```
Ex.: `npm run contas aprovar rodrigo@jcsolar.com`

### 4) A pessoa entra
Depois de aprovada, é só entrar com e-mail e senha. O nome aparece nas boas-vindas.

### Alternativa: aprovar pela API (para um painel do TI no futuro)
Todos exigem um token de **admin** (o TI faz login e usa o token no header `Authorization: Bearer <token>`):
- `POST /auth/registrar` — `{ nome, email, senha }` (público) → cria a solicitação
- `GET /auth/solicitacoes?status=pendente` — lista (TI)
- `POST /auth/solicitacoes/:id/aprovar` — aprova (TI) · corpo opcional `{ "role": "viewer" }`
- `POST /auth/solicitacoes/:id/rejeitar` — rejeita (TI)

> Segurança: a senha é guardada com hash (scrypt) já na solicitação; a lista para o TI **não** expõe a senha. Contas só entram quando `ativo = true` (criado na aprovação).
