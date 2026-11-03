# Plano — Reserva da Edição Limitada (v2): proteção noturna + prorrogação só pelo WhatsApp

**Só análise e planejamento. Nenhuma linha de código foi alterada.** Tudo será feito na branch
isolada e no staging, com dados fictícios, sem tocar produção/Syntech/WhatsApp reais.

> **Mudança de rumo vs. a conversa anterior:** antes falamos em *remover* a prorrogação. Esta
> especificação **mantém** a prorrogação, mas **só pelo WhatsApp** (uma única vez, +6h) e **tira os
> botões** do catálogo/carrinho. E acrescenta a **proteção noturna** (novidade).

---

## 1) O que já está funcionando (aproveitamos)
- **Reserva atômica** (nunca vende a última unidade 2×) — `loja-estoque.ts:montarReservaAtomica` + `faltasDaReserva`. ✅ (testado)
- **Janela de 12h fixa, sem reiniciar** ao editar carrinho/atualizar página — `loja.ts:745` usa `COALESCE`. ✅
- **Prazo controlado pelo servidor**; contador lê `restante_ms` de `/carrinho-status`. ✅
- **Disponibilidade desconta reservas**; **cores sem estoque são ocultadas**. ✅ (parcial — ver §2)
- **Capa e almofada compartilham estoque** (Edição Limitada + receita `erp_kit_receita`). ✅ (testado)
- **Expiração esvazia o carrinho inteiro** (inclui outras categorias) — `loja-estoque.ts:expirarCarrinhosVencidos`. ✅
- **Prorrogação pelo WhatsApp já existe e altera o banco de verdade** (atômica, idempotente) — `reserva-avisos.ts:prorrogarPedido` + `tratarRespostaProrrogacao`. ✅ (base pronta)
- **Lembrete 1h antes** já existe (aviso2) e **reagenda** ao prorrogar. ✅ (base pronta)
- **Finalizar → Syntech → aprovar → PCP "Para conferir"** só após aprovação. ✅ (documentado em `FLUXO-PEDIDO-ERP.md`)
- **Destinatário correto**: rep quando é pedido de rep, senão cliente — `reserva-avisos.ts:destinoDoPedido`. ✅

## 2) O que precisa ser corrigido/ajustado
| Spec | Hoje | Mudança |
|---|---|---|
| **Reserva só da Edição Limitada** (§1, regra fundamental) | reserva **qualquer** peça com estoque | **Gate EL** (ref `^ED…`): só EL reserva; janela só abre com EL; expiração só em carrinho com EL |
| Botões de prorrogação na tela (§4) | existem (catálogo/carrinho) | **Remover** os botões; manter o **contador** |
| Prorrogação (§8) | cliente 6/12h (1×), rep 6/12/18/24h | **Uma única +6h** para todos (cliente e rep), só pelo WhatsApp |
| Lembrete 1h antes (§7) | aviso2 com opções numéricas | **Sim/Não** (Sim = +6h); texto novo |
| Aviso "reserva confirmada" 1h após (aviso1) | existe | **Remover** (a spec não pede; só quer proteção noturna + lembrete 1h antes) — *confirmar* |
| **Proteção noturna** (§5/§6/§9) | **não existe** | **Criar**: vencimento 20h–8h → protege até **10h** (fuso America/Sao_Paulo) + aviso |
| Janela de envio 8h–20h (§6/§7) | envia a qualquer hora | **Não enviar de madrugada**; adiar para o horário permitido |
| Vínculo da resposta (§10) | por telefone (1 oferta ativa) | Vincular à **reserva/pedido** (não só telefone); tratar rep com vários carrinhos |
| Ocultar tamanhos zerados (§2) | cores ocultas; **tamanhos** mostram "esgotado" | **Ocultar** tamanho EL zerado (sem "Esgotado") |
| Histórico (§16) | registra avisos/prorrogação/liberação | **Acrescentar**: criação, venc. original × efetivo, proteção noturna, finalização, nº Syntech, cancelamento |

---

## 3) Arquivos que serão modificados (staging/branch isolada)
- `migrations/0198_reserva_noturna.sql` **(novo)** — colunas `reserva_expira_original`, `reserva_noturna_aplicada`, `reserva_aviso_noturno_em` (aditivas, seguras).
- `src/loja-estoque.ts` — **gate EL** na reserva/alvo/trava; a janela só abre com peça EL.
- `src/routes/loja.ts` — abrir janela só p/ EL; **remover** `/prorrogar` e `prorroga_opcoes`; aplicar proteção noturna ao criar a janela.
- `src/reserva-avisos.ts` — **proteção noturna** (cálculo + aplicação), prorrogação **só +6h (1×)**, **lembrete** novo (Sim/Não), **aviso noturno** novo, **janela de envio 8h–20h**, vínculo por pedido.
- `src/routes/atendimento.ts` — manter o webhook chamando o tratador (agora Sim/Não); dedup de mensagem.
- `site/loja.html` (+ gerado `src/siteLoja.ts`) — **remover botões** de prorrogação; **ocultar** tamanhos EL zerados; o contador continua.
- `seed/staging.sql` — dados fictícios para os cenários (madrugada etc.), se preciso.

---

## 4) Como a PROTEÇÃO NOTURNA será implementada
- **Fuso:** `America/Sao_Paulo` (via `Intl.DateTimeFormat`, como o `fmtBR` já faz). Brasil hoje é UTC−3 fixo.
- **Regra:** depois de calcular o vencimento candidato (12h na criação, ou +6h na prorrogação),
  olho a **hora local (SP)** desse vencimento:
  - Se cair **depois das 20h00** ou **antes das 08h00** → movo para **10h00** da manhã seguinte.
  - **20h00 em ponto = permitido** (não protege). A proteção vale para **> 20h00** e **< 08h00**.
  - Exemplos conferem: 22h→10h (dia seguinte) · 3h→10h (mesmo dia) · 7h→10h (mesmo dia) · 20h→20h.
- **Guardo os dois horários:** `reserva_expira_original` (o calculado) e `reserva_expira_em` (o efetivo,
  já protegido) + marca `reserva_noturna_aplicada=1`. O **contador do carrinho** mostra o efetivo.
- **Aplico a proteção em dois momentos:** na **criação** da janela e **após a prorrogação de +6h**
  (§9). A proteção **não conta** como a prorrogação manual (o direito de +6h continua intacto).
- **Não é "prorrogação do cliente"** — é automática; registro no histórico como `protecao_noturna`.

## 5) Como o WhatsApp atualizará automaticamente o vencimento
- A pessoa responde **"Sim"** (ou ✅/1) ao lembrete → o webhook (`atendimento.ts`) chama
  `tratarRespostaProrrogacao` → `prorrogarPedido` faz um **UPDATE atômico** em `reserva_expira_em`
  (+6h, depois aplica proteção noturna), grava no D1 e **reagenda** o lembrete.
- O **contador do carrinho** lê `/carrinho-status` (que devolve o `restante_ms` do novo vencimento),
  então **atualiza sozinho** — se o navegador estiver aberto, sem F5 (o status é consultado periodicamente).
- **De verdade, não só mensagem:** muda o prazo no banco e mantém as peças reservadas.

## 6) Respostas duplicadas ou atrasadas (idempotência)
- **Aplicar consome a oferta:** o `UPDATE` exige `reserva_aviso2_em IS NOT NULL` e **zera** esse campo
  ao aplicar. Uma segunda resposta encontra a oferta **já consumida** → **não aplica de novo**.
- **Uma só prorrogação:** `reserva_prorrogacoes` conta; cliente/rep só podem +6h **uma vez**.
- **Resposta atrasada** (após o vencimento): `reserva_expira_em <= agora` → **recusada**, sem reativar
  (como pede §11); nova compra respeita a disponibilidade atual.
- **Mensagem recebida 2×:** mesmo que o WhatsApp entregue a mensagem duplicada, o item acima impede
  horas extras; e o webhook já identifica a mensagem (a confirmar no exame do §15).
- **"Não, obrigado":** não prorroga; a reserva segue até o vencimento já informado.

## 7) Cliente × representante
- **Destinatário:** `destinoDoPedido` já escolhe o **rep** (quando o pedido tem `vendedor`) ou o
  **cliente**. O lembrete identifica o pedido/cliente.
- **Vínculo da resposta (reforço pedido no §10):** hoje o match é por telefone + **uma** oferta ativa.
  Vou **vincular ao pedido** (identificador único), e, quando um rep tiver **vários** carrinhos com
  oferta ativa, pedir que ele **informe o pedido** (resposta de texto segura) em vez de adivinhar —
  nunca usando só o telefone.

## 8) Segurança do estoque (mantida)
- **Reserva atômica** no servidor (nunca negativo, nunca a mesma peça 2×).
- **Compartilhamento capa/almofada** pela peça física (receita), não pelo código comercial.
- **Liberação idempotente** (expiração/cancelamento soltam **uma vez**).
- **Pedido recebido/aguardando aprovação não expira**; falha incerta do ERP **não libera** estoque.
- Tudo gated pelo interruptor `reservas_ativo` e pelo **gate EL**.

## 9) Testes (os 28 do §17, no staging com dados fictícios)
Reserva 12h · alterar qtd sem reiniciar · F5 sem reiniciar · última unidade · concorrência ·
capa/almofada · vencimento de dia · de madrugada · proteção até 10h · aviso noturno simulado ·
lembrete 1h antes · "Sim" (+6h) · atualização do D1 · atualização do contador · "Não" · sem resposta ·
resposta após vencimento · 2ª prorrogação negada · mensagem duplicada · +6h que cairia de madrugada →
10h · carrinho EL + outra categoria · esvaziamento completo · finalizado antes do vencimento ·
reserva mantida aguardando aprovação · aprovação simulada · entrada no PCP "Para conferir" ·
cancelamento sem duplicidade · **carrinho sem EL permanece intacto**.
*(Todos com WhatsApp simulado — `zapi_ativo=0`; "envio" é registrado, não enviado.)*

## 10) Riscos antes de produção
1. **Sinais reais do Syntech (D2/D3) ainda pendentes:** aprovado, cancelado, alteração de qtd, baixa
   dupla. **Não vou inventar** — fica como pendência; a devolução por cancelamento segue conservadora.
2. **Fuso/horário de verão:** Brasil hoje não tem horário de verão; se voltar, a proteção noturna
   precisa reavaliar (uso `Intl` com `America/Sao_Paulo`, que acompanha regra oficial).
3. **Identificação da EL por prefixo `ED`:** combinado com você; se a EL no Syntech real usar outro
   sinal (grupo), o gate precisa ajustar — fica registrado.
4. **WhatsApp real:** em produção, ligar a Z-API fará os avisos saírem de verdade; começar com piloto.
5. **Checkout/reserva é caminho crítico:** mudanças testadas, com rollback (deploy anterior) pronto.

---

## Decisões que preciso de você antes de implementar
1. **Remover o aviso "reserva confirmada" (1h após criar)?** A spec só pede proteção noturna + lembrete
   1h antes. Proponho **remover**. (Sim/Não)
2. **Prorrogação +6h vale para cliente E representante igual (1×)?** A spec §8 diz "cliente ou
   representante", uma vez. Proponho **+6h, 1× para ambos**. (Confirmar)
3. **Resposta ao lembrete:** aceito **"Sim"/"1"/✅** como +6h e **"Não"/"2"/❌** como recusa. (Confirmar)
4. **Ordem de implementação** (um item de cada vez, como você pediu): proponho
   (a) **Gate EL** → (b) **remover botões + ocultar tamanhos** → (c) **proteção noturna + janela 8–20h**
   → (d) **lembrete/prorrogação +6h por WhatsApp** → (e) **histórico**. Cada etapa testada e aprovada antes da seguinte.
