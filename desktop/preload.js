// Ponte SEGURA entre o app web (React) e o processo principal do Electron.
// Só expõe os poucos métodos necessários pra controlar o navegador embutido.
// Nada de Node é exposto ao app; o conteúdo externo (WhatsApp) nem tem preload.
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("navcrmDesktop", {
  versao: 2,
  montar: (bounds) => ipcRenderer.invoke("navcrm:montar", bounds),
  bounds: (bounds) => ipcRenderer.invoke("navcrm:bounds", bounds),
  desmontar: () => ipcRenderer.invoke("navcrm:desmontar"),
  navegar: (url) => ipcRenderer.invoke("navcrm:navegar", url),
  voltar: () => ipcRenderer.invoke("navcrm:voltar"),
  avancar: () => ipcRenderer.invoke("navcrm:avancar"),
  recarregar: () => ipcRenderer.invoke("navcrm:recarregar"),
  inicio: () => ipcRenderer.invoke("navcrm:inicio"),
  // eventos: estado do navegador (url, botões, carregando) e pedido de reenviar bounds
  onEstado: (cb) => { const h = (_e, s) => cb(s); ipcRenderer.on("navcrm:estado", h); return () => ipcRenderer.removeListener("navcrm:estado", h); },
  onPedirBounds: (cb) => { const h = () => cb(); ipcRenderer.on("navcrm:pediu-bounds", h); return () => ipcRenderer.removeListener("navcrm:pediu-bounds", h); },
  // evento: contato da conversa aberta no WhatsApp ({ titulo }) — só o nome/número
  // do contato aberto, nunca mensagens. Serve pro painel carregar o cliente real.
  onContato: (cb) => { const h = (_e, p) => cb(p); ipcRenderer.on("navcrm:contato", h); return () => ipcRenderer.removeListener("navcrm:contato", h); },
});
