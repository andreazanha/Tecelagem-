// Service worker do Big Tricot — recebe o Web Push e mostra a notificação
// "Entrou pedido novo" perto do relógio, mesmo com o navegador fechado.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

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

// Clicar na notificação foca uma aba aberta (ou abre uma nova) na lista de pedidos.
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
