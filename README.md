# Big Tricot — Rolagem de Fase

Sistema de gestão de produção da Big Tricot (Home Decor), do pedido à entrega. Stack **Cloudflare-native**:

- **Worker + Hono** (API) — `src/`
- **D1** (banco SQLite) — `migrations/`
- **R2** (armazenamento de PDFs) — binding `BUCKET`
- **React + Vite** (frontend SPA) — `web/`

A documentação de produto/arquitetura e os protótipos ficam em [`docs/`](./docs/README.md).

## Pré-requisitos
- Node 20+ e npm
- Conta Cloudflare (para deploy) — `npx wrangler login`

## Instalação
```bash
npm run install:all      # instala raiz (worker) e web (frontend)
```

## Desenvolvimento
```bash
# banco local + API (Worker)
npm run db:migrate:local     # aplica as migrations no D1 local
npm run db:seed:local        # (opcional) dados de exemplo
npm run dev                  # wrangler dev → http://localhost:8787

# frontend com hot-reload (proxy /api → 8787), em outro terminal
npm run dev:web              # vite → http://localhost:5173
```
> Para rodar tudo pelo Worker (sem hot-reload): `npm run build:web` e acesse `http://localhost:8787`.

## Deploy (Cloudflare)
```bash
# uma vez:
npx wrangler d1 create rolagem-de-fase           # copie o database_id p/ wrangler.jsonc
npx wrangler r2 bucket create rolagem-de-fase-arquivos
npm run db:migrate                                # migrations no D1 remoto
# a cada release:
npm run deploy                                    # build do web + wrangler deploy
```

## Estrutura
```
src/                 Worker (Hono)
  index.ts           app + fallback do SPA
  routes/pedidos.ts  CRUD de pedidos + upload/download do PDF (R2)
  routes/clientes.ts catálogo de clientes
migrations/          esquema do D1
seed/                dados de exemplo (não é migration)
web/                 React + Vite (SPA): pages/ Pedidos, NovoPedido, PedidoDetalhe
docs/                produto, arquitetura e protótipos
```

## Status
- [x] **Pedidos**: criar (tipos, Pronta Entrega junto/separado, itens), listar, detalhar, anexar PDF original (R2).
- [ ] OCR/leitura automática do PDF
- [ ] Produção (Rolagem de Fase — quadro das 9 fases)
- [ ] Romaneios · Estoque · Fiscal · Transporte · Relatórios

Roadmap: [`docs/10-PLANO-IMPLEMENTACAO.md`](./docs/10-PLANO-IMPLEMENTACAO.md) · [`docs/14-ROADMAP-INTEGRACOES.md`](./docs/14-ROADMAP-INTEGRACOES.md)
