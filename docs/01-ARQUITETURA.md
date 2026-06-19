# 01 — Arquitetura Completa do Sistema

## 1. Visão em Camadas

```
┌───────────────────────────────────────────────────────────────────────┐
│                          CLIENTES (Frontends)                           │
│  Web (escritório/setores)   Mobile Motorista   Mobile/PWA Costureira    │
│  Painel de Chão de Fábrica (tablets nos teares/setores) [futuro]        │
└───────────────┬───────────────────────────────────────────────────────┘
                │  HTTPS / REST + WebSocket (tempo real)
┌───────────────▼───────────────────────────────────────────────────────┐
│                          API GATEWAY / BFF                              │
│         Autenticação (JWT) · Rate limit · Versionamento · CORS          │
└───────────────┬───────────────────────────────────────────────────────┘
                │
┌───────────────▼───────────────────────────────────────────────────────┐
│                    APLICAÇÃO (Modular Monolith)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ Pedidos  │ │ Produção │ │Romaneios │ │Costureiras│ │ Almoxarifado │  │
│  │ /PDF/OCR │ │ (Fases)  │ │/Logística│ │/Pagamentos│ │              │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ Auth/RBAC│ │ Auditoria│ │Notificaç.│ │ Etiquetas│ │  Relatórios  │  │
│  │          │ │(append)  │ │(WhatsApp)│ │/Barcode  │ │   /BI        │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
│  ── Núcleo: Domain Events · Outbox · Casos de uso · Validações ──       │
└──────┬─────────────────────┬──────────────────────┬────────────────────┘
       │                     │                      │
┌──────▼──────┐     ┌────────▼────────┐    ┌────────▼─────────┐
│ PostgreSQL  │     │  Object Storage │    │  Fila / Workers  │
│ (dados+audit)│    │  (PDFs, fotos)  │    │ (Redis + BullMQ) │
└─────────────┘     │  S3 / MinIO     │    └────────┬─────────┘
                    └─────────────────┘             │
                              ┌────────────────────-┼─────────────────┐
                       ┌──────▼──────┐  ┌───────────▼───┐  ┌──────────▼─────┐
                       │ OCR/Parser  │  │ Gerador de PDF│  │ WhatsApp/Notif │
                       │  de PDF     │  │ padronizado   │  │  (adapter)     │
                       └─────────────┘  └───────────────┘  └────────────────┘
```

## 2. Stack Tecnológica Recomendada

| Camada | Tecnologia | Justificativa |
|--------|-----------|---------------|
| **Backend** | **Node.js + NestJS (TypeScript)** | Modular por design, forte tipagem, ecossistema maduro p/ filas, jobs e WebSocket. Mesma linguagem do frontend reduz custo de equipe. |
| **Banco de dados** | **PostgreSQL 16** | ACID, JSONB (dados flexíveis de PDF), particionamento (auditoria), robusto e gratuito. |
| **Frontend Web** | **React + Next.js + TypeScript** | SSR/performance, componentização, PWA. |
| **Mobile** | **React Native (Expo)** | Motorista, costureira e tablets — 1 base de código iOS/Android, **offline-first**. |
| **Object Storage** | **S3 (nuvem) ou MinIO (on-premise)** | PDFs originais, PDFs padronizados, fotos de entrega. Interface S3 = portável. |
| **Fila / Async** | **Redis + BullMQ** | Processar PDF/OCR, gerar PDFs, enviar WhatsApp, imprimir etiquetas — sem travar o usuário. |
| **Tempo real** | **WebSocket (Socket.IO)** | Atualização ao vivo do painel "Todos os Pedidos" e chão de fábrica. |
| **OCR/Parsing PDF** | **pdf-parse / pdfplumber + Tesseract (fallback) / serviço cloud** | Atrás de interface — trocável. |
| **Geração de PDF** | **Puppeteer / PDFKit** | PDFs padronizados e romaneios. |
| **Etiquetas/Barcode** | **ZPL (Zebra) / bwip-js** | Geração de etiquetas e códigos de barras (Code128 / QR). |
| **Auth** | **JWT + Refresh + RBAC** | Sessões seguras; reautenticação em ações críticas. |
| **Infra/Deploy** | **Docker + Docker Compose** (evoluível p/ Kubernetes) | Portável on-premise ou nuvem. |
| **Observabilidade** | **Logs estruturados + Prometheus/Grafana + Sentry** | Monitorar gargalos e erros. |

> ⚠️ **DECISÃO NECESSÁRIA — Stack**: a recomendação acima (NestJS + React/RN + PostgreSQL) é a sugestão do arquiteto. Se a Big Tricot já possui padrão tecnológico (ex.: equipe .NET/PHP/Python), adaptamos antes de iniciar.

## 3. Por que Modular Monolith (e não microserviços já)?

- A fábrica tem **um único domínio coeso**; microserviços agora adicionariam complexidade operacional sem benefício.
- O sistema é **modular internamente** (cada módulo com fronteiras claras + eventos de domínio), permitindo **extrair serviços no futuro** (ex.: serviço de OCR, serviço de notificações) sem reescrever.
- Mais simples de operar on-premise em ambiente fabril.

## 4. Padrões de Projeto Aplicados

- **Domain Events + Outbox Pattern**: cada movimentação de fase emite um evento persistido na mesma transação (garante que auditoria, notificação e rastreio nunca se percam).
- **Adapter/Port (Hexagonal)** para integrações externas: `NotificationProvider`, `OcrProvider`, `LabelPrinterProvider`, `StorageProvider`. Trocar provedor = trocar adapter.
- **State Machine** para o ciclo de vida da OP (impede transições inválidas entre fases).
- **CQRS leve**: leituras pesadas (painel "Todos os Pedidos") usam *views/materialized views* otimizadas; escritas passam por casos de uso validados.

## 5. Máquina de Estados da Ordem de Produção

```
              ┌─────────── (Pronta Entrega / Estoque) ──────────┐
              │                                                  ▼
CRIADO → TECELAGEM → PASSADORIA → CORTE → COSTURA → REVISÃO → EXPEDIÇÃO → FISCAL → TRANSPORTE → ENTREGUE
   │                                          │         │
   │                                          │         └─(desmembra agrupamento: 1 OP → N pedidos)
   │                                          └─(romaneio p/ costureira + motorista)
   └─ Cada transição: valida regra do tipo de pedido + grava evento de auditoria
```

Status dentro de cada fase: `AGUARDANDO` · `EM_EXECUCAO` · `PARADO` · `CONCLUIDO` · `DEVOLVIDO` (retrabalho).

## 6. Segurança

- **Autenticação**: login com usuário + senha (hash **Argon2/bcrypt**), JWT de curta duração + refresh token.
- **Autorização**: RBAC por papel + permissões finas (ver doc 06).
- **Reautenticação em ações críticas** (rolagem de fase, geração de romaneio, pagamento): exige confirmação de credencial/PIN — gera **assinatura eletrônica** do evento.
- **TLS/HTTPS** obrigatório; segredos em cofre (env/secret manager), nunca no código.
- **LGPD**: dados pessoais de costureiras/motoristas/clientes com base legal, minimização e trilha de acesso.

## 7. Auditoria e Assinatura

Toda movimentação registra: **usuário · data · hora · ação · valor anterior → novo · IP/dispositivo**.

> 🔐 ⚠️ **ALERTA DE SEGURANÇA — "registrar senha"**
> O requisito pede registrar *usuário e senha* em cada movimentação. **Armazenar a senha (mesmo hash) junto ao evento é uma prática insegura e proibida pela LGPD/boas práticas.**
>
> **Proposta do arquiteto (equivalente e mais seguro):** a cada ação crítica o usuário **reautentica** (confirma a senha/PIN). O sistema valida e grava uma **assinatura eletrônica** do evento contendo: `usuário`, `timestamp`, `hash da ação` e um `token de confirmação` — provando que *aquela pessoa autorizou aquela ação*, **sem nunca armazenar a senha**. Isso atende ao objetivo de "nenhuma movimentação sem autorização identificada", com segurança real.
>
> Aguardo aprovação desta substituição (ver doc 02 — tabela `evento_auditoria`).

- **Append-only**: a tabela de auditoria não permite UPDATE/DELETE (garantido por permissões do banco + trigger). Particionada por mês para escala.
- **Hash encadeado (opcional/recomendado)**: cada evento guarda o hash do anterior (tipo blockchain leve) → detecta adulteração da trilha.

## 8. Infraestrutura e Implantação

```
On-premise (recomendado p/ chão de fábrica) ─ ou ─ Nuvem (VPS/Cloud)
 ┌──────────────────────────────────────────────┐
 │ Docker Compose / Swarm                        │
 │  ├─ api (NestJS)        ├─ worker (BullMQ)     │
 │  ├─ web (Next.js)       ├─ postgres            │
 │  ├─ redis               ├─ minio (storage)     │
 │  └─ nginx (proxy/TLS)   └─ backup agendado     │
 └──────────────────────────────────────────────┘
```

> ⚠️ **DECISÃO NECESSÁRIA — Hospedagem**: chão de fábrica costuma ter internet instável. Recomendo **servidor local (on-premise)** com sincronização/backup em nuvem, garantindo operação mesmo sem internet. Alternativa: 100% nuvem (mais simples de manter, depende de link estável). Precisamos definir.

- **Backups**: PostgreSQL (PITR/diário) + storage replicado. Teste de restauração mensal.
- **Atualizações**: blue-green / janela de manutenção; migrações de banco versionadas.

## 9. Integrações (todas atrás de adapter — trocáveis)

| Integração | Porta (interface) | Implementação inicial | Futuro |
|-----------|-------------------|----------------------|--------|
| ERP (entrada) | `OrderIntakePort` | Leitura de PDF (upload/pasta) | API direta do ERP |
| OCR/Parsing | `OcrProvider` | pdfplumber + Tesseract | Serviço cloud / IA |
| Notificações | `NotificationProvider` | (stub) | **WhatsApp** (Meta Cloud API / BSP) |
| Storage | `StoragePort` | MinIO | S3 |
| Etiquetas | `LabelPrinterProvider` | ZPL/PDF | Impressoras Zebra em rede |
| Transporte | `TrackingPort` | Interno | Transportadoras/rastreadores |
