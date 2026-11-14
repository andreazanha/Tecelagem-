# MANUAL DO PROJETO — Big Tricot (leia isto primeiro)

> **Este é o manual que TODA sessão do Claude lê sozinha ao abrir o projeto.**
> Ele existe pra você (Claude) já saber tudo do negócio **sem o André precisar explicar de novo**.
> Leia inteiro antes de começar qualquer coisa.
>
> **Dono do projeto:** André (Big Tricot). **O André NÃO é programador.** Fale com ele em
> **português simples**, sem jargão. Detalhe técnico você descobre **lendo o próprio código** —
> não pergunte coisa de programação pro André.
>
> **Mantenha este manual SEMPRE em dia:** sempre que mexer em algo importante, atualize este
> arquivo (ver a seção "Como manter este manual em dia").

---

## 1. O que é o negócio

**Big Tricot** é uma **malharia de decoração** (home decor). Produz e vende:

- **Mantas**, **capas de almofada**, **almofadas** (capa + enchimento) e **kits** (conjuntos).

Canais e sistemas:

- **Catálogo online / loja B2B** — duas lojas (ver seção 2):
  - **Representante:** `vendas.bigtricot.com.br`
  - **Cliente:** `pedidos.bigtricot.com.br`
- **Sistema próprio** (este projeto) — controla **toda a produção**, do pedido à entrega, com
  rastreabilidade (quem, quando, o quê). A produção tem **9 fases** (Tecelagem, Passadoria, Corte,
  Costura, Revisão, Expedição, Fiscal, Transporte...). Ver `docs/00-VISAO-GERAL.md`.
- **ERP Syntech** — o sistema **oficial/financeiro** da Big. É **manual e da Big** (ver as regras
  fixas na seção 3). Nosso sistema **conversa** com o Syntech pela **ponte**, mas não manda nele.

---

## 2. O fluxo real do pedido (do clique à produção)

Confirmado no código e em `FLUXO-PEDIDO-ERP.md`. A ordem é esta:

1. **O pedido nasce na loja.**
   - **Cliente** finaliza o dele em `pedidos.bigtricot.com.br`.
   - **Representante** finaliza o dele em `vendas.bigtricot.com.br` (botão "✅ Enviar à Big").
   - O pedido fica **pendente**, aguardando ir pro Syntech. As peças já ficam **reservadas** no
     estoque e há um **contador** rodando.

2. **A PONTE envia o pedido pro Syntech, automaticamente.**
   - A ponte é um programinha (`bridge/sync.js`) que roda **no servidor da fábrica, 24h**, como
     tarefa agendada do Windows a **cada 2 minutos**. Ela se **atualiza sozinha**.
   - Ao gravar no Syntech, nosso sistema marca o pedido como **enviado** (`erp_sync_status='enviado'`),
     **mantém a reserva** e **encerra o contador**.
   - **Esta é a ÚNICA escrita automática permitida no Syntech**: inserir o pedido novo da loja (a
     "porta de entrada"). Nada mais (ver regra fixa na seção 3).

3. **A Big APROVA o pedido dentro do Syntech** (ação manual, no próprio ERP).

4. **Depois de aprovado, o pedido VOLTA pro sistema** com o status atualizado.
   - A ponte lê do Syntech os pedidos nos status **10 = aprovado**, **20 = separado**,
     **30 = faturado** (`STATUS_INGEST`) e traz pra cá.
   - No sistema ele aparece pra **conferência no PCP** ("Para conferir").

5. **Segue toda a produção** (as 9 fases — Tecelagem etc.), rastreada fase a fase.

6. **Único passo manual no fim = FATURAR dentro do Syntech.**
   - No Syntech, **só dá baixa no produto (estoque) quando FATURA** (status **30**). Antes disso o
     pedido fica **aguardando a produção finalizar**.
   - Enquanto a Big não aprova no Syntech, o pedido na loja fica **"Enviado para a Big Tricot"**;
     quando a Big aprova, vira **"Aprovado"**.

> Resumo em uma linha: **loja → ponte grava no Syntech → Big aprova no Syntech → volta pro sistema →
> produção → Big fatura no Syntech.** Tudo automático, menos **aprovar** e **faturar** (manuais, da Big).

---

## 3. Regras fixas (INQUEBRÁVEIS)

### 3.1 O Syntech é MANUAL e da Big — quase intocável
- **Nunca** altere, edite, apague ou automatize nada **dentro** do Syntech: não automatize
  **aprovar**, **faturar**, **dar baixa**, **mudar status** nem mexer em cadastro de lá.
- Do Syntech, no máximo: **LER** um dado que ele **já gerou** (status do pedido, número, etc.).
- **Única exceção** (já existente e confirmada pelo André): a **ponte insere o pedido novo da loja**
  no Syntech — é a porta de entrada do pedido. Fora isso, trate o Syntech como **somente leitura**.
- Na dúvida se algo "escreve no Syntech", **não faça** e **pergunte ao André** antes.

### 3.2 O que vira PRODUÇÃO e o que é ESTOQUE
- **Item normal da loja (manta, capa, almofada) → vai pra PRODUÇÃO (tecelagem)** sempre que é
  pedido pelo cliente ou representante. É o caminho normal (loja → Syntech → Big aprova → volta →
  produção, seção 2).
- **KIT = SEMPRE estoque**, **NUNCA** entra na produção/tecelagem. É controlado **aqui no nosso
  sistema**, não no Syntech (o Syntech nunca reconhece um kit).
- **Pronta-entrega** (item já pronto, marcado como pronta-entrega) = sai do **estoque**, **não**
  passa pela Tecelagem.
- Regra do KIT ao enviar pro Syntech: o kit é **explodido** em peças; manda-se a **ALMOFADA** (que
  tem cadastro próprio no Syntech, com o enchimento já no preço) + a **PESEIRA** — **mas o ESTOQUE é
  controlado pela CAPA** (a almofada só diz que tem enchimento; não gera outro item, continua sendo a
  capa). Isso é **regra geral dos produtos**. Ver `src/loja-estoque.ts` e `src/routes/integracao.ts`.
- **💰 PREÇO DO KIT (regra INQUEBRÁVEL, confirmada pelo André): o preço do kit é a SOMA EXATA dos
  preços REAIS das peças (atacado por tamanho) lidos do Syntech. NUNCA aplicar fator nem "espremer"
  o preço.** Se uma peça não tiver preço no Syntech, o sistema **PARA e avisa — nunca chuta**
  (o pedido fica pendente, não vai com preço inventado). Onde vive: `desmembrarKits` em
  `src/routes/integracao.ts` usa `precoLinha` (preço por tamanho do espelho `erp_produtos.tamanhos`,
  que a ponte sincroniza de `TAMANHO_PROD.PRECO_VENDA` do Syntech). **Houve um bug antigo (16/out a
  14/nov): um `fator` espremia o preço pra somar o valor do kit da loja — REMOVIDO.** Não reintroduza.

### 3.3 Comissão
- A comissão é controlada **no Syntech**, então o pedido da loja precisa **levar o representante**
  (campo GUIA) quando vai pro Syntech. Ver `pedidos-para-erp` e `gravarUmPedido`.

---

## 4. Como VOCÊ (Claude) deve trabalhar neste projeto

1. **Nada vai pro ar sem o André ver e aprovar.** Trabalhe sempre numa **cópia segura** (branch),
   em **mudanças pequenas e reversíveis**. **Teste e mostre** antes de publicar.
2. **Descubra o técnico lendo o código.** O André não programa — **não faça perguntas técnicas a
   ele**. Se precisa saber como algo funciona, **leia o código/os docs**.
3. **Só pergunte ao André coisas do dia a dia do NEGÓCIO**, em **português simples** e **uma de cada
   vez** (ex.: "o representante também vende pronta entrega?", nunca "qual schema da tabela X?").
4. **Fale sempre em português simples** com o André, inclusive ao explicar o que fez.
5. **⚠️ ARMADILHA DOS ARQUIVOS GERADOS** (erro que já nos custou caro — leia com atenção):
   - `src/siteLoja.ts` é **GERADO** de **`site/loja.html`** (por `scripts/gen-site-template.mjs`).
   - `src/bridgeScript.ts` é **GERADO** de **`bridge/sync.js`** (por `scripts/gen-bridge-script.mjs`).
   - O **deploy regenera esses `.ts`** antes de publicar. Se você editar o `.ts` gerado, sua mudança
     é **apagada** no deploy. **SEMPRE edite a FONTE** (`site/loja.html`, `bridge/sync.js`) e rode o
     gerador pra conferir. Os dois `.ts` começam com o aviso "GERADO ... NÃO edite à mão".
6. **Confirme o resultado de verdade.** Depois de publicar, verifique (deploy verde, e o conteúdo
   certo no arquivo que foi pro ar). Não diga "está pronto" sem ter checado.

---

## 5. Mapa técnico rápido (onde está cada coisa)

**Stack:** Cloudflare Worker + **Hono** (`src/`) · **D1** (SQLite, `migrations/`) · **R2** (PDFs,
binding `BUCKET`) · **React + Vite** SPA (`web/`). Detalhes: `README.md` e `docs/01-ARQUITETURA.md`.

- **API / rotas:** `src/routes/*.ts` (ex.: `loja.ts`, `integracao.ts`, `pedidos.ts`, `producao.ts`,
  `tecelagem.ts`, `expedicao.ts`, `etiquetas.ts`, `chat.ts`, `setores.ts`, `push.ts`).
- **Loja (catálogo) — FONTE:** `site/loja.html` → gera `src/siteLoja.ts`. Servida em `src/index.ts`
  (`pedidos.` = cliente, `vendas.` = representante).
- **Ponte (integração Syntech) — FONTE:** `bridge/sync.js` → gera `src/bridgeScript.ts`. Roda no
  servidor da fábrica (`C:\ponte-bigtricot`), tarefa agendada "TecelagemPonte", a cada 2 min, modo
  `--once`, com **auto-atualização**. Todos os endpoints de integração usam o header
  `X-Integracao-Token` (`integracao.ts`).
- **Estoque/KIT:** `src/loja-estoque.ts` (estoque controlado pela **capa**).

**Como publicar (deploy):**
- Branch de trabalho/produção: **`claude/rolagem-fase-architecture-s47d3e`**.
- Fluxo: criar **branch de feature** → **PR** → **merge (squash)** na branch de produção.
- O **`.github/workflows/deploy.yml`** dispara sozinho no push dessa branch e faz: instalar deps →
  `build:web` → `gen-bridge-script.mjs` → `gen-site-template.mjs` → migrations do D1 → publicar na
  Cloudflare. (Por isso os geradores rodam no deploy — ver armadilha 4.5.)

**Rodar/testar local:**
```bash
npm run db:migrate:local            # banco D1 local
npm run dev                         # Worker em http://localhost:8787  (admin/admin)
npm run dev:web                     # frontend com hot-reload (outro terminal)
```
> Obs.: este ambiente de nuvem **não tem rota de rede pra abrir as lojas** (`pedidos.`/`vendas.`),
> então não dá pra abrir o site publicado por aqui — confira pelo **arquivo gerado** e pelo **deploy
> verde**.

---

## 6. Estado atual (em que estamos trabalhando)

Frentes abertas / em evolução (atualizar conforme avança):

- **Etiquetas de código de barras / impressão térmica** (`src/routes/etiquetas.ts`).
- **Expedição e estoque por bipagem** (ler código de barras pra dar entrada/saída) — `expedicao.ts`.
- **Central de avisos no WhatsApp** (notificações pra equipe/cliente).
- **Chat interno por setor** (`chat.ts`, `setores.ts`).

Já no ar recentemente:
- **Menus reorganizados** (`web/src/components/Layout.tsx` + guards de rota em `web/src/main.tsx`):
  - Novo menu **"Comercial"** (equipe): Cadastros da Loja, Abrir a loja, Representantes, Abrir área
    do representante. Liberado por permissão `comercial` **ou** `representantes` (tela Acessos).
  - Menu **"Gestão" trancado só pro admin** — o grupo some pra equipe no menu, e as rotas do Gestão
    são `admin` (nem pela URL a equipe entra). Quem é admin = 👑 na tela **Acessos**.
  - **PCP**: "Criar pedido" no topo; "Pedidos do ERP" → **"Pedidos Syntech"**. **Produção**:
    "Separação Pronta Entrega" em 2º. CRM, Estoque e Configurações: não mexidos.
- **Placar de vendas pra fora** (`src/routes/placar.ts`): `GET /api/placar` **só-de-leitura** (total
  de vendas/pedidos rumo à meta), com **chave própria** (só o hash SHA-256 fica no código). Feito pra
  uma ferramenta externa (ex.: Ryze) ler o placar sem acessar o resto. Nunca dar a chave da ponte.
- **Loja**: botão do cliente "📤 Enviar para a Big"; Enviar/Cancelar **somem** depois que o pedido
  vai pro Syntech ("Enviado para a Big Tricot") — no cliente e no representante.
- **Ponte** lendo os status **10/20/30** e com **auto-atualização** mais confiável.

---

## 7. Como manter este manual em dia

- Ao concluir algo importante (nova regra de negócio, mudança de fluxo, nova frente de trabalho),
  **atualize este `CLAUDE.md`** na mesma leva — de preferência no mesmo PR da mudança.
- Mantenha curto e verdadeiro: se o código e o manual divergirem, **o código manda** — corrija o
  manual.
- A seção 6 ("Estado atual") é a que mais envelhece: revise-a sempre.

---

## 8. Para ler mais fundo (documentação do projeto)

- `README.md` — stack, instalação, deploy.
- `docs/00-VISAO-GERAL.md` — negócio, as 9 fases, tipos de pedido.
- `docs/01-ARQUITETURA.md`, `docs/02-BANCO-DE-DADOS.md`, `docs/03-FLUXOS-OPERACIONAIS.md`,
  `docs/04-MODULOS.md`, `docs/05-RELACIONAMENTOS.md`, `docs/06-PERMISSOES.md`.
- `FLUXO-PEDIDO-ERP.md` — o ciclo pedido → Syntech → conferência, em detalhe.
- `DEPLOY.md`, `STAGING.md` — publicação e ambiente de testes.
