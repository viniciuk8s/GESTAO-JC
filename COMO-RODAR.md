# Como rodar a JC Gestão no desktop (local)

**Pré-requisitos:** Node.js 18+ e Python 3 instalados.
O banco de dados é **local (PGlite)** — não precisa instalar Postgres nem nada externo.

Você vai usar **2 terminais**: um para a API (backend) e outro para o site (frontend).
O frontend já vem **pronto** dentro da pasta `web/` — não precisa compilar nada para testar.

---

## Passo a passo

### 1) Descompacte o zip
Abra a pasta `jc-gestao` que saiu do zip.

### 2) Terminal 1 — Backend (API) em http://localhost:3000
```bash
cd jc-gestao/logica-ts
npm install          # baixa as dependências do backend (só na 1ª vez)
npm run api          # sobe a API
```
Deixe esse terminal rodando. Na primeira vez ele cria o banco e os dados de
exemplo (leva ~15 s) e mostra:

```
API JC Elétrica & Solar em http://localhost:3000  (banco: PGlite local)
```

### 3) Terminal 2 — Frontend (site) em http://localhost:8080
Abra **outro** terminal:
```bash
cd jc-gestao
npm run serve        # serve a pasta web/ em http://localhost:8080
```

### 4) Abra no navegador
Acesse **http://localhost:8080** — cai na tela de login.

Entre com um destes usuários:

| Papel | E-mail | Senha |
|------|--------|-------|
| CEO  | `ceo@jcsolar.com` | `ceo123` |
| TI   | `ti@jcsolar.com`  | `ti123`  |

Pronto — o app abre com os dados de exemplo. 🎉

---

## Testar o "Criar conta" (com aprovação do TI)
1. Na tela de login → **Criar conta** → informe nome, e-mail e senha → **Criar conta**.
2. No **Terminal 1** (pasta `logica-ts`), aprove:
   ```bash
   npm run contas                    # lista as solicitações pendentes
   npm run contas aprovar SEU_EMAIL  # libera o acesso
   ```
3. Volte ao login e entre com o e-mail e a senha que você cadastrou.

---

## Dicas e ajustes

- **Começar com o banco VAZIO** (sem dados de exemplo), para cadastrar tudo do zero:
  no Terminal 1 use `SEED_DEMO=0 npm run api`.
- **Reconstruir o frontend** (só se você mexer no código/estilos), na pasta `jc-gestao`:
  ```bash
  npm install     # instala o sass (só na 1ª vez)
  npm run build   # gera CSS + bundles JS + HTML em web/
  ```
- **Trocar as portas**:
  - API: `PORT=4000 npm run api`
  - Site: edite a porta no comando `npm run serve` (padrão 8080).
  - O site procura a API sozinho em `http://localhost:3000`. Se mudar a porta da API,
    posso deixar isso configurável — é só pedir.
- **Parar tudo:** `Ctrl+C` em cada terminal.

## Se algo não abrir
- Confirme que o **Terminal 1** está mostrando a linha `API ... em http://localhost:3000`.
- Confirme que você abriu **http://localhost:8080** (o site), e não a porta 3000 (essa é só a API).
- Abra o Console do navegador (F12) — se aparecer erro de rede, quase sempre é a API
  não estar rodando no Terminal 1.

---

## Configurar conta (foto, e-mail, senha) — com aprovação do TI

O usuário pode pedir para trocar **foto, e-mail e/ou senha** pelo próprio app:
no avatar do topo → **Configurar conta** → preenche o que quer mudar →
**Enviar para o TI**. As mudanças ficam **pendentes** até você (TI) aprovar.

### Como você (TI) aprova
Na pasta `logica-ts`:
```bash
npm run contas
```
Isso lista, além dos cadastros novos, as **"Alterações de conta PENDENTES"** — cada
uma com um rótulo claro ("Trocar a senha", "Trocar e-mail para ...", "Trocar a foto
de perfil") e um **id** que começa com `alt_`. Exemplo:
```
=== Alterações de conta PENDENTES (1) ===
  • Trocar a foto de perfil  (conta rodrigo@jcsolar.com)  · pedido em ...  [alt_ab12cd]
      aprovar: npm run contas aprovar alt_ab12cd   |   rejeitar: npm run contas rejeitar alt_ab12cd
```
Aprovar aplica a mudança na hora:
```bash
npm run contas aprovar alt_ab12cd     # aplica (e-mail/senha/foto)
npm run contas rejeitar alt_ab12cd    # recusa
```
- **E-mail** e **senha** passam a valer no próximo login.
- A **foto** aparece no avatar do topo assim que o usuário recarregar/entrar de novo.

> Segurança: a senha vai já em **hash** no pedido; a lista para o TI mostra só o
> rótulo (não expõe a senha). A foto é reduzida no aparelho antes de enviar.
