# Big Tricot Desktop (Windows) — Tauri 2

Aplicativo desktop que abre o **sistema completo** (`https://sistema.bigtricot.com.br`)
dentro de uma **janela própria do Windows** — sem abrir Chrome/Edge.

> **Não é um segundo sistema.** É um "casco" nativo leve (Tauri 2 / WebView2) que mostra o
> mesmo sistema web. Mesmo backend, mesmo banco, mesmas regras, mesmas permissões, mesmo login.
> A versão web continua existindo normalmente.

## Como está feito (etapas 3 e 4)
- **Janela única** carregando o sistema vivo → todos os módulos e o catálogo digital aparecem
  dentro do app.
- **Nada abre navegador externo**: links internos navegam no app; `window.open(url)` de
  PDF/relatório/imagem abre numa **sobreposição interna** (com botão Fechar / tecla Esc);
  janelas de impressão (`window.open("")` + escrever HTML) imprimem por um **iframe interno**.
  Links **externos** (fora do Big Tricot) abrem no navegador do sistema, de forma controlada.
- **Login**: usa a autenticação atual (token). Nada de conta paralela.

Arquivos principais:
- `src-tauri/src/lib.rs` — cria a janela, injeta o controle de navegação, trata links.
- `src-tauri/tauri.conf.json` — nome, ícone, instalador, WebView2.
- `dist/index.html` — telinha de "abrindo…" (o conteúdo real vem do servidor).

## Como testar (sem instalar nada técnico)
O robô do GitHub compila no Windows. Baixe o resultado:
1. GitHub do projeto → aba **Releases** → **"Big Tricot Desktop — prévia de teste"**.
2. Baixe **`BigTricot-portatil.exe`** e dê 2 cliques.
3. Na 1ª vez o Windows mostra "editor desconhecido" → **Mais informações → Executar assim mesmo**
   (estamos sem certificado de propósito, por enquanto).

## Rodar/compilar localmente (pra quem é técnico)
Precisa de **Rust** + **Node** + (Windows) WebView2.
```bash
cd desktop
npm install
npm run dev      # abre em modo desenvolvimento
npm run build    # gera o .exe e o instalador em src-tauri/target/release
```

## Próximas etapas (ainda não feitas)
- **E5** — validar navegação, catálogo, PDFs, login e permissões.
- **E6** — impressão direta TSPL na TSC TE200 (2× 50×30 mm) + leitor de código de barras.
- **E7** — atualização automática assinada (precisa de certificado).
- **E8** — instalador final com identidade Big Tricot.
