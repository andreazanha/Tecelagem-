// Web Push no navegador: registrar o service worker, pedir permissão e inscrever
// o aparelho para receber o aviso de "pedido novo" (mesmo com o sistema fechado).

function b64urlParaBuffer(base64: string): ArrayBuffer {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
}

export function pushSuportado(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

// true se este aparelho já está inscrito e com permissão concedida.
export async function pushAtivo(): Promise<boolean> {
  if (!pushSuportado() || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  return !!(await reg.pushManager.getSubscription());
}

export async function ativarPush(): Promise<{ ok: boolean; erro?: string }> {
  if (!pushSuportado()) return { ok: false, erro: "Este navegador não suporta notificações." };
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { ok: false, erro: "Permissão de notificação negada." };
    const r = await fetch("/api/push/public-key").then((x) => x.json());
    if (!r.key) return { ok: false, erro: "Push ainda não configurado no servidor." };
    const sub =
      (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlParaBuffer(r.key) }));
    const j = sub.toJSON();
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys }),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message || "Falha ao ativar avisos." };
  }
}

export async function desativarPush(): Promise<void> {
  if (!pushSuportado()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) {
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
}
