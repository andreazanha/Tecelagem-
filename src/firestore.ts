// Cliente mínimo do Firestore (REST) para o Worker escrever/ler o catálogo do
// site (projeto Firebase "bigtricot-catalogo"). Usa a chave de conta de serviço
// guardada no segredo FIREBASE_SA (o JSON inteiro). Assina um JWT (RS256) com a
// chave privada, troca por um access token e fala com a API REST do Firestore.
//
// Nada de credencial no código: tudo vem de env.FIREBASE_SA.

type ServiceAccount = { client_email: string; private_key: string; project_id?: string };

// ── base64url ────────────────────────────────────────────────────────────────
function b64urlFromBytes(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlFromString(str: string): string {
  return b64urlFromBytes(new TextEncoder().encode(str));
}
function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s+/g, "");
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function lerSA(env: { FIREBASE_SA?: string }): ServiceAccount {
  const raw = (env.FIREBASE_SA || "").trim();
  if (!raw) throw new Error("FIREBASE_SA não configurado (segredo do Cloudflare).");
  let sa: ServiceAccount;
  try { sa = JSON.parse(raw); } catch { throw new Error("FIREBASE_SA não é um JSON válido."); }
  if (!sa.client_email || !sa.private_key) throw new Error("FIREBASE_SA sem client_email/private_key.");
  return sa;
}

// ── access token (JWT bearer) ────────────────────────────────────────────────
async function obterAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const signingInput = b64urlFromString(JSON.stringify(header)) + "." + b64urlFromString(JSON.stringify(claim));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key.replace(/\\n/g, "\n")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  const jwt = signingInput + "." + b64urlFromBytes(sig);

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + encodeURIComponent(jwt),
  });
  const js = (await r.json().catch(() => ({}))) as { access_token?: string; error_description?: string; error?: string };
  if (!r.ok || !js.access_token) throw new Error("Falha ao autenticar no Google: " + (js.error_description || js.error || r.status));
  return js.access_token;
}

// ── codec de valores do Firestore (REST usa valores tipados) ─────────────────
type FsValue = Record<string, unknown>;
function encode(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  if (typeof v === "object") {
    const fields: Record<string, FsValue> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) fields[k] = encode(x);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}
function decode(val: FsValue): unknown {
  if (val == null) return null;
  if ("nullValue" in val) return null;
  if ("booleanValue" in val) return val.booleanValue;
  if ("integerValue" in val) return Number(val.integerValue);
  if ("doubleValue" in val) return val.doubleValue;
  if ("stringValue" in val) return val.stringValue;
  if ("timestampValue" in val) return val.timestampValue;
  if ("arrayValue" in val) return (((val.arrayValue as { values?: FsValue[] }).values) || []).map(decode);
  if ("mapValue" in val) {
    const out: Record<string, unknown> = {};
    const f = ((val.mapValue as { fields?: Record<string, FsValue> }).fields) || {};
    for (const [k, x] of Object.entries(f)) out[k] = decode(x);
    return out;
  }
  return null;
}

function docUrl(projectId: string, caminho: string): string {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${caminho}`;
}

// ── API pública ──────────────────────────────────────────────────────────────
export async function lerDocumento(env: { FIREBASE_SA?: string }, caminho: string): Promise<Record<string, unknown> | null> {
  const sa = lerSA(env);
  const pid = sa.project_id || "bigtricot-catalogo";
  const token = await obterAccessToken(sa);
  const r = await fetch(docUrl(pid, caminho), { headers: { Authorization: "Bearer " + token } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("Firestore leitura falhou: " + r.status + " " + (await r.text().catch(() => "")));
  const js = (await r.json()) as { fields?: Record<string, FsValue> };
  return (decode({ mapValue: { fields: js.fields || {} } }) as Record<string, unknown>) || {};
}

export async function gravarDocumento(env: { FIREBASE_SA?: string }, caminho: string, dados: Record<string, unknown>): Promise<void> {
  const sa = lerSA(env);
  const pid = sa.project_id || "bigtricot-catalogo";
  const token = await obterAccessToken(sa);
  const fields: Record<string, FsValue> = {};
  for (const [k, v] of Object.entries(dados)) fields[k] = encode(v);
  // PATCH sem updateMask grava os campos enviados (cria o doc se não existir).
  const r = await fetch(docUrl(pid, caminho), {
    method: "PATCH",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error("Firestore gravação falhou: " + r.status + " " + (await r.text().catch(() => "")));
}
