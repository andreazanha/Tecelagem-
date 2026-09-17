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
// mostrar a página "navegador desatualizado / use o Chrome 100+".
const UA_CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

let win = null;
let view = null;
let montado = false;

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
  win.once("ready-to-show", () => win.show());
  // Reposiciona o navegador embutido quando a janela muda de tamanho.
  win.on("resize", () => { if (win && !win.isDestroyed()) win.webContents.send("navcrm:pediu-bounds"); });
  win.on("closed", () => { win = null; view = null; montado = false; });
}

// Cria (uma vez) o navegador embutido real, com sessão persistente e seguro.
function garantirView() {
  if (view) return view;
  const part = session.fromPartition("persist:navcrm"); // cookies/login persistem
  // Aplica o UA de Chrome na sessão inteira (afeta também os sub-recursos que o
  // WhatsApp Web usa pra decidir se o navegador é "moderno").
  try { part.setUserAgent(UA_CHROME); } catch { /* ignore */ }
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
  if (!v.webContents.getURL()) v.webContents.loadURL(HOME_URL);
  return true;
});
ipcMain.handle("navcrm:bounds", (_e, bounds) => { if (view && montado) view.setBounds(arred(bounds)); return true; });
ipcMain.handle("navcrm:desmontar", () => { if (view && montado) { try { view.setVisible(false); win && win.contentView.removeChildView(view); } catch { /* ignore */ } montado = false; } return true; });
ipcMain.handle("navcrm:navegar", (_e, url) => { if (!urlValida(url)) return false; garantirView().webContents.loadURL(url); return true; });
ipcMain.handle("navcrm:voltar", () => { if (view) irVoltar(view.webContents); return true; });
ipcMain.handle("navcrm:avancar", () => { if (view) irAvancar(view.webContents); return true; });
ipcMain.handle("navcrm:recarregar", () => { if (view) view.webContents.reload(); return true; });
ipcMain.handle("navcrm:inicio", () => { garantirView().webContents.loadURL(HOME_URL); return true; });

app.whenReady().then(criarJanela);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) criarJanela(); });
