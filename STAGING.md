# Ambiente de STAGING (teste) — como criar, o que é criado, custo e segurança

Ambiente de teste **totalmente separado** da produção. Preparado, **ainda não publicado**.
Nesta fase o **WhatsApp fica 100% simulado** (nenhuma mensagem real é enviada).

---

## Arquivos preparados

| Arquivo | Para quê |
|---|---|
| `wrangler.staging.jsonc` | Config isolada do Worker de staging (nome/banco/bucket próprios, `AMBIENTE=staging`, token próprio). |
| `.github/workflows/deploy-staging.yml` | Workflow que cria e atualiza o staging. Dispara **só** na branch `staging`. |
| `seed/staging.sql` | Dados **fictícios** (produtos, clientes, representante, vendedora interna, estoque, logins). WhatsApp desligado. |
| `scripts/staging-sim.mjs` | Simulador do Syntech/WhatsApp — chama os endpoints existentes apontando para a URL do staging. |

---

## Onde clicar no GitHub (passo a passo)

O gatilho é um **push na branch `staging`** (a branch de produção NÃO é tocada). Como fazer, pela
própria interface do GitHub:

1. No repositório, abra o seletor de branches (onde aparece o nome da branch).
2. Digite **`staging`** e escolha **"Create branch: staging from …"**, partindo da branch que contém
   estes arquivos (`claude/reserva-estoque-etapa1`).
3. Assim que a branch `staging` for criada/atualizada, vá na aba **Actions** → workflow
   **"Deploy (Staging)"** → acompanhe a execução.
4. No fim do log aparece a URL do Worker de staging (`https://rolagem-de-fase-staging.<subdomínio>.workers.dev`).

> **Antes do primeiro run** é preciso cadastrar **um segredo** no repositório (uma vez só):
> **Settings → Secrets and variables → Actions → New repository secret**
> - Nome: `CLOUDFLARE_API_TOKEN_STAGING`
> - Valor: um token da Cloudflare com escopo de staging (ver seção "Credenciais").
>
> O segredo `CLOUDFLARE_ACCOUNT_ID` que a produção já usa é reaproveitado (é só o número da conta,
> não dá poder de publicar sozinho).

### Por que NÃO há um botão "Run workflow" na branch principal
O botão de execução manual (`workflow_dispatch`) só aparece para workflows que estão na **branch
padrão** (`main`). Mas o `deploy.yml` de **produção** dispara a **qualquer push na `main`** — então
colocar qualquer arquivo na `main` publicaria a produção. Para não correr esse risco, o staging é
disparado pela branch `staging` (que a produção ignora). É o "manual" mais seguro: você controla
quando criar/atualizar a branch.

---

## O que será criado (na sua conta Cloudflare)

Na **primeira** execução, o workflow cria (de forma idempotente — nas próximas ele reaproveita):

| Recurso | Nome | Observação |
|---|---|---|
| Worker | `rolagem-de-fase-staging` | separado do `rolagem-de-fase` (produção) |
| Banco D1 | `rolagem-de-fase-staging` | **novo**; migrations 0001–0197 aplicadas; `id` resolvido no run |
| Bucket R2 | `rolagem-de-fase-staging-arquivos` | **novo**; vazio |

Nenhum recurso de produção é tocado. O `database_id` da config começa como placeholder
(`__STAGING_DB_ID__`) e é preenchido com o id do **banco de staging** durante o run — nunca o de produção.

---

## Custo

- Em **plano gratuito** da Cloudflare, um Worker + um D1 + um R2 em **escala de teste** cabem nos
  limites → **sem custo adicional esperado**.
- Em **Workers Paid** (US$ 5/mês, que a produção provavelmente já usa), o mesmo plano cobre vários
  Workers → **nenhuma cobrança nova** por criar o staging.
- O workflow **não cria nada pago** por conta própria. O custo exato deve ser confirmado no painel da
  Cloudflare — não há como eu inventar número.

---

## Credenciais e permissões

- **Novo segredo** `CLOUDFLARE_API_TOKEN_STAGING` — recomendo um token **específico de staging**, com o
  **mínimo**: *Account → Workers Scripts: Edit*, *Account → D1: Edit*, *Account → Workers R2 Storage: Edit*
  (escopo na sua conta). Assim o token do staging **não** é o mesmo da produção.
- `CLOUDFLARE_ACCOUNT_ID` (já existe no repo) — reaproveitado.
- O token de produção (`CLOUDFLARE_API_TOKEN`) **não** é usado pelo workflow de staging.

---

## Confirmação: isto NÃO altera o sistema que já roda na Big Tricot

1. **Gatilho isolado:** `deploy-staging.yml` só roda na branch **`staging`**. O deploy de produção
   (`deploy.yml`) só roda em `main` / `claude/rolagem-fase-architecture-s47d3e`. Um não aciona o outro.
2. **Recursos isolados:** worker/banco/bucket com nomes **`…-staging`** próprios. Um passo do workflow
   **aborta** se a config contiver o `database_id` de produção ou não contiver os nomes `-staging`.
3. **Sem o token de produção:** usa `CLOUDFLARE_API_TOKEN_STAGING`. Sem esse segredo, o workflow
   **falha e nada é publicado** — não há fallback para o token de produção.
4. **WhatsApp simulado:** o seed nasce com `zapi_ativo=0` → `enviarWhatsapp` retorna "desligado" em
   **todos** os caminhos. Nenhuma mensagem real sai.
5. **Syntech:** o staging **não** conecta ao ERP. Os eventos são simulados via `scripts/staging-sim.mjs`
   contra a URL do staging com o **token de staging** — produção nunca recebe essas chamadas.

**Nenhum deploy, migração remota, merge em produção ou mensagem real foi executado nesta preparação.**

---

## Logins de teste (fictícios — trocar quando a lista real for definida)

| Perfil | Como entra | Senha |
|---|---|---|
| Admin (painel) | usuário `admin` | `admin` |
| Vendedora interna | usuário `vint` | `admin` |
| Cliente direto (loja) | CNPJ `11.111.111/0001-11` | `teste123` |
| Cliente de representante (loja) | CNPJ `22.222.222/0001-22` | `teste123` |
| Representante (loja) | e-mail `rep@example.test` | `teste123` |

---

## Como simular Syntech / WhatsApp (depois que o staging estiver no ar)

```sh
export STAGING_URL=https://rolagem-de-fase-staging.<seu-subdominio>.workers.dev
export STAGING_TOKEN=<o INTEGRACAO_TOKEN de staging da config>

# ajustar estoque de uma peça (ex.: deixar a última unidade)
node scripts/staging-sim.mjs estoque 9001A Marinho 45X45 1
# pedido novo "chegou do ERP" → pop-up no PCP
node scripts/staging-sim.mjs pedido-pcp 90001 "Loja Teste Direto"
# "recebido no Syntech" → encerra a contagem e mantém a reserva
node scripts/staging-sim.mjs recebido <id-do-pedido> 90123
# falha de comunicação da ponte
node scripts/staging-sim.mjs erro <id-do-pedido> "timeout"
# mensagem que CHEGOU no WhatsApp (ex.: prorrogar respondendo "12") — nada é enviado de volta
node scripts/staging-sim.mjs whatsapp-in 5500000000011 12
```

> A simulação testa o **nosso** lado (reserva, prazos, pop-ups, liberação). Ela **não** prova o
> comportamento real do Syntech — a validação **D2** continua pendente (ver `ROTEIRO-SYNTECH-D2.md`).

---

## Interruptores do novo sistema (controle no servidor)

Quatro configurações **independentes**, na tabela `config`. Regra de ouro: **seguro por padrão** —
cada função só liga com o valor **exatamente `1`** (após `trim`). Ausente, vazio, `0`, `true` ou
qualquer outro texto → **desligado**. Em **produção** as três novas chaves **não existem** → tudo
começa **desligado** (comportamento de antes). No **staging** o seed já as deixa `1`.

| Chave (`config`) | Controla | Padrão produção | Staging (seed) |
|---|---|---|---|
| `reservas_ativo` | reserva automática no carrinho/checkout + desconto no catálogo + expiração/avisos | **ausente → off** | `1` |
| `pcp_popup_ativo` | pop-up "Para conferir" no PCP (criar **e** exibir) | **ausente → off** | `1` |
| `crm_popup_ativo` | pop-up individual "seu cliente fez um pedido" no CRM (criar **e** exibir) | **ausente → off** | `1` |
| `zapi_ativo` (já existente) | envio de WhatsApp (todos os caminhos) | `0` = off | `0` (simulado) |

**Garantias (validadas no servidor, não só na tela):**
- Reservas **off** → o catálogo mostra o **SALDO cru** do Syntech (como antes); o checkout salva o
  pedido **sem** reservar e **sem** janela de 12h; a expiração e os avisos ficam **congelados** —
  reservas já criadas **não são apagadas nem liberadas** automaticamente.
- Pop-ups **off** → **não** criam e **não** exibem notificações novas; linhas já existentes no banco
  **não** são apagadas nem mostradas, e nenhum pedido/reserva é alterado.
- Valor ausente/ inválido → **desligado** (sem ativação acidental).

### Como ligar/desligar no staging
Depois que o staging estiver no ar, pela conta Cloudflare (ajuste `0`/`1`):

```sh
# ligar reservas
npx wrangler d1 execute DB -c wrangler.staging.jsonc --remote \
  --command="UPDATE config SET valor='1' WHERE chave='reservas_ativo';"
# desligar pop-up do PCP
npx wrangler d1 execute DB -c wrangler.staging.jsonc --remote \
  --command="UPDATE config SET valor='0' WHERE chave='pcp_popup_ativo';"
# conferir todos
npx wrangler d1 execute DB -c wrangler.staging.jsonc --remote \
  --command="SELECT chave,valor FROM config WHERE chave IN ('reservas_ativo','pcp_popup_ativo','crm_popup_ativo','zapi_ativo');"
```

> O WhatsApp nesta fase fica **simulado** (`zapi_ativo=0`): não ligue essa chave no staging até
> termos a allowlist de números e uma instância de teste.
