// Service worker do Big Tricot — recebe o Web Push e mostra a notificação
// "Entrou pedido novo" perto do relógio, mesmo com o navegador fechado.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Push SEM payload: o texto é fixo (o servidor só "cutuca" este aparelho).
self.addEventListener("push", (event) => {
  const title = "Entrou pedido novo";
  const options = {
    body: "Toque para abrir o sistema e conferir o pedido.",
    icon: "/logo-bigtricot.png",
    badge: "/logo-bigtricot.png",
    tag: "novo-pedido",
    renotify: true,
    requireInteraction: true,
    data: { url: "/pedidos" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
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
