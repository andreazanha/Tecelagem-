# Deploy — Big Tricot · Rolagem de Fase (Cloudflare)

Faça numa máquina com **Node 20+** e acesso ao navegador (para o login do Wrangler).

## 1. Clonar e instalar
```bash
git clone <repo>
cd Tecelagem-
git checkout claude/rolagem-fase-architecture-s47d3e
npm run install:all
```

## 2. Login na Cloudflare
```bash
npx wrangler login          # abre o navegador e autoriza
npx wrangler whoami         # confirma a conta
```

## 3. Criar o banco D1 e o bucket R2 (uma vez só)
```bash
npx wrangler d1 create rolagem-de-fase
# ⬆️ copie o "database_id" retornado e cole em wrangler.jsonc (campo database_id)

npx wrangler r2 bucket create rolagem-de-fase-arquivos
```

> **Workers AI** (OCR de PDF escaneado) já está no `wrangler.jsonc` (binding `AI`) e não precisa de criação — funciona com a conta padrão.

## 4. Migrar o banco e popular o catálogo
```bash
npm run db:migrate          # cria as tabelas no D1 remoto
npm run db:seed:catalogo    # insere modelos da Parte 1 + cores 100% poliéster
```

## 5. Publicar
```bash
npm run deploy              # build do front + wrangler deploy
```
O Wrangler mostra a URL final (algo como `https://rolagem-de-fase.<sua-conta>.workers.dev`).

## Atualizações futuras
```bash
git pull
npm run db:migrate          # só se houver novas migrations
npm run deploy
```

## Dicas
- **Ver o banco remoto:** `npx wrangler d1 execute DB --remote --command "SELECT * FROM modelos"`
- **Logs em tempo real:** `npx wrangler tail`
- **Rodar local antes:** `npm run db:migrate:local && npm run db:seed:local && npm run dev` (API em :8787) e `npm run dev:web` (front em :5173).
- **Domínio próprio:** dá para apontar um domínio no painel da Cloudflare (Workers → Custom Domains).
