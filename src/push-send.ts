// Envio de Web Push SEM payload (tickle): mais simples e confiável no Workers
// (dispensa a criptografia aes128gcm). O service worker mostra um texto fixo
// "Entrou pedido novo". A autenticação é via VAPID (JWT ES256 assinado aqui).
import type { Env } from "./index";

type Sub = { endpoint: string; p256dh: string; auth: string };

let chaveCache: CryptoKey | null = null;
async function chavePrivada(env: Env): Promise<CryptoKey | null> {
  if (chaveCache) return chaveCache;
  if (!env.VAPID_JWK) return null;
  try {
    const jwk = JSON.parse(env.VAPID_JWK);
    chaveCache = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    return chaveCache;
  } catch {
    return null;
  }
}

function b64url(b: ArrayBuffer | Uint8Array): string {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Monta o JWT do VAPID para um "audience" (origem do endpoint de push).
async function vapidJwt(env: Env, aud: string): Promise<string | null> {
  const key = await chavePrivada(env);
  if (!key) return null;
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64url(
    enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || "mailto:admin@bigtricot.com.br" }))
  );
  const data = enc.encode(header + "." + payload);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, data);
  return header + "." + payload + "." + b64url(sig);
}

// Dispara o push para TODOS os aparelhos inscritos. Endpoints expirados (404/410)
// são removidos. Erros individuais são ignorados (um aparelho ruim não derruba os outros).
export async function enviarPushNovoPedido(env: Env): Promise<void> {
  if (!env.VAPID_PUBLIC || !env.VAPID_JWK) return; // push não configurado: no-op
  const { results } = await env.DB.prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions").all<Sub>();
  if (!results.length) return;
  const jwtPorAud = new Map<string, string>();
  const mortos: string[] = [];
  await Promise.all(
    results.map(async (s) => {
      try {
        const aud = new URL(s.endpoint).origin;
        let jwt = jwtPorAud.get(aud);
        if (!jwt) {
          const j = await vapidJwt(env, aud);
          if (!j) return;
          jwt = j;
          jwtPorAud.set(aud, jwt);
        }
        const res = await fetch(s.endpoint, {
          method: "POST",
          headers: {
            TTL: "86400",
            Urgency: "high",
            Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC}`,
          },
        });
        if (res.status === 404 || res.status === 410) mortos.push(s.endpoint);
      } catch {
        /* ignora este endpoint */
      }
    })
  );
  for (const e of mortos) await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(e).run();
}
