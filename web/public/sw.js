// Service worker do Big Tricot.
//
// Faz 3 coisas:
//  1) OFFLINE: se a internet cair, mostra a página "Sem conexão" (offline.html)
//     em vez de tela branca; e se a pessoa já abriu o sistema antes, serve a
//     última versão que ela viu.
//  2) AUTO-ATUALIZAÇÃO preservada: navegação é SEMPRE "rede primeiro" — quando
//     há internet, pega a página nova do servidor; o cache é só rede de segurança.
//     (Os arquivos com hash em /assets/ são imutáveis, então vêm do cache.)
//  3) NOTIFICAÇÕES (Web Push): recebe o aviso e mostra perto do relógio.
//
// Para forçar uma troca do próprio service worker, basta mudar a VERSÃO abaixo.
const VERSAO = "v2-2026-11-14";
const CACHE_SHELL = "bt-shell-" + VERSAO;     // offline.html + ícones (fixos)
const CACHE_RUN = "bt-run-" + VERSAO;         // arquivos já vistos (assets com hash)

self.addEventListener("install", (event) => {
  // Garante a página "Sem conexão" no cache (individual, pra um erro não derrubar o resto).
  event.waitUntil((async () => {
    const c = await caches.open(CACHE_SHELL);
    await c.add("/offline.html").catch(() => {});
    for (const u of ["/icon-512.png", "/favicon-180.png", "/manifest.webmanifest"]) { c.add(u).catch(() => {}); }
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Apaga caches de versões antigas.
    const chaves = await caches.keys();
    await Promise.all(chaves.filter((k) => k.startsWith("bt-") && !k.endsWith(VERSAO)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;                       // só leitura
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // só o próprio site
  if (url.pathname.startsWith("/api/")) return;           // API nunca é cacheada (dados ao vivo)

  // 1) Abrir uma página (navegação): REDE PRIMEIRO (garante a versão nova, auto-atualização).
  //    Se estiver OFFLINE, mostra a página "Sem conexão" — nunca tela branca/quebrada.
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch (e) {
        const off = await caches.match("/offline.html");
        return off || new Response("Sem conexão.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  // 2) Arquivos com hash (/assets/*): imutáveis → CACHE PRIMEIRO.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_RUN);
      const cached = await cache.match(req);
      if (cached) return cached;
      try { const resp = await fetch(req); cache.put(req, resp.clone()).catch(() => {}); return resp; }
      catch (e) { return cached || Response.error(); }
    })());
    return;
  }

  // 3) Resto (ícones, imagens, manifest): tenta a rede, cai pro cache se faltar.
  event.respondWith((async () => {
    try {
      const resp = await fetch(req);
      caches.open(CACHE_RUN).then((c) => c.put(req, resp.clone())).catch(() => {});
      return resp;
    } catch (e) {
      const cached = await caches.match(req);
      return cached || Response.error();
    }
  })());
});

// ─── NOTIFICAÇÕES (Web Push) ────────────────────────────────────────────────
// Push COM payload: o servidor manda título/corpo/URL (JSON). Cai num texto
// padrão se vier sem dados.
self.addEventListener("push", (event) => {
  let d = { title: "Big Tricot", body: "Você tem um aviso no sistema.", url: "/", tag: "aviso" };
  try { if (event.data) d = Object.assign(d, event.data.json()); } catch (e) { /* usa o padrão */ }
  const options = {
    body: d.body,
    icon: "/logo-bigtricot.png",
    badge: "/logo-bigtricot.png",
    tag: d.tag || "aviso",
    renotify: true,
    requireInteraction: true,
    data: { url: d.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(d.title, options));
});

// Clicar na notificação foca uma aba aberta (ou abre uma nova) na URL do aviso.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const c of lista) {
        if ("focus" in c) {
          if ("navigate" in c) c.navigate(url);
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
