# 07 — Mockups de Todas as Telas

> Wireframes em ASCII (baixa fidelidade, alta clareza para revisão). Após aprovação, viram protótipos visuais (Figma) e depois código. Comente diretamente sobre qualquer tela.

Convenções: `[Botão]` · `( ) opção` · `[x] checkbox` · `▼ dropdown` · `🔒` ação que exige reautenticação · `🟢🟡🔴` status.

---

## WEB — Escritório / Setores

### T01 — Login
```
┌───────────────────────────────────────────────┐
│                 BIG TRICOT                      │
│            Rolagem de Fase                       │
│                                                  │
│   Usuário:  [______________________]             │
│   Senha:    [______________________]             │
│                                                  │
│              [ Entrar ]                           │
│   Esqueci minha senha · Suporte                  │
└───────────────────────────────────────────────┘
```

### T02 — Dashboard / Painel Inicial
```
┌──────────────────────────────────────────────────────────────────┐
│ BIG TRICOT  | Dashboard            🔔3   João (Supervisor) ▼  Sair │
├───────┬──────────────────────────────────────────────────────────┤
│ MENU  │  Resumo de Produção                          19/06/2026   │
│ ▸Início│ ┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐       │
│ ▸Pedidos│ │ Tecel. ││Passad. ││ Corte  ││Costura ││Revisão │      │
│ ▸OPs   │ │  12 OPs││  5 OPs ││  8 OPs ││ 22 OPs ││  3 OPs │       │
│ ▸Romaneios│└────────┘└────────┘└────────┘└────────┘└────────┘     │
│ ▸Costureiras│ ⚠ 4 OPs paradas há +48h    🔴 2 pedidos atrasados   │
│ ▸Almoxarif.│ ┌─────────────────────────────────────────────────┐ │
│ ▸Motoristas│ │ Pedidos por fase (gráfico de barras)            │ │
│ ▸Relatórios│ │ ▇▇▇▇▇▇ ▇▇▇ ▇▇▇▇ ▇▇▇▇▇▇▇▇▇▇ ▇▇                   │ │
│ ▸Config   │ └─────────────────────────────────────────────────┘ │
│           │  Entregas hoje: 6   |  Estoque baixo: 3 materiais     │
└───────────┴──────────────────────────────────────────────────────┘
```

### T03 — Todos os Pedidos (tela central) ⭐
```
┌──────────────────────────────────────────────────────────────────────────┐
│ Todos os Pedidos                                            [+ Importar PDF]│
├──────────────────────────────────────────────────────────────────────────┤
│ Filtros: Cliente[▼] Fase[▼] Setor[▼] Status[▼] Tipo[▼] Entrega[__/__→__/__]│
│          Responsável[▼]  Tempo parado[> __h]  Atrasados[x]   [Filtrar][↻]  │
├────────┬──────────┬──────────┬─────────┬────────┬────────┬────────┬────────┤
│Cliente │Nº Pedido │Entrega   │Fase     │Setor   │Status  │Respons.│Parado  │
├────────┼──────────┼──────────┼─────────┼────────┼────────┼────────┼────────┤
│Loja A  │#1001     │22/06 🔴  │Costura  │Facção 3│🟡Exec  │Maria   │ 1d 4h  │
│Loja A  │#1002(G45)│22/06     │Costura  │Facção 3│🟡Exec  │Maria   │ 1d 4h  │
│Cliente B│#1010    │25/06     │Tecelag. │Tear 2  │🟢Exec  │Pedro   │ 3h 12m │
│Loja C  │#1020 PE  │20/06 🔴  │Expedição│Exped.  │🟡Aguard│—       │ 2d 1h⚠ │
│...     │          │          │         │        │        │        │        │
├────────┴──────────┴──────────┴─────────┴────────┴────────┴────────┴────────┤
│ 142 pedidos · [◀ 1 2 3 ... ▶] · [Exportar Excel] [Exportar PDF]            │
└────────────────────────────────────────────────────────────────────────────┘
  (clique na linha → T07 Detalhe da OP/Pedido) · PE = Pronta Entrega · G45 = Agrupamento
```

### T04 — Importação de PDF (entrada de pedido)
```
┌───────────────────────────────────────────────────────────┐
│ Importar Pedido (PDF do ERP)                               │
├───────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────┐    │
│  │   Arraste o PDF aqui  ou  [Selecionar arquivo]     │    │
│  └───────────────────────────────────────────────────┘    │
│  Arquivos:  pedido_1001.pdf  ✅ enviado                     │
│             pedido_1002.pdf  ⏳ processando OCR...          │
│                                                            │
│  [Processar]   PDFs originais serão preservados.           │
└───────────────────────────────────────────────────────────┘
```

### T05 — Conferência de Pedido (pós-OCR) ⭐
```
┌──────────────────────────────────────────────────────────────────────┐
│ Conferência — pedido_1001.pdf            Confiança OCR: 92%           │
├───────────────────────────────────┬──────────────────────────────────┤
│  [ Visualizador do PDF original ] │  Dados Extraídos (editáveis)     │
│  ┌─────────────────────────────┐  │  Cliente:  [Loja A          ] ✅ │
│  │                             │  │  Nº Pedido:[1001            ] ✅ │
│  │   (render do PDF do ERP)    │  │  Entrega:  [22/06/2026      ] ✅ │
│  │                             │  │  Tipo:     [Único         ▼]     │
│  │                             │  │  ─ Itens ──────────────────────  │
│  │                             │  │  Produto      Ref   Qtd          │
│  │                             │  │  Blusa Tricô  BT12 [120] 🟡(85%) │
│  └─────────────────────────────┘  │  Cachecol     CC07 [ 60]         │
│                                   │  [+ Adicionar item]              │
│  🟡 = baixa confiança, revisar    │                                  │
├───────────────────────────────────┴──────────────────────────────────┤
│  Correções são registradas na auditoria.   [Cancelar] [🔒 Confirmar e │
│                                              gerar PDF padronizado]    │
└──────────────────────────────────────────────────────────────────────┘
```

### T06 — Agrupamento de Pedidos
```
┌──────────────────────────────────────────────────────────────────┐
│ Agrupar Pedidos em uma Ordem de Produção                          │
├──────────────────────────────────────────────────────────────────┤
│ Pedidos disponíveis (não agrupados):        Filtro: Cliente[▼]    │
│ [x] #1001 Loja A  120pç  entrega 22/06                            │
│ [x] #1002 Loja A   60pç  entrega 22/06                            │
│ [x] #1003 Loja A   40pç  entrega 23/06                            │
│ [ ] #1010 Cliente B 200pç entrega 25/06                          │
├──────────────────────────────────────────────────────────────────┤
│ Selecionados: 3 pedidos · 220 peças · entrega mais próxima 22/06  │
│ Código do agrupamento: G-046 (auto)                               │
│ Observação: [____________________________________________]         │
│                            [Cancelar] [🔒 Agrupar e gerar PDF]     │
└──────────────────────────────────────────────────────────────────┘
  Vínculo com #1001,#1002,#1003 preservado · desmembra na Revisão
```

### T07 — Detalhe da OP / Pedido (Rolagem de Fase) ⭐
```
┌──────────────────────────────────────────────────────────────────────┐
│ OP G-046  (Pedidos: #1001, #1002, #1003)        Tipo: Agrupamento     │
│ Cliente: Loja A · Entrega: 22/06 🔴 · Status: 🟡 Em execução          │
├──────────────────────────────────────────────────────────────────────┤
│ Linha do tempo (rastreabilidade):                                     │
│  ✅ Criação    Ana    18/06 09:12                                      │
│  ✅ Tecelagem  Pedro  18/06 14:30 → 19/06 08:00 (17h30)               │
│  ✅ Passadoria Carla  19/06 08:10 → 19/06 10:00 (1h50)                │
│  ✅ Corte      José   19/06 10:15 → 19/06 12:00 (1h45)                 │
│  🟡 Costura    Maria  19/06 13:00 → ...  (parado 1d4h)  Romaneio R-220│
│  ⏳ Revisão    —                                                       │
│  ⏳ Expedição  —    ⏳ Fiscal  —    ⏳ Transporte  —                    │
├──────────────────────────────────────────────────────────────────────┤
│ Itens · Documentos (PDF original, padronizado, agrupado, romaneios)   │
│ ──────────────────────────────────────────────────────────────────── │
│ Ação:  Próxima fase ▶ [Revisão]   Setor[▼]   Responsável[▼]           │
│        Observação:[__________________]   [🔒 Rolar Fase]              │
└──────────────────────────────────────────────────────────────────────┘
```

### T08 — Enviar para Costura (Corte → Costura + Romaneio) ⭐
```
┌──────────────────────────────────────────────────────────────────┐
│ Enviar para Costura — OP G-046                                    │
├──────────────────────────────────────────────────────────────────┤
│ Costureira:  [Maria (Facção 3)              ▼]  Em aberto: 2      │
│ Motorista:   [Carlos                        ▼]                    │
│ Previsão de retorno: [21/06/2026]                                 │
│ ─ Itens a enviar ──────────────────────────────────────────────  │
│  Produto      Pedido  Qtd cortada   Enviar                       │
│  Blusa BT12   #1001   120          [120]                         │
│  Cachecol CC07 #1002   60          [ 60]                         │
│ ─────────────────────────────────────────────────────────────── │
│ Observação: [________________________________]                   │
│ [Cancelar]   [🔒 Gerar Romaneio e Iniciar Rastreamento]          │
└──────────────────────────────────────────────────────────────────┘
   → gera Romaneio (PDF), cria entrega do motorista, dispara WhatsApp(futuro)
```

### T09 — Romaneios (lista + detalhe)
```
┌──────────────────────────────────────────────────────────────────────┐
│ Romaneios                       Filtros: Tipo[▼] Status[▼] Costur.[▼]  │
├────────┬──────────┬───────────┬───────────┬──────────┬───────────────┤
│Nº      │Tipo      │OP/Pedido  │Costureira │Motorista │Status         │
├────────┼──────────┼───────────┼───────────┼──────────┼───────────────┤
│R-220   │Corte→Cost│G-046      │Maria      │Carlos    │🟡 Em trânsito │
│R-219   │Cost→Rev  │#0990      │Joana      │Carlos    │✅ Recebido    │
│R-218   │Expedição │#0985      │—          │Transp.X  │🟢 Entregue    │
└────────┴──────────┴───────────┴───────────┴──────────┴───────────────┘
  (clique → detalhe com itens enviados/recebidos, divergências, PDF, fotos)
```

### T10 — Cadastro de Costureiras (com abas) ⭐
```
┌──────────────────────────────────────────────────────────────────────┐
│ Costureira: Maria Silva (Facção 3)                  🟢 Ativa  [Editar] │
├──────────────────────────────────────────────────────────────────────┤
│ [Cadastro] [Histórico] [Pedidos em Aberto] [Romaneios] [Pagamentos]   │
│ [Pendências]                                                          │
├──────────────────────────────────────────────────────────────────────┤
│ CADASTRO:                                                             │
│  Tipo: (•)Facção ( )Interna   Documento:[__]  Telefone/WhatsApp:[__]  │
│  Endereço:[__________]  Chave PIX:[__________]                        │
│  Acordo de valores (por peça/produto): [tabela editável]             │
│                                                                       │
│ PEDIDOS EM ABERTO (aba):                                             │
│  R-220 · G-046 · 180pç · enviado 19/06 · prev. retorno 21/06 🟡      │
│ PAGAMENTOS (aba):                                                    │
│  Jun/2026 · R$ 1.240,00 · PENDENTE   [🔒 Registrar pagamento]        │
│ PENDÊNCIAS (aba):                                                    │
│  🔴 2 peças faltantes (R-210) · aberta 15/06  [Resolver]            │
└──────────────────────────────────────────────────────────────────────┘
```

### T11 — Almoxarifado
```
┌──────────────────────────────────────────────────────────────────────┐
│ Almoxarifado                          [Entrada] [Saída] [Ajuste]      │
├──────────────────────────────────────────────────────────────────────┤
│ Filtro: Categoria[▼] [Buscar material____]   ⚠ Abaixo do mínimo[x]    │
├────────────┬──────────┬─────────┬─────────┬──────────┬───────────────┤
│Material    │Categoria │Estoque  │Mínimo   │Status    │Ações          │
├────────────┼──────────┼─────────┼─────────┼──────────┼───────────────┤
│Fio Algodão │Matéria   │ 45 kg   │ 50 kg   │🔴 Baixo  │[Entrada][Saída]│
│Linha Preta │Aviamento │ 320 un  │100 un   │🟢 OK     │[Entrada][Saída]│
│Etiqueta BT │Embalagem │ 1.200   │500      │🟢 OK     │...            │
├────────────┴──────────┴─────────┴─────────┴──────────┴───────────────┤
│ Movimentações recentes (append-only) · [Ver histórico completo]       │
└──────────────────────────────────────────────────────────────────────┘
```

### T12 — Relatórios / BI
```
┌──────────────────────────────────────────────────────────────────────┐
│ Relatórios            Período:[01/06→19/06]  [Gerar]                   │
├──────────────────────────────────────────────────────────────────────┤
│ • Lead time médio por fase  ▇▇▇▇ Tecel 18h | Corte 2h | Costura 30h   │
│ • Gargalos (tempo parado)   🔴 Costura  🟡 Revisão                     │
│ • Produtividade por costureira  [tabela]                              │
│ • Pedidos atrasados / no prazo  85% no prazo                          │
│ • Consumo de materiais                                                │
│ [Exportar PDF] [Exportar Excel]                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### T13 — Notificações / WhatsApp (config + histórico)
```
┌──────────────────────────────────────────────────────────────────────┐
│ Notificações (WhatsApp)        Provedor: [Meta Cloud API ▼]  🟢 Ativo │
├──────────────────────────────────────────────────────────────────────┤
│ Templates: [Romaneio emitido] [Pagamento] [Lembrete de retorno]       │
│ Histórico de envios:                                                  │
│  19/06 14:32 · Maria · "Romaneio R-220" · 📎PDF · ✅ Entregue 🔵 Lida │
│  19/06 09:10 · Joana · "Pagamento Jun"  · 📎PDF · ✅ Entregue         │
│  18/06 17:00 · Carlos· "Nova entrega"   ·       · ⚠ Falha [Reenviar] │
└──────────────────────────────────────────────────────────────────────┘
   (provedor trocável sem refazer o sistema — adapter)
```

### T14 — Administração (Usuários & Papéis)
```
┌──────────────────────────────────────────────────────────────────────┐
│ Usuários                                            [+ Novo usuário]   │
├──────────┬──────────────────┬──────────────────────┬─────────────────┤
│Nome      │Login             │Papéis                │Status           │
├──────────┼──────────────────┼──────────────────────┼─────────────────┤
│João Souza│joao              │Supervisor            │🟢 Ativo [Editar]│
│Maria L.  │maria             │Costura, Revisor      │🟢 Ativo         │
│Carlos R. │carlos            │Motorista             │🟢 Ativo         │
└──────────┴──────────────────┴──────────────────────┴─────────────────┘
  [Gerenciar Papéis e Permissões]  [Trilha de Auditoria]
```

### T15 — Confirmação com Reautenticação (modal 🔒)
```
        ┌───────────────────────────────────────────┐
        │ 🔒 Confirme sua identidade                │
        │ Ação: Rolar OP G-046 para Revisão         │
        │                                            │
        │ Usuário: João (logado)                     │
        │ Senha/PIN: [________]                      │
        │                                            │
        │ Esta ação será assinada e registrada.      │
        │            [Cancelar]  [Confirmar]         │
        └───────────────────────────────────────────┘
```

---

## MOBILE — App do Motorista

### M01 — Login / M02 — Lista de Entregas
```
┌──────────────────┐    ┌──────────────────────┐
│   BIG TRICOT      │    │ Minhas Entregas  ↻   │
│   Motorista       │    ├──────────────────────┤
│                   │    │ 🟡 R-220 · Maria      │
│ Usuário [______]  │    │   Facção 3 · 180pç    │
│ Senha   [______]  │    │   [A caminho]         │
│                   │    ├──────────────────────┤
│   [ Entrar ]      │    │ 🟢 R-218 · Cliente C  │
│                   │    │   Entregue 🟢         │
│ ⬤ offline: 2 pend.│    ├──────────────────────┤
└──────────────────┘    │ 🔵 R-221 · Joana      │
                        │   Aguardando saída    │
                        └──────────────────────┘
```

### M03 — Detalhe da Entrega
```
┌──────────────────────────┐
│ ← R-220 · Maria (Facção3)│
├──────────────────────────┤
│ 📍 Rua X, 123 · [Mapa]    │
│ Itens: Blusa 120 · Cach.60│
│ OP: G-046                 │
├──────────────────────────┤
│ Status: A caminho         │
│  [ ✅ Confirmar Chegada ] │
│                           │
│ (após chegada:)           │
│  [ 📷 Adicionar Fotos ]   │
│  Observação:[__________]  │
│  [ ✅ Confirmar Entrega ] │
├──────────────────────────┤
│ ⬤ Será sincronizado se    │
│   estiver offline.        │
└──────────────────────────┘
```

### M04 — Confirmação de Entrega (fotos)
```
┌──────────────────────────┐
│ Confirmar Entrega R-220   │
│ 📷 [foto1] [foto2] [+]    │
│ Recebido por:[__________] │
│ Observação:[____________] │
│ Geo: -23.5,-46.6 (auto)   │
│   [Cancelar] [✅ Concluir]│
└──────────────────────────┘
```

---

## MOBILE/PWA — Costureira (futuro)
```
┌──────────────────────────┐
│ Olá, Maria 👋             │
│ Romaneios em aberto: 2    │
│ ▸ R-220 · 180pç · 21/06   │
│   📎 [Baixar PDF]         │
│ Pagamentos:               │
│ ▸ Jun/2026 · R$1.240 ⏳   │
│ Pendências: 🔴 1          │
└──────────────────────────┘
```

---

## TABLET — Chão de Fábrica (futuro, modo quiosque)
```
┌──────────────────────────────────────────────┐
│ SETOR: CORTE        Login PIN: [____] / Crachá│
├──────────────────────────────────────────────┤
│ OPs na fila:                                  │
│  [G-046] [#1010] [#1020]                      │
│ Escaneie o código ▣ ou toque na OP            │
│ ─────────────────────────────────────────     │
│ OP G-046 selecionada                          │
│ [ ▶ Iniciar ]  [ ✅ Concluir e Rolar ]        │
└──────────────────────────────────────────────┘
```

---

## Inventário de Telas

| Plataforma | Telas |
|-----------|-------|
| Web | T01–T15 (Login, Dashboard, Todos os Pedidos, Importação, Conferência, Agrupamento, Detalhe/Rolagem, Enviar p/ Costura, Romaneios, Costureiras, Almoxarifado, Relatórios, WhatsApp, Admin, Modal Reauth) |
| Mobile Motorista | M01–M04 |
| PWA Costureira (futuro) | 1 painel |
| Tablet Chão de Fábrica (futuro) | 1 quiosque |
