# Fluxo do pedido no ERP (regra confirmada)

Ordem correta do ciclo de um pedido, do cliente até a conferência no PCP:

1. **Cliente faz o pedido** (loja/sistema) → fica **pendente**, aguardando ir para o Syntech.
2. **A ponte grava o pedido no Syntech** → "recebido/gravado".
   - No nosso sistema: `POST /api/integracao/pedido-erp-gravado` → o pedido da loja vira
     `erp_sync_status='enviado'`. A **reserva é mantida** e o **contador de 12h encerra**.
3. **No Syntech, o pedido é APROVADO** (ação feita no próprio ERP).
4. **SÓ DEPOIS de aprovado**, o pedido **volta para "Pedidos do ERP"** no sistema → aparece para
   **conferência** ("Para conferir") no PCP.
   - No nosso sistema: `POST /api/integracao/pedido` (status `aguardando_aprovacao`) → cria a
     notificação `pcp_notificacoes` → pop-up **"Para conferir"**.

## Regra para a PONTE (integração real)
O evento que cria o **"Para conferir"** (`POST /pedido`) só deve ser disparado para pedidos que **já
estão APROVADOS no Syntech** — **nunca** na simples entrada/gravação do pedido. O "Para conferir"
representa o **pedido aprovado que retornou** para conferência da equipe. A gravação (passo 2) e o
retorno para conferência (passo 4) são **momentos diferentes**.

## Pendência (D2/D3) — a confirmar no Syntech real, com autorização
- **Qual é exatamente o STATUS/sinal de "aprovado"** que a ponte deve observar no Syntech para
  disparar o passo 4 (ex.: STATUS=10 ou outro). → **não inventar**; confirmar no ERP real.
- Como a ponte **detecta cancelamento/exclusão** de um pedido aprovado (para soltar a reserva com
  segurança). → segue como **conferência manual** até termos um sinal confiável.

## Como simular no STAGING (ordem que reflete o fluxo real)
Com o token de staging (`staging-sim-token-trocar`), no Console da loja/painel:

```js
// Passo 2 — ponte gravou no Syntech ("recebido"): encerra o contador, mantém a reserva
fetch('/api/integracao/pedido-erp-gravado',{method:'POST',headers:{'Content-Type':'application/json','X-Integracao-Token':'staging-sim-token-trocar'},body:JSON.stringify({id:'<ID_DO_PEDIDO>',numero_erp:90123})}).then(r=>r.json()).then(console.log)

// (Passo 3 — Syntech aprova: acontece no ERP, sem evento no nosso sistema)

// Passo 4 — pedido APROVADO volta para "Pedidos do ERP" → cria o "Para conferir"
fetch('/api/integracao/pedido',{method:'POST',headers:{'Content-Type':'application/json','X-Integracao-Token':'staging-sim-token-trocar'},body:JSON.stringify({numero:'90123',cliente:{nome:'Loja Teste Direto'},itens:[{produto:'ALMOFADA MODELO TESTE A',ref:'ED01A',cor:'Marinho',tamanho:'45X45',qtd:1}]})}).then(r=>r.json()).then(console.log)
```

> A simulação testa o **nosso lado** (reserva, prazos, pop-ups, conferência). Ela **não** prova o
> comportamento real do Syntech — o status de "aprovado" e o cancelamento seguem **pendentes** (D2/D3).
