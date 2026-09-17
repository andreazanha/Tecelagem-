// ─────────────────────────────────────────────────────────────────────────────
// Big Tricot — camada DESKTOP (Electron) do app web existente.
// A janela principal carrega o SEU app web normalmente. Na tela "Navegador CRM",
// um WebContentsView (navegador Chromium REAL, não iframe) é posicionado sobre a
// área da esquerda (~70%) e controlado pelo React via IPC. O painel CRM continua
// sendo React (direita). Visualmente parece um app só.
//
// Segurança: contextIsolation ligado, nodeIntegration desligado, sandbox ligado,
// o conteúdo externo (WhatsApp/sites) NÃO tem preload/Node, IPC restrito a poucos
// canais, URLs validadas, popups vão pro navegador do sistema. Sessão persistente
// (persist:navcrm) mantém o login do WhatsApp entre aberturas.
// ─────────────────────────────────────────────────────────────────────────────
"use strict";
const { app, BrowserWindow, WebContentsView, session, ipcMain, shell } = require("electron");
const path = require("path");

// URL do seu app web (pode trocar por variável de ambiente NAVCRM_APP_URL).
const APP_URL = (process.env.NAVCRM_APP_URL || "https://rolagem-de-fase.andre-sellmac.workers.dev").replace(/\/$/, "");
// Abre já no módulo Navegador CRM (se não estiver logado, mostra o login; depois de
// logar uma vez, a sessão fica salva e volta direto pra cá).
const START_URL = APP_URL + "/navegador-crm";
// Página inicial do navegador embutido.
const HOME_URL = "https://web.whatsapp.com";
// User-agent de Chrome moderno: sem o token "Electron", o WhatsApp Web deixa de
// mostrar a página "navegador desatualizado / use o Chrome 100+". Deriva a versão
// do próprio Chromium do Electron (ex.: 130.0.6723.x) — assim nunca fica "velho".
const CHROME_VER = (process.versions && process.versions.chrome) ? process.versions.chrome : "130.0.0.0";
const UA_CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" + CHROME_VER + " Safari/537.36";

// CORREÇÃO PRINCIPAL do "WhatsApp exige Chrome 100": o WhatsApp lê navigator.userAgent
// NO JAVASCRIPT DA PÁGINA. Em WebContentsView, setUserAgent/loadURL{userAgent} muitas
// vezes NÃO chegam ao navigator.userAgent do renderer (bug Electron #47979). O único
// jeito global e confiável é o userAgentFallback, e ele PRECISA ser definido ANTES de
// qualquer janela/view ser criada (por isso está aqui no topo do módulo).
app.userAgentFallback = UA_CHROME;

let win = null;
let view = null;
let montado = false;
let leituraTimer = null;   // relógio que lê o contato da conversa aberta
let ultimoTitulo = null;   // último contato enviado (evita reenviar igual)

// Lê APENAS o nome/número do contato da conversa aberta no WhatsApp Web (o texto
// do cabeçalho da conversa). NÃO lê mensagens, não injeta nada, não modifica a
// página — só devolve esse texto pro painel casar com o cadastro de clientes.
const JS_LER_CONTATO = `(function(){try{
  var m=document.querySelector('#main'); if(!m) return null;
  var h=m.querySelector('header'); if(!h) return null;
  // O NOME real é um span cujo title == o texto visível. Dicas/tooltips do WhatsApp
  // (ex.: "clique para mostrar os dados do contato") têm title != texto, e são ignoradas.
  var spans=h.querySelectorAll('span[title]'); var nome='';
  for(var i=0;i<spans.length;i++){
    var t=(spans[i].getAttribute('title')||'').replace(/\\s+/g,' ').trim();
    var txt=(spans[i].textContent||'').replace(/\\s+/g,' ').trim();
    if(t && t===txt){ nome=t; break; }
  }
  if(!nome){ var d=h.querySelector('span[dir="auto"]'); nome=d?(d.textContent||'').replace(/\\s+/g,' ').trim():''; }
  if(!nome) return null;
  if(/clique|clic|toque|dados do contato|click here/i.test(nome)) return null;
  return nome;
}catch(e){ return null; }})()`;

// A web pode sobrescrever o extrator (afinar seletores sem reinstalar o programa).
let extratorJS = JS_LER_CONTATO;

function enviarContato(titulo) {
  if (titulo === ultimoTitulo) return;
  ultimoTitulo = titulo;
  if (win && !win.isDestroyed()) win.webContents.send("navcrm:contato", { titulo });
}
function lerContato() {
  if (!view || !montado || !win || win.isDestroyed()) return;
  let u = "";
  try { u = view.webContents.getURL() || ""; } catch { u = ""; }
  if (!/whatsapp\.com/i.test(u)) { enviarContato(null); return; } // fora do WhatsApp: limpa
  view.webContents.executeJavaScript(extratorJS)
    .then((titulo) => { const t = titulo && String(titulo).trim(); enviarContato(t ? t : null); })
    .catch(() => { /* ignore */ });
}
function iniciarLeitura() { if (!leituraTimer) { ultimoTitulo = undefined; leituraTimer = setInterval(lerContato, 1500); lerContato(); } }
function pararLeitura() { if (leituraTimer) { clearInterval(leituraTimer); leituraTimer = null; } ultimoTitulo = null; }

function urlValida(u) {
  try { const x = new URL(u); return x.protocol === "http:" || x.protocol === "https:"; }
  catch { return false; }
}
function arred(b) {
  return { x: Math.max(0, Math.round(b.x || 0)), y: Math.max(0, Math.round(b.y || 0)), width: Math.max(0, Math.round(b.width || 0)), height: Math.max(0, Math.round(b.height || 0)) };
}
// Compatível com versões novas (navigationHistory) e antigas do Electron.
function podeVoltar(wc) { try { return wc.navigationHistory ? wc.navigationHistory.canGoBack() : wc.canGoBack(); } catch { return false; } }
function podeAvancar(wc) { try { return wc.navigationHistory ? wc.navigationHistory.canGoForward() : wc.canGoForward(); } catch { return false; } }
function irVoltar(wc) { try { wc.navigationHistory ? wc.navigationHistory.goBack() : wc.goBack(); } catch { /* ignore */ } }
function irAvancar(wc) { try { wc.navigationHistory ? wc.navigationHistory.goForward() : wc.goForward(); } catch { /* ignore */ } }

function criarJanela() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600, show: false,
    backgroundColor: "#0f1728",
    title: "Big Tricot",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadURL(START_URL);
  // Marcador de versão no título da janela — assim dá pra confirmar num relance
  // se o programa NOVO está rodando (deve aparecer "Big Tricot • v0.6").
  const TITULO = "Big Tricot • v0.6";
  win.setTitle(TITULO);
  win.on("page-title-updated", (e) => { e.preventDefault(); if (win && !win.isDestroyed()) win.setTitle(TITULO); });
  win.once("ready-to-show", () => win.show());
  // Reposiciona o navegador embutido quando a janela muda de tamanho.
  win.on("resize", () => { if (win && !win.isDestroyed()) win.webContents.send("navcrm:pediu-bounds"); });
  win.on("closed", () => { pararLeitura(); win = null; view = null; montado = false; });
}

// Cria (uma vez) o navegador embutido real, com sessão persistente e seguro.
function garantirView() {
  if (view) return view;
  // Sessão NOVA ("navcrm2"): a antiga ("navcrm") pode ter guardado, via service
  // worker/cache, a página "navegador desatualizado" de quando o UA ainda era
  // Electron — e continuaria mostrando mesmo com o UA corrigido. Partição limpa
  // carrega o WhatsApp do zero, já com o UA de Chrome. O login continua persistindo.
  const part = session.fromPartition("persist:navcrm2"); // cookies/login persistem
  // (Não limpamos storage/cache aqui: o conserto do UA — userAgentFallback — já
  //  resolve o "navegador desatualizado" na raiz. Limpar a cada abertura só
  //  enfraquecia o login salvo e podia derrubar o aparelho conectado do WhatsApp.
  //  Se um dia precisar zerar, é só usar o botão "recarregar" ou reconectar.)
  // Aplica o UA de Chrome na sessão inteira (afeta também os sub-recursos que o
  // WhatsApp Web usa pra decidir se o navegador é "moderno").
  try { part.setUserAgent(UA_CHROME); } catch { /* ignore */ }
  // À prova de falha: reescreve o User-Agent e as "client hints" (sec-ch-ua) em
  // TODAS as requisições dessa sessão — remove qualquer vestígio de "Electron"
  // que faça o WhatsApp mostrar a página "navegador desatualizado".
  try {
    part.webRequest.onBeforeSendHeaders((details, cb) => {
      const h = details.requestHeaders || {};
      h["User-Agent"] = UA_CHROME;
      h["sec-ch-ua"] = '"Google Chrome";v="130", "Chromium";v="130", "Not?A_Brand";v="99"';
      h["sec-ch-ua-full-version"] = '"130.0.0.0"';
      h["sec-ch-ua-full-version-list"] = '"Google Chrome";v="130.0.0.0", "Chromium";v="130.0.0.0", "Not?A_Brand";v="99.0.0.0"';
      h["sec-ch-ua-platform"] = '"Windows"';
      cb({ requestHeaders: h });
    });
  } catch { /* ignore */ }
  view = new WebContentsView({
    webPreferences: {
      session: part,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // sem preload de propósito: o conteúdo externo (WhatsApp) não acessa Node.
    },
  });
  // Remove o token "Electron" do user-agent do navegador embutido.
  try { view.webContents.setUserAgent(UA_CHROME); } catch { /* ignore */ }
  // Popups/downloads abrem no navegador do sistema (não numa janela solta).
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (urlValida(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  const emitir = () => {
    if (!win || win.isDestroyed()) return;
    win.webContents.send("navcrm:estado", {
      url: view.webContents.getURL(),
      podeVoltar: podeVoltar(view.webContents),
      podeAvancar: podeAvancar(view.webContents),
      carregando: view.webContents.isLoading(),
    });
  };
  ["did-navigate", "did-navigate-in-page", "did-start-loading", "did-stop-loading", "did-finish-load", "page-title-updated"]
    .forEach((ev) => view.webContents.on(ev, emitir));
  return view;
}

// ── IPC (poucos canais, controlados) ────────────────────────────────────────
ipcMain.handle("navcrm:montar", (_e, bounds) => {
  if (!win) return false;
  const v = garantirView();
  if (!montado) { win.contentView.addChildView(v); montado = true; }
  v.setVisible(true);
  v.setBounds(arred(bounds));
  if (!v.webContents.getURL()) v.webContents.loadURL(HOME_URL, { userAgent: UA_CHROME });
  iniciarLeitura();
  return true;
});
ipcMain.handle("navcrm:bounds", (_e, bounds) => { if (view && montado) view.setBounds(arred(bounds)); return true; });
ipcMain.handle("navcrm:desmontar", () => { pararLeitura(); if (view && montado) { try { view.setVisible(false); win && win.contentView.removeChildView(view); } catch { /* ignore */ } montado = false; } return true; });
ipcMain.handle("navcrm:navegar", (_e, url) => { if (!urlValida(url)) return false; garantirView().webContents.loadURL(url, { userAgent: UA_CHROME }); return true; });
ipcMain.handle("navcrm:voltar", () => { if (view) irVoltar(view.webContents); return true; });
ipcMain.handle("navcrm:avancar", () => { if (view) irAvancar(view.webContents); return true; });
ipcMain.handle("navcrm:recarregar", () => { if (view) view.webContents.reload(); return true; });
ipcMain.handle("navcrm:inicio", () => { garantirView().webContents.loadURL(HOME_URL, { userAgent: UA_CHROME }); return true; });
// A web (nosso app, confiável) pode afinar o seletor de leitura do contato sem
// precisar reinstalar o desktop. Só aceita string curta; nunca vem de fora.
ipcMain.handle("navcrm:extrator", (_e, code) => { if (typeof code === "string" && code.length > 8 && code.length < 8000) { extratorJS = code; lerContato(); } return true; });

app.whenReady().then(criarJanela);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) criarJanela(); });
