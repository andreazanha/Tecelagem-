// Envio de Web Push COM payload (aes128gcm, RFC 8291) — permite mensagem própria
// ("Entrou pedido novo", "Estoque baixo", etc.). Autenticação VAPID (JWT ES256).
import type { Env } from "./index";

type Sub = { endpoint: string; p256dh: string; auth: string };
const te = new TextEncoder();

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
function b64urlToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function concat(...arrs: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}
// HKDF (extract + expand para 1 bloco) — usado no aes128gcm do Web Push.
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  const okm = await hmac(prk, concat(info, new Uint8Array([1])));
  return okm.slice(0, len);
}

// Criptografa o payload para uma inscrição (aes128gcm). Retorna o corpo do POST.
export async function encryptPayload(p256dhB64: string, authB64: string, payload: Uint8Array): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(p256dhB64); // 65 bytes
  const authSecret = b64urlToBytes(authB64); // 16 bytes
  const asKeys = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", asKeys.publicKey)) as ArrayBuffer); // 65 bytes
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey } as any, asKeys.privateKey, 256));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  // IKM (RFC 8291): HKDF(auth, ecdh, "WebPush: info\0" | uaPublic | asPublic)
  const ikm = await hkdf(authSecret, ecdh, concat(te.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  // CEK e NONCE (RFC 8188)
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  // 1 registro: payload + delimitador 0x02
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, concat(payload, new Uint8Array([2]))));
  // cabeçalho: salt(16) | rs(4=4096) | idlen(1) | keyid(asPublic)
  const header = concat(salt, new Uint8Array([0, 0, 0x10, 0]), new Uint8Array([asPublic.length]), asPublic);
  return concat(header, ct);
}

async function vapidJwt(env: Env, aud: string): Promise<string | null> {
  const key = await chavePrivada(env);
  if (!key) return null;
  const header = b64url(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64url(te.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || "mailto:admin@bigtricot.com.br" })));
  const data = te.encode(header + "." + payload);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, data);
  return header + "." + payload + "." + b64url(sig);
}

// Dispara um push com título/corpo/URL para TODOS os aparelhos inscritos.
// Endpoints expirados (404/410) são removidos.
export async function enviarPush(env: Env, aviso: { titulo: string; corpo: string; url?: string; tag?: string }): Promise<void> {
  if (!env.VAPID_PUBLIC || !env.VAPID_JWK) return; // não configurado
  const { results } = await env.DB.prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions").all<Sub>();
  if (!results.length) return;
  const payload = te.encode(JSON.stringify({ title: aviso.titulo, body: aviso.corpo, url: aviso.url || "/", tag: aviso.tag || "aviso" }));
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
        const body = await encryptPayload(s.p256dh, s.auth, payload);
        const res = await fetch(s.endpoint, {
          method: "POST",
          headers: {
            TTL: "86400",
            Urgency: "high",
            "Content-Encoding": "aes128gcm",
            Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC}`,
          },
          body,
        });
        if (res.status === 404 || res.status === 410) mortos.push(s.endpoint);
      } catch {
        /* ignora este endpoint */
      }
    })
  );
  for (const e of mortos) await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(e).run();
}

export async function enviarPushNovoPedido(env: Env): Promise<void> {
  await enviarPush(env, { titulo: "Entrou pedido novo", corpo: "Toque para abrir o sistema e conferir o pedido.", url: "/pedidos", tag: "novo-pedido" });
}
