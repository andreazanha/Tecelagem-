# Big Tricot — App Desktop (Electron)

Camada desktop que abre o **app web existente** numa janela e, na tela
**Navegador CRM**, coloca um **navegador Chromium REAL** (WebContentsView) na área
da esquerda — capaz de abrir **WhatsApp Web** de verdade, com login persistente —
mantendo o **painel CRM** (React) na direita. Não usa iframe.

> Nada do app web foi reescrito. O Electron só carrega a URL do app e adiciona a
> camada desktop. A versão web continua funcionando normalmente (lá usa iframe).

## Como rodar no Windows — o jeito FÁCIL (dois cliques)

**Só precisa ter o Node.js instalado uma vez:** baixe o "LTS" em https://nodejs.org,
instale (Avançar → Avançar → Concluir).

Depois, **dê dois cliques** no arquivo:

```
ABRIR-NAVEGADOR-CRM.bat
```

Ele sozinho: instala o necessário (só na 1ª vez, pode demorar uns minutos) e abre
o programa **já no Navegador CRM**. Nas próximas vezes, abre na hora.

- Faça login no Big Tricot (só na 1ª vez — depois fica salvo).
- No Navegador CRM, a esquerda é um **navegador real**: clique no atalho
  **WhatsApp Web**, escaneie o **QR Code** e pronto. O login do WhatsApp fica
  salvo entre aberturas.

> Dica: clique com o botão direito no `.bat` → *Enviar para → Área de trabalho
> (criar atalho)* pra ter um ícone do "Big Tricot" na sua área de trabalho.

### Jeito manual (alternativa)

Na pasta `desktop`, no Prompt de Comando:
```
npm install
node node_modules\electron\install.js
npm start
```
Trocar a URL do app: variável `NAVCRM_APP_URL`.

### Se a janela abrir e fechar na hora (postinstall bloqueado)

Se aparecer `allow-scripts` / `electron@... (postinstall: node install.js)` e o
programa fechar sozinho, é porque o npm **bloqueou o download do binário do
Electron**. O `.bat` já corrige isso sozinho (roda `node node_modules\electron\install.js`).
Se ainda assim falhar, rode esse comando na mão, na pasta `desktop`:
```
node node_modules\electron\install.js
```
e depois dê dois cliques no `.bat` de novo.

## Gerar um instalador (.exe) — opcional

```
npm run dist:win
```
Gera um instalador em `desktop/dist/`. (Requer Windows; o electron-builder baixa
o necessário na 1ª vez.)

## Segurança (já configurado)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- O conteúdo externo (WhatsApp/sites) roda **sem preload** → sem acesso a Node.
- IPC restrito a poucos canais (navegar/voltar/avançar/recarregar/bounds).
- URLs validadas (só http/https); popups abrem no navegador do sistema.
- Sessão persistente isolada (`persist:navcrm`) só pra guardar o login.

## Limitações desta 1ª etapa

- Apenas **abrir e usar** o WhatsApp Web / sites na área esquerda.
- **Sem** automação, leitura de DOM, injeção de script ou captura de conversas.
- A integração do painel CRM com o WhatsApp vem depois.
