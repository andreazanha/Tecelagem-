# Auditoria — Reserva da Edição Limitada (antes de corrigir)

**Segurança confirmada:** branch isolada `claude/reserva-estoque-etapa1`, **sem** token da Cloudflare
nesta sessão → não é possível tocar produção daqui. Staging = D1/worker/bucket próprios, Syntech
simulado, WhatsApp desligado (`zapi_ativo=0`). **Nada foi alterado nesta auditoria (só leitura).**

Legenda: ✅ pronto · ⚠️ precisa corrigir (mudança de código) · ⏳ pendente/depende do Syntech real · 🧪 só testar.

| # | Regra pedida | Estado | Evidência (arquivo:linha) | O que muda |
|---|---|---|---|---|
| 1 | Reserva **só** para Edição Limitada; outras categorias como hoje | ⚠️ | `loja-estoque.ts:145` `explodirAlvo` reserva **qualquer** peça com saldo no espelho (não filtra EL) | Adicionar gate: só reservar peças da categoria EL |
| 2 | Remover prorrogação (+6h/+12h); 12h fixas | ⚠️ | front `site/loja.html:1254-1278`; servidor `loja.ts:858-895` (`/prorrogar`, `prorroga_opcoes`); `reserva-avisos.ts` (`prorrogarPedido`, `tratarRespostaProrrogacao`) | Remover botões, endpoint, opções e a oferta no aviso |
| 3 | Disponibilidade desconta reservas; **ocultar** tamanhos sem estoque (sem "Esgotado") | ⚠️ | desconto OK `integracao.ts:1183-1202`; cores sem estoque já ocultas `loja.html:927`; **tamanhos** a 0 mostram "estoque esgotado" `loja.html:933,945` | Ocultar tamanho EL a 0 (em vez de "Esgotado") |
| 4 | Concorrência 2 clientes na última unidade | ✅🧪 | trava atômica `loja-estoque.ts:164` (`montarReservaAtomica`) + `faltasDaReserva`; testado local (6 em paralelo → 1 vence) | Re-testar no staging com 2 clientes |
| 5 | Cancelamento → devolve estoque (1× só, por estado do pedido) | ⏳ | sem detecção automática; `limparReservasRefletidas` solta reserva quando pedido vira recusado/cancelado; conferência manual `integracao.ts:340` | Definir simulação de cancelamento + testar idempotência |
| 6 | Aguardando aprovação: reserva não expira, contador para, sem lembrete abandonado | ✅(maioria) | `enviado`/`erro` nunca expiram (`FILTRO_RESERVA_ATIVA` `loja-estoque.ts:120`); expiração só rascunho `loja-estoque.ts:270`; avisos só rascunho | Verificar no front que o contador **para**; falha de ERP não libera (`erro` mantém reserva) ✅ |
| 7 | "Para conferir" só após **aprovação** no Syntech (≠ gravação) | ✅📄 | regra documentada em `FLUXO-PEDIDO-ERP.md` | As 5 perguntas do Syntech ficam **pendentes** (D2/D3) |
| 8 | Capa e almofada c/ enchimento compartilham estoque | ✅🧪 | EL (`integracao.ts:1217`) + receita `erp_kit_receita`; testado local (reservar almofada baixa a capa) | Re-testar no staging nos dois sentidos |
| 9 | 1 lembrete WhatsApp, 1h antes, mensagem específica | ⚠️ | hoje são **2** avisos (1h depois + 1h antes) `reserva-avisos.ts:5`; mensagem diferente `reserva-avisos.ts:59` | Manter só o de 1h antes, trocar o texto, tirar prorrogação |
| 10 | Expiração esvazia **todo** o carrinho (inclui outras categorias) | ✅(depende do #1) | `expirarCarrinhosVencidos` apaga o rascunho inteiro `loja-estoque.ts:270` | Com #1, a janela só abre se houver EL → regra fica correta |
| 11 | Histórico/rastreabilidade dos eventos | ⚠️(parcial) | `reserva_historico` só registra avisos/prorrogação/liberação (`integracao.ts:362`, `loja.ts:888`, `reserva-avisos.ts:80`) | Registrar também: criação da reserva, alteração de qtd, expiração, finalização, recebido/aprovado/cancelado, erro |
| 12 | Segurança do ambiente de testes | ✅ | branch isolada, sem token prod; `wrangler.staging.jsonc` só `-staging`; `zapi_ativo=0` | — |

---

## Decisão que preciso de você (bloqueia o #1)
**Como o sistema identifica a "categoria Edição Limitada"?** O código tem **dois sinais diferentes** e
eu **não vou inventar**:
- **Por GRUPO do Syntech:** `secaoDoGrupo` marca `edicao_limitada` quando o grupo contém "limitad"/"edic" (`integracao.ts:1064`).
- **Por PREFIXO da ref:** o espelho/compartilhamento de capa+almofada e o diagnóstico usam ref `^ED\d` (`integracao.ts:638,1222`).

No **seed de teste**, usei refs `ED01C/ED01A` → casou pelo **prefixo**. Preciso saber **como a Edição
Limitada é cadastrada no Syntech real** (nome do grupo? prefixo de código?) para o gate do #1 ficar
certo em produção. Enquanto não confirmar, proponho usar **o mesmo critério que o catálogo já usa
para renderizar EL** (ref `^ED\d`) — mas isso precisa da sua confirmação.

---

## Mudanças de código necessárias (precisam da sua autorização)
1. **#1 Gate EL:** reservar somente peças da categoria EL (as demais voltam a não reservar).
2. **#2 Remover prorrogação:** front (botões/бloco), `/prorrogar`, `prorroga_opcoes`, e a lógica em `reserva-avisos.ts`.
3. **#3 Ocultar tamanhos EL sem estoque** (em vez de "Esgotado").
4. **#9 WhatsApp:** 1 lembrete só (1h antes), com o texto exato que você passou, sem prorrogação.
5. **#11 Histórico:** registrar os eventos que faltam.
6. **#5 Cancelamento (teste):** definir como simular o cancelamento no staging e garantir devolução idempotente.

Cada uma dessas é **mudança de código** → eu só faço depois da sua aprovação, e só **atualizo o
staging** (nunca produção) depois de te explicar o que muda.

---

## Já pronto e testável agora (sem mudança de código) — para as evidências
- **#4 Concorrência**, **#8 Capa/almofada compartilhada**: já funcionam; posso gerar **evidência local**
  (worker de staging em modo local, dados fictícios) agora, sem tocar em nada remoto.
- **#6/#7**: comportamento já implementado/documentado; valido com evidência.

---

## Ordem dos testes (como você pedif) e dependências
| Ordem | Teste | Depende de mudança de código? |
|---|---|---|
| 1 | Reserva permanece bloqueada após finalizar | Não (validar) |
| 2 | Cancelamento e devolução | Sim (#5 — definir simulação) |
| 3 | Concorrência 2 clientes | Não (validar) |
| 4 | Estoque compartilhado capa/almofada | Não (validar) |
| 5 | Remover prorrogação + 12h fixas | **Sim (#2)** |
| 6 | Expiração esvazia carrinho completo | **Sim (depende do #1)** |
| 7 | Lembrete WhatsApp simulado | **Sim (#9)** |
| 8 | Aprovação no Syntech → PCP | Não (validar, já documentado) |

---

## Pendências do Syntech real (D2/D3 — não inventar, confirmar depois)
1. Qual campo/status/evento confirma **aprovado**.
2. Como identificar **cancelamento**.
3. Como identificar **alteração de quantidade**.
4. Como distinguir **aguardando / aprovado / faturado / cancelado**.
5. Como evitar que a aprovação **desconte o estoque duas vezes**.
