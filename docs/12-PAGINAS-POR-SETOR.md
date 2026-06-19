# 12 — Páginas por Setor (modelo de navegação)

> Requisito do cliente: **cada setor tem a sua própria página**, e **cada pessoa acessa apenas o seu setor**. Dentro da página do setor ficam **todas as etapas internas daquele setor**.

## 1. Conceito

O sistema **não** começa por um quadro global. Cada operador entra direto na **página do seu setor** e vê só o que é dele. O pedido "anda" entre setores: ao **finalizar** no setor atual, o operador clica em **Enviar ▶** e o pedido **rola para o próximo setor** (com assinatura 🔒).

```
Operador Tecelagem  →  abre  →  Página "Setor: Tecelagem"  (vê só Tecelagem)
Operador Costura    →  abre  →  Página "Setor: Costura"    (vê só Costura)
Revisor             →  abre  →  Página "Setor: Revisão"    (vê só Revisão)
... e assim por diante
```

## 2. Páginas de setor (uma para cada fase)

| Página de Setor | Quem acessa | Etapas internas (sub-status) | Ao finalizar, envia para |
|-----------------|-------------|------------------------------|--------------------------|
| **Tecelagem** ✅ | Operador Tecelagem | Aguard. Parte 1 (Máq 3) · Aguard. Parte 2 (Máq 7) · Aguard. Kits · Tecendo · Tecidos · Tecidos Kits | Passadoria |
| **Passadoria** | Operador Passadoria | Aguardando → Passando → Finalizado | Corte |
| **Corte** | Operador Corte | Aguardando → Cortando → Finalizado | Costura *(gera romaneio)* |
| **Costura** | Operador Costura | Aguardando → Costurando (por costureira) → Finalizado | Revisão |
| **Revisão** | Revisor | Aguardando → Revisando (por revisor) → Aprovado/Devolvido | Expedição *(desmembra agrupados)* |
| **Expedição** | Expedição | Aguardando → Separando/Embalando → Formulário de frete (volumes/peso/medidas) | Fiscal |
| **Fiscal** ✅ | Fiscal | Pedidos para emitir → Cotando frete → NF emitida | Transporte |
| **Transporte** | Logística/Motorista | Aguardando → Em rota → Entregue | (fim) |

> Cada página tem o **mesmo formato**: contadores no topo (Aguardando / Em execução / Finalizados), recursos do setor (teares, costureiras, revisores…) e um **mini-quadro Kanban interno** com as etapas daquele setor.

## 3. Estrutura visual de uma página de setor

```
┌ Setor: Tecelagem ───────────────────────────────── Pedro (Operador) ┐
│ [Aguardando 5] [Tecendo 4] [Finalizados 3] [Teares 4/6]             │
│ Teares: ●Tear1 #1031  ●Tear2 #1010  ◐Tear3 setup  ●Tear6 #1040 ...  │
│ ┌ Aguardando ┐  ┌ Tecendo ┐        ┌ Finalizado → Passadoria ┐      │
│ │ #1042 Loja K│ │#1010 Tear2 │     │ #1009  [🔒 Enviar ▶]     │      │
│ │ #1045 ...   │ │#1031 Tear1 │     │ #1002  [🔒 Enviar ▶]     │      │
│ └─────────────┘ └────────────┘     └─────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

- A **fila de entrada** de cada setor = os pedidos que o setor anterior enviou.
- Recursos variam por setor: **Tecelagem → teares**, **Costura → costureiras**, **Revisão → revisores**, **Transporte → motoristas**.

## 4. Acessos (resumo)

| Papel | O que vê |
|-------|----------|
| **Operador do setor** | Apenas a página do seu setor |
| **Supervisor de Produção / Gestor** | **Todas** as páginas + Dashboard global + Quadro Kanban geral + Lista "Todos os Pedidos" |
| **Administrador** | Tudo + configuração |

> Ou seja: os operadores trabalham na **visão de setor**; supervisão/gestão têm a **visão geral** (Dashboard + Kanban global + Lista). São as mesmas informações, em níveis diferentes.

## 5. Reflexo na arquitetura

- O modelo de dados **já suporta** isto: cada `ordem_producao` tem `fase_atual` e `setor_atual_id`; a página do setor é só um **filtro** por setor + as **etapas internas** (sub-status) daquele setor.
- **Permissões** (doc 06): cada papel de operador enxerga apenas o seu `setor`.
- **Sub-status internos** são configuráveis por setor (catálogo `setor_etapa`), permitindo que cada setor tenha suas próprias colunas sem alterar o código.
- **Enviar ▶** = a rolagem de fase já especificada (movimentacao_fase + auditoria + assinatura).

## 3.1 Tecelagem — fluxo aprovado ✅

Colunas da página da Tecelagem:

1. **Aguardando Tecelagem · Parte 1** — fila da **Máquina 3**
2. **Aguardando Tecelagem · Parte 2** — fila da **Máquina 7**
3. **Aguardando Tecelagem · Kits** — fila de kits
4. **Tecendo** — em produção (mostra máquina, operador, tempo)
5. **Tecidos** — partes prontas
6. **Tecidos · Kits** — kits prontos

**Regras de negócio:**
- **Parte 1 (Máq 3)** e **Parte 2 (Máq 7)** são tecidas **separadamente** e **se unem somente no Corte**, formando uma única parte.
- **Kits** seguem **separados** durante todo o fluxo (não se unem).
- Ações no cartão: **▶ Iniciar** (vai p/ Tecendo, escolhe máquina) · **✓ Finalizar** (vai p/ Tecidos) · **🔒 Enviar ▶** (rola p/ próxima fase).

> Modelo de dados: `pedido.parte` (P1/P2/KIT) + `setor_etapa` por setor já comportam essas colunas. A união P1+P2 ocorre no Corte (agregação por `pedido_id`).

## ⚠️ Para confirmar com a Big Tricot

Preciso das **etapas internas reais de cada setor** (as colunas dentro de cada página), pois variam de fábrica para fábrica. A tabela do item 2 é uma proposta. Exemplos de dúvidas:

- **Tecelagem**: as etapas são por *tear* ou existem passos como *programação → tecendo → conferência de malha*?
- **Costura**: separa por *costureira* (já proposto) — confirma?
- **Revisão**: por *revisor* + *aprovado/devolvido* — confirma?
- Algum setor tem etapa interna que eu não previ?

## 3.2 Fiscal — fluxo aprovado ✅

A **nota fiscal é emitida no ERP**. A página Fiscal só organiza quem precisa emitir. Colunas:

1. **Pedidos para emitir** — pedidos aguardando NF
2. **Cotando frete** — fiscal cota o frete usando o formulário da Expedição
3. **NF emitida** — ao marcar emitida, o pedido vai para **Transporte**

**Requisito da Expedição:** gerar um **formulário de frete** com **medidas, peso e quantidade de volumes**, usado pelo Fiscal para **cotar o frete**.

## 3.3 Corte — fluxo aprovado ✅

Colunas:
1. **Aguardando Corte** — Parte 1 e Parte 2 caem aqui e **se unem em um único card** (selo "🔗 P1+P2 unidos"). Se houver **Pronta Entrega** para ir junto, o card mostra "📦 + Pronta Entrega".
2. **Aguardando Corte · Kits / Estoque**
3. **Cortando** (mostra a mesa de corte)
4. **Kits / Estoque Cortados** — aguardando envio para a costureira
5. **Pedidos Cortados** — aguardando envio para a costureira

**Ação nos cortados:** *Enviar para Costureira* → abre o modal para escolher **costureira + motorista + previsão de retorno**, conferir itens e **gerar o romaneio automaticamente** (com rastreio e histórico).

## 3.4 Expedição — Formulário de Medidas e Pesos ✅

Formulário preenchido pela **Expedição** (o **Fiscal só visualiza**, em leitura, para cotar o frete).

**Cabeçalho da tabela (várias linhas):**

| CAIXA / FARDO | Nº | ALTURA (cm) | LARGURA (cm) | COMPRIMENTO (cm) | PESO (kg) |
|---------------|----|-------------|--------------|------------------|-----------|

- Cada **linha = 1 volume** (caixa ou fardo); botão **＋ Adicionar linha** e **✕** para remover.
- **Totais automáticos:** quantidade de volumes + peso total.
- Ação **Salvar e enviar ao Fiscal** → o Fiscal usa estes dados para **cotar o frete** (coluna "Cotando frete").

## 3.5 Costura — fluxo aprovado ✅

**Cada costureira é uma coluna.** Costureiras iniciais: **Silvia, Angélica, Bene, Nice, Cris** — com opção de **cadastrar novas** (vira uma nova coluna).

- Cada **card** = uma OP que está com aquela costureira (cliente, produto·qtd, **romaneio** R-xxx, entrega).
- Ação **Concluir ▶** → envia o pedido para a **Revisão**.
- Cards podem aparecer marcados **↩ Devolvida** (retrabalho).
- **Cadastrar costureira** (modal): nome, tipo (interna/facção), capacidade (pç/sem), contato e **cor da coluna**.

> Modelo de dados: catálogo `costureira` (nome, tipo, capacidade, cor) + `romaneio` ligando OPs à costureira. As colunas do quadro são geradas dinamicamente a partir das costureiras cadastradas.


## 3.5b Costura — conferência no retorno ✅

Quando o pedido **volta da costureira**, o funcionário da Costura **confere as peças** no próprio card:
- **✓ OK p/ Revisão** → o pedido sai da Costura e entra na Revisão (coluna "Aguardando para revisar").
- **⚠ Problema** → o card vai para a coluna **"Voltou com problemas"** (dentro da Costura), com o **defeito descrito** e o botão **↩ Reenviar p/ costureira**.

Estados do card na coluna da costureira: **Em costura** → (📥 Recebi o retorno) → **Conferir retorno** → ✓/⚠.

## 3.6 Revisão — fluxo aprovado ✅

Colunas:
1. **Aguardando para revisar** — pedidos que chegaram da Costura (aprovados na conferência).
2. **Uma coluna por revisora:** **Betânia, Bruna, Sula, Ray, Eduarda** — com opção de **cadastrar novas**.

- Card em "Aguardando": **👤 Atribuir revisora** (escolhe para qual coluna vai).
- Card na coluna da revisora: **✓ Aprovar** → vai para a **Expedição** (e **desmembra os pedidos agrupados**) · **✗ Reprovar** → volta para a **Costura** ("Voltou com problemas").
- **Cadastrar revisora** (modal): nome, contato e **cor da coluna**.

> Modelo de dados: catálogo `revisora` + `revisao` (resultado aprovado/reprovado, motivo). Colunas geradas dinamicamente a partir das revisoras cadastradas.


## 3.0 Montar Pedido — Pronta Entrega: junto x separado ✅

Quando o tipo do pedido inclui **Pronta Entrega** (ex.: *Único + Pronta Entrega* ou *P1+P2 + Pronta Entrega*), a pessoa que monta o pedido escolhe explicitamente, num seletor:

- **📦 Entregar JUNTO com o pedido** — a Pronta Entrega aguarda e sai junto com a produção.
- **⏩ Entregar SEPARADO (antecipado)** — a Pronta Entrega sai antes, separada da produção.

Essa escolha define o destino do item de Pronta Entrega no **Estoque** (coluna "Pronta Entrega + Produção" para *junto*; coluna "Separar" para *separado/antecipado*). É assim que o sistema sabe se entrega junto ou separado.


## 3.7 Expedição — quadro aprovado ✅

Colunas:
1. **Pedidos a expedir** — chega aprovado da Revisão · ação **▶ Expedir** (separar/embalar).
2. **Expedindo** — separando/embalando. No card:
   - Botão **📐 Medidas/Volumes** → abre o **Formulário de Medidas e Pesos** (caixa/fardo, várias linhas).
   - Enquanto não preenche, mostra **"Medidas pendentes"** e o **✓ Finalizar fica desabilitado**.
   - Preenchido, mostra o resumo (ex.: "2 vol · 18 kg") e **libera o Finalizar**.
3. **Finalizados → Fiscal** — card mostra o resumo das medidas; ação **🔒 Enviar ao Fiscal ▶**.

> É assim que o operador "coloca as medidas": pelo botão **📐** no card (coluna Expedindo). As medidas são obrigatórias para finalizar, garantindo que o Fiscal tenha os dados para cotar o frete.
