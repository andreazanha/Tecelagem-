# 13 — Insumos, Romaneios e Pagamento de Costura

## 1. Separação de Insumos
**Insumos** = embalagem, etiquetas, encartes, tags, tassel.
- Página com **lista de todos os pedidos criados**.
- Cada pedido mostra os insumos necessários (chips). Ao separar, a pessoa aperta **"✓ Insumos separados"** → registra **quem** e **a hora**.
- Se faltar algum insumo, o pedido fica **sinalizado** (não trava a produção).

## 2. Romaneios
- Criar **avulso** ou **por pedido**.
- **Gera PDF em 2 vias na mesma página** (1ª via Empresa / 2ª via Costureira, com linha de corte).
- **Romaneio de costura simplificado** com **agrupamento**:
  - **Peseiras + Mantas** somam juntas (ex.: 5 peseiras + 10 mantas = **15 Peseiras/Mantas**).
  - **Almofadas + Capas** somam juntas (ex.: **20 Almofadas/Capas**).
- **Serviços** (cadastráveis): colocar etiquetas, colocar capas, colocar almofadas, costurar peseira/manta… cada um com **unidade**, **agrupamento** e **valor unitário**.

## 3. Controle de Romaneio e Pagamento
- Cada romaneio tem **saída**, **retorno previsto** e **retorno real**.
- A costureira informa a **previsão de entrega** ao gerar o romaneio.
- **Regra de pagamento:** romaneios **não devolvidos até o dia 31** **não são liberados** para pagamento — aparecem no relatório como **Vencido / Bloqueado**, mas **não entram no total a pagar**.
- Status de pagamento: **Aguardando · ✓ Liberado · ✗ Bloqueado**.

## 4. Mensagens automáticas (WhatsApp)
- **Lembretes da costureira** (3, todos marcados "🤖 mensagem automática"):
  1. **Véspera** (1 dia antes da previsão).
  2. **Manhã do dia da entrega**.
  3. **Em atraso** (se passar da previsão), reforçando a regra do dia 31.
- **Relatório mensal** — **todo dia 1º**: total a pagar liberado, valores **por costureira** e os **não liberados** (vencidos).

> Mockups: `43-insumos` · `44-romaneios` · `45-romaneio-pdf` · `46-cadastro-servicos` · `47-whatsapp-mensal` · `48-whatsapp-lembretes`.
