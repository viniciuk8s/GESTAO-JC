# JC Gestão — Primeiros passos

Guia rápido para **rodar o sistema**, **fazer login** e **cadastrar tudo do zero**.

---

## 0. Pré-requisitos (instalar uma vez)

- **Node.js 20 ou superior** — baixe em https://nodejs.org (confira com `node -v`).
- **Python 3** — só para servir o site. Já vem no Mac/Linux. No Windows há uma alternativa (passo 3).
- O projeto **descompactado** (a pasta `jc-gestao`).

Todos os comandos abaixo são digitados no **Terminal** (Mac/Linux) ou **Prompt de Comando/PowerShell** (Windows).

---

## 1. Subir a API (o "motor" que guarda os dados)

Abra um terminal **dentro da pasta `jc-gestao`** e rode:

```bash
cd logica-ts
npm install        # baixa as dependências (só na 1ª vez, ~1 min)
npm run api        # liga a API
```

Deve aparecer: `API JC Elétrica & Solar em http://localhost:3000`.
**Deixe esse terminal aberto** (é o motor rodando). Na 1ª vez ele cria o banco local em `logica-ts/data/pg` e os 2 usuários.

---

## 2. Começar com o banco VAZIO (para cadastrar do zero) — recomendado

Por padrão o sistema vem com **dados de exemplo**. Para começar limpo, ainda **dentro de `logica-ts`**:

1. Pare a API com **Ctrl + C**.
2. Crie o arquivo de configuração a partir do exemplo:
   ```bash
   cp .env.example .env      # Windows: copy .env.example .env
   ```
3. Abra o `.env` num editor e deixe assim (troque as senhas se quiser):
   ```env
   SEED_DEMO=0
   CEO_SENHA=troque-esta-senha
   TI_SENHA=troque-esta-senha
   ```
4. Apague o banco de exemplo e suba de novo:
   ```bash
   npm run db:reset
   npm run api
   ```

Agora o sistema sobe **vazio** — só com a equipe e os 2 usuários. Tudo o mais você cadastra pelas telas.

> Se é a **primeiríssima vez** (nunca rodou com dados), basta ter `SEED_DEMO=0` no `.env` **antes** do primeiro `npm run api` — o `db:reset` nem é necessário.

---

## 3. Abrir o site (a interface)

Abra um **segundo terminal**, agora na **raiz da pasta `jc-gestao`** (não em `logica-ts`):

```bash
npm run serve      # publica o site em http://localhost:8080
```

> Sem Python no Windows? Use no lugar: `npx http-server web -p 8080`

Deixe também esse terminal aberto.

---

## 4. Entrar (login)

No navegador, acesse: **http://localhost:8080**

Você cai na tela de login. Entre com um dos 2 usuários:

| Usuário | E-mail | Senha |
|---|---|---|
| **CEO** | `ceo@jcsolar.com` | `ceo123` (ou a que você definiu no `.env`) |
| **TI**  | `ti@jcsolar.com`  | `ti123` (ou a do `.env`) |

Pronto — você está dentro do sistema. O botão **Sair** fica no canto inferior esquerdo (no seu nome).

---

## 5. Cadastrar tudo do zero

Ordem sugerida (cada tela tem um botão **“Novo …”** ou o **+** flutuante):

1. **Projetos & Obras** → *Novo projeto*: cadastre cada obra (cliente, valor contratado, status, prazo).
2. **Movimentações** → *Novo lançamento*: entradas e saídas de dinheiro (valor em R$; marque *pago / pendente / agendado*). Dá para vincular a um projeto.
3. **Agendamentos** → *Novo agendamento*: serviços e visitas (data, hora, técnico, valor). Ao **concluir** um serviço, ele vira automaticamente um **dia trabalhado**.
4. **Relatórios & Documentos** → *Novo documento*: anexe contratos, notas fiscais, garantias, laudos (o arquivo fica guardado no banco).
5. **Relatórios → aba Fiscal**: marque as guias de imposto como **pagas** conforme forem quitadas.
6. **Colaboradores**: envie a **foto** de cada colaborador (ela passa a valer em todas as telas).
7. **Relatórios → aba Planilhas** (opcional): **importe** um monte de lançamentos de uma vez a partir de um CSV/XLSX (tem *Baixar modelo* para você preencher).

Tudo o que você cadastra aparece **ao vivo** nos gráficos do **Início** e de cada seção.

> Nesta versão, **Agendamentos** e **Dias trabalhados** guardam os dados no próprio **navegador**; as demais telas gravam no **banco** pela API. (Dá para migrar essas duas para o banco quando você quiser.)

---

## 6. Parar, reiniciar e recomeçar

- **Parar tudo:** `Ctrl + C` em cada um dos dois terminais.
- **Reiniciar depois:** repita o **passo 1** (`npm run api`) e o **passo 3** (`npm run serve`). Seus dados continuam salvos em `logica-ts/data/pg`.
- **Recomeçar do zero de novo:** na pasta `logica-ts`, rode `npm run db:reset` e depois `npm run api`.
- **Trocar só as senhas:** `CEO_SENHA=novaSenha TI_SENHA=outra npm run seed:admin` (na pasta `logica-ts`).

---

## 7. Se algo não funcionar

- **Telas mostram “API offline”** → a API (passo 1) não está no ar. Confirme abrindo http://localhost:3000/health — deve responder `{"status":"ok"}`.
- **“Porta já em uso”** → feche outros programas na porta, ou troque a porta do site: `npx http-server web -p 8090`.
- **Esqueci a senha** → redefina com `CEO_SENHA=... npm run seed:admin` (passo 6).
- **Quero ver os dados de exemplo de novo** → tire o `SEED_DEMO=0` do `.env` (ou ponha `=1`), rode `npm run db:reset` e `npm run api`.

---

## 8. Depois: publicar na internet (quando quiser)

O projeto já está preparado para hospedar: **API no Render + banco no Neon** e **site na Vercel ou GitHub Pages**. É só me avisar que eu faço o passo a passo do deploy com você.
