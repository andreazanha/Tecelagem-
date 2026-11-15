// Teste automatizado de autenticação (runner nativo do Node: `node:test`).
// Verifica que o middleware central NEGA por padrão: toda rota /api/* sem sessão
// responde 401; e que as rotas públicas da allowlist (ex.: /api/health) passam.
// Roda sem banco: sem header de sessão, usuarioLogado retorna null antes de tocar no D1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./index";

// Env vazio: o middleware barra antes de usar qualquer binding (DB/BUCKET/...).
const ENV_VAZIO = {} as never;
const req = (metodo: string, rota: string, init: RequestInit = {}) =>
  app.request(rota, { method: metodo, ...init }, ENV_VAZIO);

// Rotas que DEVEM exigir sessão (sem login → 401).
const PROTEGIDAS: [string, string][] = [
  ["GET", "/api/clientes"],
  ["GET", "/api/clientes?crm=1"],
  ["GET", "/api/atendimento/config"],
  ["GET", "/api/atendimento/painel"],
  ["GET", "/api/atendimento/webhook-debug"],
  ["GET", "/api/usuarios"],
  ["GET", "/api/producao"],
  ["GET", "/api/pedidos"],
  ["GET", "/api/dashboard"],
  ["GET", "/api/relatorios"],
  ["POST", "/api/integracao/pendentes/x/aprovar"], // integração sem token também é 401
];

for (const [metodo, rota] of PROTEGIDAS) {
  test(`${metodo} ${rota} → 401 sem sessão`, async () => {
    const res = await req(metodo, rota);
    assert.equal(res.status, 401, `esperava 401 em ${metodo} ${rota}, veio ${res.status}`);
  });
}

// Rota pública (allowlist) não é barrada pelo middleware.
test("GET /api/health → 200 (público)", async () => {
  const res = await req("GET", "/api/health");
  assert.equal(res.status, 200);
});

// Webhook da Z-API é público no middleware (valida token próprio dentro); sem o segredo
// no env, o middleware deixa passar (não é 401 do middleware).
test("POST /api/atendimento/webhook não é barrado pelo middleware", async () => {
  const res = await req("POST", "/api/atendimento/webhook", { body: "{}", headers: { "content-type": "application/json" } });
  assert.notEqual(res.status, 401, "o webhook não deveria ser 401 do middleware (ele valida token próprio)");
});
