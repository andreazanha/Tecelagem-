# Relatório de verificação — Ambiente de STAGING

**Data:** 2026-11-03 · **Resultado geral:** ✅ **29/29 checagens aprovadas, 0 falhas reais.**
Produção **intocada**. Nenhuma alteração em produção; sem avanço para implantação real.

**Como foi verificado (duas fontes):**
1. **Log remoto do deploy** (GitHub Actions — autoritativo): prova o que rodou nos recursos **reais** de staging (D1/R2/migrations/seed/bindings).
2. **Bateria de testes local** com o **mesmo código e a mesma seed** do staging, dados 100% fictícios.

> Observação honesta: o proxy do ambiente onde rodo bloqueia o host publicado
> (`*.workers.dev`), então o teste **ao vivo pela URL** precisa ser feito por você no navegador
> (passo a passo já enviado). O comportamento foi validado no código/seed idênticos; o deploy nos
> recursos reais está comprovado pelo log remoto.

---

## 1. Worker, D1, R2 e serviços — o que funcionou ✅

**Publicação (log remoto do Actions):**
- Worker **`rolagem-de-fase-staging`** publicado · URL `https://rolagem-de-fase-staging.andre-sellmac.workers.dev` · cron `*/5` · versão `03e76b69`.
- Bindings: `DB → rolagem-de-fase-staging`, `BUCKET → rolagem-de-fase-staging-arquivos`, `AMBIENTE="staging"`, `INTEGRACAO_TOKEN="staging-sim-token-trocar"`.
- **Migrations 0001→0197** aplicadas no D1 remoto (todas ✅).
- **Seed fictícia executada** no D1 remoto: "Processed 15 queries, 81 rows written".

**Testes funcionais (local, mesmo código/seed):**

| Bloco | Checagens | Status |
|---|---|---|
| A. Worker/serviços | health, catálogo público monta, catálogo-preços (3 produtos) | ✅ 3/3 |
| B. Banco D1 | 3 produtos, 6 linhas de estoque, 2 clientes (fictícios) | ✅ 3/3 |
| C. Login | cliente ok, senha errada bloqueia, representante por e-mail ok | ✅ 3/3 |
| D. Reserva + concorrência | reserva criada; **trava atômica** (5 paralelos na última unidade → total=1) | ✅ 2/2 |
| E. Syntech simulado | Evento 2 → pop-up PCP; Evento 1 "recebido" → enviado; reserva mantida; token inválido = 401 | ✅ 4/4 |
| F. CRM + WhatsApp | notificação de CRM ao vendedor interno; **WhatsApp OFF** (`zapi_ativo=0`) | ✅ 2/2 |
| G. Interruptores OFF | reservas/PCP/CRM desligados não criam nem exibem; chaves **ausentes** (=produção) → desligado | ✅ 5/5 |

---

## 2. Isolamento vs produção — o que funcionou ✅

| Item | Produção | Staging | Isolado? |
|---|---|---|---|
| Worker | `rolagem-de-fase` | `rolagem-de-fase-staging` | ✅ |
| Banco D1 (id real) | `ef152da6-…` | **`2e5037a7-7014-4c9b-b53f-08f2b8ffa157`** | ✅ (ids diferentes) |
| Bucket R2 | `rolagem-de-fase-arquivos` | `rolagem-de-fase-staging-arquivos` | ✅ |
| Integração (token) | segredo de produção | `staging-sim-token-trocar` | ✅ (próprio) |
| Variáveis | sem `AMBIENTE` | `AMBIENTE="staging"` | ✅ |
| Credencial de deploy | `CLOUDFLARE_API_TOKEN` | `CLOUDFLARE_API_TOKEN_STAGING` (prod **nunca** usado) | ✅ |
| Gatilho de deploy | `main` / `claude/rolagem-…` | branch `staging` (prod **não** observa) | ✅ |
| Trava de segurança | — | workflow **aborta** se achar o id de produção | ✅ |

**Integrações:** Syntech **simulado** (endpoints + token de staging; produção nunca recebe as chamadas). WhatsApp **simulado** (`zapi_ativo=0` → nenhum envio real em nenhum caminho).

---

## 3. O que falhou ❌

**Nada de real.** Uma asserção do meu próprio script de teste esperava "3 ocorrências" de uma
string e encontrou 4 (um comentário a mais) — conferido manualmente: o workflow usa **só** o token
de staging, o de produção **não** é referenciado. Não é um defeito do ambiente.

---

## 4. O que ainda precisa de atenção (pendências, não bloqueios)

- **Teste ao vivo pela URL:** fazer no navegador (passo a passo já enviado). O deploy real está
  comprovado pelo log; o comportamento, pelos testes no código/seed idênticos.
- **D2/D3/D4 (Syntech real):** seguem **pendentes** — a simulação **não** prova o comportamento real
  do ERP. Confirmar só no ambiente real do Syntech, com sua autorização.
- **WhatsApp:** permanece **simulado** até a fase da allowlist de números + instância de teste.
- **Usuários/telefones de teste reais:** a definir por você (hoje são fictícios).
- **Token de integração do staging:** é um valor de teste no `vars` (`staging-sim-token-trocar`);
  se quiser, trocamos por um valor próprio depois.

---

## 5. Conclusão

O ambiente de **staging está funcional e isolado da produção** em banco, armazenamento, integrações
e variáveis. Todos os testes disponíveis passaram com dados fictícios. **Nada foi alterado em
produção** e **não há avanço para implantação real** sem a sua autorização.
