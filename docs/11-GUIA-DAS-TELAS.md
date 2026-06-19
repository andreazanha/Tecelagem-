# 11 — Guia das Telas (explicação simples)

> Este guia explica, em linguagem do dia a dia, **para que serve cada tela**, **o que você vê** e **o que você faz** nela. Sem termos técnicos.

A ideia central do sistema: **o pedido é como um "pacote" que caminha por 9 etapas** (Criação → Tecelagem → Passadoria → Corte → Costura → Revisão → Expedição → Fiscal → Transporte). Cada tela é uma "estação" onde alguém olha, confere e **empurra o pedido para a próxima etapa** — e o sistema anota *quem fez, quando e o quê*.

---

## 🔑 T01 · Login
**Para que serve:** entrar no sistema com segurança.
**O que você faz:** digita usuário e senha. A partir daí, tudo que você fizer fica registrado no seu nome.
**Por quê:** é assim que o sistema sabe *quem* mexeu em cada pedido (rastreabilidade).

---

## 📊 T02 · Dashboard (Tela Inicial)
**Para que serve:** dar o "raio-x" da fábrica em 5 segundos, assim que você entra.
**O que você vê:**
- Quantos pedidos estão em cada fase (12 na Tecelagem, 22 na Costura…).
- Avisos importantes em laranja/vermelho: *"4 pedidos parados há mais de 48h"*, *"2 atrasados"*, *"3 materiais acabando"*.
- Resumo do dia: entregas, tempo médio, % no prazo.
**O que você faz:** bate o olho e decide onde precisa agir. É um painel de acompanhamento, não de digitação.

---

## 📦 T03 · Todos os Pedidos (a tela mais usada)
**Para que serve:** ver **todos os pedidos ao mesmo tempo** e onde cada um está.
**O que você vê (cada linha = um pedido):**
- Cliente, número do pedido, data de entrega.
- **Fase** (ex.: Costura), **Setor** (ex.: Facção 3), **Status** (Em execução / Aguardando / Parado).
- Quem é o **responsável** e há **quanto tempo está parado** ali.
- Cores: 🟢 andando bem · 🟡 atenção · 🔴 atrasado.
**O que você faz:**
- Usa os **filtros** no topo (por cliente, fase, atrasados…) para achar o que quer.
- **Clica em um pedido** para abrir os detalhes (próxima tela).
**Pense nela como:** o "painel de controle de tráfego" da produção.

---

## 📥 T04 · Importar Pedido (entrada do PDF)
**Para que serve:** colocar um pedido novo no sistema a partir do **PDF que o ERP gera**.
**O que você faz:** arrasta o PDF (ou seleciona o arquivo). O sistema guarda o PDF original e começa a "ler" sozinho.
**O que acontece depois:** ele extrai automaticamente os dados e te leva para a conferência.

---

## ✅ T05 · Conferência do Pedido (depois da leitura automática)
**Para que serve:** **conferir se o sistema leu o PDF corretamente** antes de mandar para a produção.
**O que você vê:**
- À esquerda, o **PDF original** do cliente.
- À direita, os **dados que o sistema entendeu**: cliente, número, data de entrega, produtos e quantidades.
- Campos com **fundo amarelo** = o sistema não teve certeza, **confira com atenção**.
**O que você faz:**
- Corrige o que estiver errado (toda correção fica registrada).
- Clica em **"Confirmar e gerar PDF padronizado"** 🔒 (pede sua senha de novo, como uma assinatura).
**O que acontece depois:** o pedido entra oficialmente na produção e ganha um PDF no padrão da Big Tricot.

---

## 🔗 T06 · Agrupar Pedidos
**Para que serve:** juntar **vários pedidos pequenos** numa **única ordem de produção**, para produzir tudo junto (mais eficiente).
**O que você faz:** marca os pedidos que quer juntar e confirma. O sistema cria um grupo (ex.: G-046) e gera um PDF que mostra todos os números juntos.
**Importante:** eles caminham juntos até a **Revisão**. Lá o sistema **separa de novo**, e cada pedido segue sozinho para Expedição, Fiscal e Transporte. Você nunca perde o vínculo com os pedidos originais.

---

## 🏭 T07 · Detalhe da OP / Rolagem de Fase (o coração do sistema)
**Para que serve:** ver **toda a história de um pedido** e **empurrá-lo para a próxima fase**.
**O que você vê:**
- A **linha do tempo**: cada etapa já cumprida, com quem fez e quanto tempo levou (✓ verde = concluído, 🟡 = etapa atual, cinza = ainda não chegou).
- Os **documentos** do pedido (PDFs, romaneios).
**O que você faz:**
- Quando termina sua parte, escolhe a **próxima fase** + setor + responsável e clica em **"Rolar Fase"** 🔒 (confirma com senha).
**O que acontece depois:** o pedido "anda" para a próxima estação e isso aparece para todos em tempo real.
**Pense em "rolar a fase" como:** carimbar e passar o pedido adiante na esteira.

---

## ✂️➡️🧵 T08 · Enviar para Costura (gera o Romaneio)
**Para que serve:** quando o **Corte** termina, mandar as peças para uma **costureira**.
**O que você faz:**
- Escolhe a **costureira** e o **motorista** que vai levar.
- Confere os itens e quantidades.
- Clica em **"Gerar Romaneio"** 🔒.
**O que acontece depois (tudo automático):**
- Gera o **romaneio** (documento de remessa, em PDF).
- Cria a **entrega** que aparece no **celular do motorista**.
- Começa o **rastreamento**.
- (No futuro) manda o aviso no **WhatsApp** da costureira.

---

## 📋 T09 · Romaneios
**Para que serve:** ver e controlar todas as **remessas** (Corte→Costura, Costura→Revisão, Expedição).
**O que você vê:** lista de romaneios com costureira, motorista e status (Em trânsito / Recebido / Entregue).
**O que você faz:** abre um romaneio para ver itens enviados x recebidos, fotos e eventuais **divergências** (ex.: faltou peça).

---

## 🧵 T10 · Cadastro da Costureira (com abas)
**Para que serve:** ter a **ficha completa** de cada costureira/facção.
**O que você vê (nas abas):**
- **Cadastro:** dados, WhatsApp, chave PIX, capacidade de produção.
- **Pedidos em aberto:** o que ela está costurando agora.
- **Romaneios:** tudo que já passou por ela.
- **Pagamentos:** quanto deve, quanto foi pago.
- **Pendências:** peças faltando, retrabalho, etc.
**O que você faz:** acompanha, registra pagamento 🔒, resolve pendências.

---

## 🗃️ T11 · Almoxarifado (estoque de materiais)
**Para que serve:** controlar **matéria-prima e insumos** (fios, linhas, botões, etiquetas).
**O que você vê:** lista de materiais com **estoque atual**, **mínimo** e status (🟢 OK / 🔴 abaixo do mínimo).
**O que você faz:** registra **Entrada** (compra), **Saída** (consumo) ou **Ajuste** (inventário). Quando um material fica abaixo do mínimo, o sistema **avisa** automaticamente.

---

## 📈 T12 · Relatórios
**Para que serve:** enxergar **números e tendências** para decidir melhor.
**O que você vê:** tempo médio por fase, onde os pedidos mais empacam (gargalos), produtividade por costureira, % de entregas no prazo.
**O que você faz:** escolhe o período e exporta em PDF/Excel.

---

## 💬 T13 · WhatsApp (futuro)
**Para que serve:** enviar avisos, romaneios e relatórios pelo WhatsApp e guardar o **histórico de envios**.
**Importante:** já deixamos o sistema **preparado** para isso; ligamos quando você quiser, sem refazer nada.

---

## 👤 T14 · Administração (Usuários e Permissões)
**Para que serve:** o administrador cadastra **quem usa o sistema** e **o que cada um pode fazer**.
**O que você faz:** cria usuários, define o papel (Corte, Revisão, Financeiro, Motorista…) e consulta a **trilha de auditoria** (o histórico de tudo).

---

## 🔒 T15 · Confirmação de Identidade (assinatura)
**Para que serve:** em **ações importantes** (rolar fase, gerar romaneio, pagar, ajustar estoque), o sistema pede sua senha **de novo** para confirmar que foi você.
**Por quê:** é o que garante *"nenhuma movimentação sem responsável identificado"* — com segurança e sem guardar sua senha em lugar nenhum.

---

## 📱 Telas do Motorista (celular)

### M01–M04 · App do Motorista
**Para que serve:** o motorista trabalhar pelo **celular**, na rua.
**O que ele faz:**
1. Vê a **lista de entregas** do dia.
2. Abre uma entrega, vê o endereço e os itens (pode abrir o **mapa**).
3. Toca em **"Confirmar Chegada"** quando chega.
4. Tira **fotos**, escreve observação e toca em **"Confirmar Entrega"**.
**Detalhe importante:** funciona **mesmo sem internet** — quando o sinal volta, ele sincroniza sozinho.

---

## 📱 Tela da Costureira (futuro)
Painel simples no celular para a costureira ver seus romaneios, baixar PDFs e acompanhar pagamentos.

## 🖥️ Tablets no Chão de Fábrica (futuro)
Telas grandes nos teares/setores: o operador **escaneia o código** do pedido e toca em "Concluir e Rolar" — rápido, sem teclado.

---

## Resumo em uma frase
> Cada tela é uma **estação de trabalho**: a pessoa faz sua parte, **confirma com a senha**, e o pedido **anda para a próxima** — com o sistema guardando toda a história, do PDF inicial até a entrega final.
