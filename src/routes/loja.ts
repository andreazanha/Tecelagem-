// LOJA B2B — captura do pedido do cliente (Fase 4).
// A loja (/api/integracao/loja) monta o carrinho e, no "Finalizar pedido", chama
// POST /api/loja/pedido com o CNPJ + itens. Aqui a gente:
//  1) acha o cliente pelo CNPJ (sem pontuação) e confere que não está bloqueado;
//  2) resolve, por item, as CHAVES do Syntech (TAMANHO código + COD_COR) a partir
//     do espelho erp_produtos (fonte autoritativa) — se não achar a cor, RECUSA
//     (não deixa pedido errado ir pro ERP);
//  3) grava em pedidos/pedido_itens num canal próprio ('loja_b2b'), status
//     'aguardando_aprovacao' (fora da produção) e erp_sync_status='pendente'.
// O envio pro Syntech é feito DEPOIS pela ponte (passo 4), atrás da trava erp_liberado.
import { Hono } from "hono";
import type { Env } from "../index";
import { gerarPdfPedidoLoja, type PedidoLojaItem } from "../pdf";
import { montarReservaAtomica, faltasDaReserva, expirarCarrinhosVencidos } from "../loja-estoque";
import { calcularJanela12h } from "../noite";
import { flagLigado, FLAG_RESERVAS } from "../flags";
import { gerarCatalogoSite } from "./integracao";

export const loja = new Hono<{ Bindings: Env }>();

const uid = () => crypto.randomUUID();
const soDigitos = (s: unknown) => String(s ?? "").replace(/\D+/g, "");
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

// Região de PREÇO da loja: Norte+Nordeste usam a tabela "norte"; o resto, "sul".
// (mesma lógica do catálogo em atendimento.ts). A região do CADASTRO tem prioridade.
const UF_NORTE = new Set(["AC", "AP", "AM", "PA", "RO", "RR", "TO", "AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"]);
function regiaoDeUF(uf?: string | null): "sul" | "norte" {
  return UF_NORTE.has(String(uf || "").trim().toUpperCase()) ? "norte" : "sul";
}
function regiaoDoCliente(lojaRegiao?: string | null, uf?: string | null): "sul" | "norte" {
  const r = String(lojaRegiao || "").trim().toLowerCase();
  if (r === "sul" || r === "norte") return r;
  return regiaoDeUF(uf);
}

// "Liberado" = pode ver preços e comprar. É cliente nosso de verdade quando:
//  - tem código no Syntech (codigo_erp), OU
//  - está atribuído a um representante no Syntech (rep_codigo) — veio do ERP e já é aprovado,
//    NÃO precisa aprovar de novo, OU
//  - teve o cadastro da loja APROVADO pelo gestor (loja_status = aprovado).
// Só fica "em análise" quem se cadastrou pela loja e ainda não foi aprovado (sem código, sem rep).
function clienteLiberado(codigoErp?: string | null, lojaStatus?: string | null, repCodigo?: string | null): boolean {
  if (String(codigoErp || "").trim() !== "") return true;
  if (String(repCodigo || "").trim() !== "") return true;
  return String(lojaStatus || "").trim() === "aprovado";
}

// Carteira do representante: liga por CÓDIGO do Syntech (clientes.rep_codigo =
// representantes.codigo_erp) quando o cliente veio ligado do ERP; senão cai no
// casamento por nome (clientes sem código). Assim a grafia do nome não importa.
async function carteiraDoRep(env: Env, repNome: string) {
  const repRow = await env.DB.prepare("SELECT codigo_erp FROM representantes WHERE TRIM(LOWER(nome)) = TRIM(LOWER(?)) LIMIT 1").bind(repNome).first<{ codigo_erp: string | null }>();
  const codigo = (repRow?.codigo_erp || "").trim();
  // last_pedido = data do pedido mais recente da loja (canal loja_b2b) daquele CNPJ.
  // Os pedidos guardam o CNPJ só com dígitos; o cadastro guarda formatado — normaliza os dois.
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.nome, c.fantasia, c.cnpj, c.cidade, c.uf, c.loja_regiao, COALESCE(c.codigo_erp,'') AS codigo_erp,
            COALESCE(c.rep_codigo,'') AS rep_codigo,
            COALESCE(c.loja_status,'') AS loja_status, COALESCE(c.bloqueado,0) AS bloqueado,
            (SELECT MAX(COALESCE(p.created_at, p.data_pedido)) FROM pedidos p
               WHERE p.canal='loja_b2b'
                 AND REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(p.cliente_cnpj,''),'.',''),'/',''),'-',''),' ','')
                   = REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(c.cnpj,''),'.',''),'/',''),'-',''),' ','')
            ) AS ultimo_pedido
       FROM clientes c
      WHERE (? <> '' AND c.rep_codigo = ?)
         OR (COALESCE(c.rep_codigo,'') = '' AND TRIM(LOWER(COALESCE(c.representante,''))) = TRIM(LOWER(?)))
      ORDER BY c.nome`
  ).bind(codigo, codigo, repNome).all<{ id: string; nome: string | null; fantasia: string | null; cnpj: string | null; cidade: string | null; uf: string | null; loja_regiao: string | null; codigo_erp: string; rep_codigo: string; loja_status: string; bloqueado: number; ultimo_pedido: string | null }>();
  return results.map((r) => ({
    id: r.id, nome: r.nome, fantasia: r.fantasia, cnpj: r.cnpj, cidade: r.cidade, uf: r.uf,
    regiao: regiaoDoCliente(r.loja_regiao, r.uf),
    liberado: clienteLiberado(r.codigo_erp, r.loja_status, r.rep_codigo),
    status: (r.codigo_erp || r.rep_codigo) ? "aprovado" : (r.loja_status || ""),
    bloqueado: Number(r.bloqueado) === 1,
    ultimo_pedido: r.ultimo_pedido || null,
  }));
}

// Cores usadas no pedido → {hex, foto bytes} pro PDF (mesma fonte do PDF de produção).
async function coresLojaPdf(env: Env, nomes: string[]): Promise<Record<string, { hex?: string; foto?: Uint8Array }>> {
  const usados = new Set(nomes.map((n) => (n || "").trim().toUpperCase()).filter(Boolean));
  if (!usados.size) return {};
  const m: Record<string, { hex?: string; foto?: Uint8Array }> = {};
  try {
    const { results } = await env.DB.prepare("SELECT nome, hex, foto_key FROM cores").all<{ nome: string; hex: string | null; foto_key: string | null }>();
    for (const r of results || []) {
      const key = (r.nome || "").trim().toUpperCase();
      if (!usados.has(key)) continue;
      const e: { hex?: string; foto?: Uint8Array } = {};
      if (r.hex) e.hex = r.hex;
      if (r.foto_key && env.BUCKET) { try { const o = await env.BUCKET.get(r.foto_key); if (o) e.foto = new Uint8Array(await o.arrayBuffer()); } catch { /* sem foto */ } }
      if (e.hex || e.foto) m[key] = e;
    }
  } catch { /* sem tabela de cores: segue sem fotos */ }
  return m;
}

// ── Senha da loja (PBKDF2 via Web Crypto; sem dependência externa) ──────────────
const b64 = (a: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(a as ArrayBuffer)));
export async function hashSenha(senha: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  return "pbkdf2$100000$" + b64(salt) + "$" + b64(bits);
}
async function conferirSenha(senha: string, guardado: string | null): Promise<boolean> {
  try {
    const parts = String(guardado || "").split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
    const iter = Number(parts[1]) || 100000;
    const salt = Uint8Array.from(atob(parts[2]), (ch) => ch.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, key, 256);
    return b64(bits) === parts[3];
  } catch { return false; }
}

type ItemLoja = {
  cod?: string; medida?: string; corNome?: string; corId?: string;
  qtd?: number | string; preco?: number | string; regiao?: string; nome?: string; grupo?: string;
};
type CorErp = { numero?: number; nome?: string };
type TamErp = { medida?: string; tamanho?: string };

// ENTRADA NA LOJA — CNPJ + SENHA. Devolve nome, região de preço e se está LIBERADO
// (pode ver preços/comprar). Cliente sem senha ainda é guiado a criar pelo link.
loja.post("/entrar", async (c) => {
  let body: { cnpj?: string; senha?: string } = {};
  try { body = await c.req.json(); } catch { return c.json({ erro: "json_invalido" }, 400); }
  const cnpjDig = soDigitos(body.cnpj);
  const senha = String(body.senha || "");
  if (cnpjDig.length < 11) return c.json({ erro: "cnpj_invalido", msg: "Informe um CNPJ (ou CPF) válido." }, 400);

  const cli = await c.env.DB.prepare(
    "SELECT nome, uf, loja_regiao, COALESCE(bloqueado,0) AS bloqueado, senha_hash, " +
    "COALESCE(rep_codigo,'') AS rep_codigo, COALESCE(loja_status,'') AS loja_status, COALESCE(codigo_erp,'') AS codigo_erp FROM clientes " +
    "WHERE REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cnpj,''),'.',''),'/',''),'-',''),' ','') = ? LIMIT 1"
  ).bind(cnpjDig).first<{ nome: string | null; uf: string | null; loja_regiao: string | null; bloqueado: number; senha_hash: string | null; rep_codigo: string; loja_status: string; codigo_erp: string }>();

  if (!cli) return c.json({ erro: "cliente_nao_encontrado", msg: "Não encontramos esse CNPJ. Se é sua primeira vez, cadastre sua loja." }, 404);
  if (Number(cli.bloqueado) === 1) return c.json({ erro: "cliente_bloqueado", msg: "Seu cadastro está bloqueado no momento. Fale com a Big Tricot." }, 403);

  // Sem senha criada ainda: precisa abrir o LINK que a Big Tricot enviou pra criar a senha.
  if (!cli.senha_hash) return c.json({ erro: "sem_senha", msg: "Seu acesso ainda não tem senha. Abra o link que a Big Tricot te enviou para criar a sua senha." }, 401);
  if (!senha) return c.json({ erro: "senha_requerida", msg: "Digite sua senha." }, 401);
  if (!(await conferirSenha(senha, cli.senha_hash))) return c.json({ erro: "senha_invalida", msg: "Senha incorreta." }, 401);

  return c.json({
    ok: true, nome: cli.nome || "", regiao: regiaoDoCliente(cli.loja_regiao, cli.uf),
    liberado: clienteLiberado(cli.codigo_erp, cli.loja_status, cli.rep_codigo),
    status: (cli.codigo_erp || cli.rep_codigo) ? "aprovado" : (cli.loja_status || ""),
  });
});

// SESSÃO — ao recarregar a loja, confirma rapidinho (sem senha) o estado do cliente já logado:
// nome, região e se está liberado (o gestor pode ter aprovado nesse meio tempo).
loja.get("/sessao", async (c) => {
  const cnpjDig = soDigitos(c.req.query("cnpj"));
  if (cnpjDig.length < 11) return c.json({ ok: false });
  const cli = await c.env.DB.prepare(
    "SELECT nome, uf, loja_regiao, COALESCE(bloqueado,0) AS bloqueado, senha_hash, " +
    "COALESCE(rep_codigo,'') AS rep_codigo, COALESCE(loja_status,'') AS loja_status, COALESCE(codigo_erp,'') AS codigo_erp FROM clientes " +
    "WHERE REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cnpj,''),'.',''),'/',''),'-',''),' ','') = ? LIMIT 1"
  ).bind(cnpjDig).first<{ nome: string | null; uf: string | null; loja_regiao: string | null; bloqueado: number; senha_hash: string | null; rep_codigo: string; loja_status: string; codigo_erp: string }>();
  if (!cli || Number(cli.bloqueado) === 1 || !cli.senha_hash) return c.json({ ok: false });
  return c.json({
    ok: true, nome: cli.nome || "", regiao: regiaoDoCliente(cli.loja_regiao, cli.uf),
    liberado: clienteLiberado(cli.codigo_erp, cli.loja_status, cli.rep_codigo),
    status: (cli.codigo_erp || cli.rep_codigo) ? "aprovado" : (cli.loja_status || ""),
  });
});

// LINK DE ACESSO — o gestor gera um link com token e envia pro cliente. Ao abrir, o cliente
// confirma quem é (nome + CNPJ mascarado) e cria a senha dele. GET valida o token.
loja.get("/acesso", async (c) => {
  const token = String(c.req.query("token") || "").trim();
  if (token.length < 10) return c.json({ erro: "token_invalido", msg: "Link inválido." }, 400);
  const cli = await c.env.DB.prepare(
    "SELECT nome, cnpj, senha_hash, COALESCE(bloqueado,0) AS bloqueado FROM clientes WHERE acesso_token = ? LIMIT 1"
  ).bind(token).first<{ nome: string | null; cnpj: string | null; senha_hash: string | null; bloqueado: number }>();
  if (!cli) return c.json({ erro: "token_invalido", msg: "Link inválido ou expirado. Peça um novo à Big Tricot." }, 404);
  if (Number(cli.bloqueado) === 1) return c.json({ erro: "cliente_bloqueado", msg: "Cadastro bloqueado." }, 403);
  const dig = soDigitos(cli.cnpj);
  const mascara = dig.length >= 6 ? dig.slice(0, 2) + "•••" + dig.slice(-4) : "";
  return c.json({ ok: true, nome: cli.nome || "", cnpj_mascara: mascara, tem_senha: !!cli.senha_hash });
});

// DEFINIR / TROCAR A SENHA. Dois caminhos: (1) pelo token do link (primeiro acesso), ou
// (2) logado: CNPJ + senha_atual. Depois de definir, já devolve a sessão (liberado etc.).
loja.post("/definir-senha", async (c) => {
  let b: { token?: string; cnpj?: string; senha_atual?: string; nova?: string; esqueci?: boolean } = {};
  try { b = await c.req.json(); } catch { return c.json({ erro: "json_invalido" }, 400); }
  const nova = String(b.nova || "");
  if (nova.length < 4) return c.json({ erro: "senha_curta", msg: "Crie uma senha com pelo menos 4 caracteres." }, 400);

  let cli: { id: string; nome: string | null; cnpj: string | null; uf: string | null; loja_regiao: string | null; senha_hash: string | null; loja_status: string; codigo_erp: string; rep_codigo: string } | null = null;
  const token = String(b.token || "").trim();
  if (token.length >= 10) {
    cli = await c.env.DB.prepare(
      "SELECT id, nome, cnpj, uf, loja_regiao, senha_hash, COALESCE(loja_status,'') AS loja_status, COALESCE(codigo_erp,'') AS codigo_erp, COALESCE(rep_codigo,'') AS rep_codigo, COALESCE(bloqueado,0) AS bloqueado FROM clientes WHERE acesso_token = ? LIMIT 1"
    ).bind(token).first();
    if (!cli) return c.json({ erro: "token_invalido", msg: "Link inválido. Peça um novo à Big Tricot." }, 404);
  } else {
    const cnpjDig = soDigitos(b.cnpj);
    if (cnpjDig.length < 11) return c.json({ erro: "cnpj_invalido", msg: "CNPJ inválido." }, 400);
    cli = await c.env.DB.prepare(
      "SELECT id, nome, cnpj, uf, loja_regiao, senha_hash, COALESCE(loja_status,'') AS loja_status, COALESCE(codigo_erp,'') AS codigo_erp, COALESCE(rep_codigo,'') AS rep_codigo FROM clientes " +
      "WHERE REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cnpj,''),'.',''),'/',''),'-',''),' ','') = ? LIMIT 1"
    ).bind(cnpjDig).first();
    if (!cli) return c.json({ erro: "cliente_nao_encontrado", msg: "CNPJ não encontrado." }, 404);
    // SEM self-service pelo CNPJ: quem já tem senha só troca sabendo a senha atual. Redefinição
    // de quem esqueceu a senha é SEMPRE por LINK (token) reenviado pela Big — nunca pelo CNPJ só
    // (senão qualquer um que saiba o CNPJ trocaria a senha e entraria como o cliente).
    if (cli.senha_hash && !(await conferirSenha(String(b.senha_atual || ""), cli.senha_hash))) return c.json({ erro: "senha_invalida", msg: "Senha atual incorreta. Para redefinir, peça um novo link à Big Tricot." }, 401);
  }

  const hash = await hashSenha(nova);
  // Se veio pelo LINK (token = o gestor confirmou que é cliente nosso), já LIBERA junto.
  const viaToken = token.length >= 10;
  const statusFinal = viaToken && String(cli.loja_status) !== "recusado" ? "aprovado" : ((cli.codigo_erp || cli.rep_codigo) ? "aprovado" : (cli.loja_status || ""));
  if (viaToken && String(cli.loja_status) !== "recusado") {
    await c.env.DB.prepare("UPDATE clientes SET senha_hash=?, loja_status='aprovado' WHERE id=?").bind(hash, cli.id).run();
  } else {
    await c.env.DB.prepare("UPDATE clientes SET senha_hash=? WHERE id=?").bind(hash, cli.id).run();
  }
  return c.json({
    ok: true, nome: cli.nome || "", cnpj: soDigitos(cli.cnpj), regiao: regiaoDoCliente(cli.loja_regiao, cli.uf),
    liberado: clienteLiberado(cli.codigo_erp, statusFinal, cli.rep_codigo),
    status: statusFinal,
  });
});

// ── REPRESENTANTE (R1) — login próprio (e-mail + senha) e carteira (só os clientes dele) ──
loja.post("/rep-entrar", async (c) => {
  let b: { email?: string; senha?: string } = {};
  try { b = await c.req.json(); } catch { return c.json({ erro: "json_invalido" }, 400); }
  const email = String(b.email || "").trim().toLowerCase();
  const senha = String(b.senha || "");
  if (!email) return c.json({ erro: "email_invalido", msg: "Informe o seu e-mail." }, 400);
  const rep = await c.env.DB.prepare(
    "SELECT id, nome, email, senha_hash, COALESCE(ativo,1) AS ativo FROM representantes WHERE LOWER(TRIM(COALESCE(email,'')))=? LIMIT 1"
  ).bind(email).first<{ id: string; nome: string; email: string | null; senha_hash: string | null; ativo: number }>();
  if (!rep) return c.json({ erro: "rep_nao_encontrado", msg: "Não encontramos esse e-mail de representante. Fale com a Big Tricot." }, 404);
  if (Number(rep.ativo) === 0) return c.json({ erro: "rep_inativo", msg: "Seu acesso está inativo. Fale com a Big Tricot." }, 403);
  if (!rep.senha_hash) return c.json({ erro: "sem_senha", msg: "Seu acesso ainda não tem senha. Abra o link que a Big Tricot te enviou para criar a sua senha." }, 401);
  if (!senha) return c.json({ erro: "senha_requerida", msg: "Digite sua senha." }, 401);
  if (!(await conferirSenha(senha, rep.senha_hash))) return c.json({ erro: "senha_invalida", msg: "Senha incorreta." }, 401);
  return c.json({ ok: true, rep: { id: rep.id, nome: rep.nome, email: rep.email || "" }, clientes: await carteiraDoRep(c.env, rep.nome) });
});

// Recarregar a sessão do rep (sem senha): devolve a carteira atualizada.
loja.get("/rep-carteira", async (c) => {
  const id = String(c.req.query("rep") || "").trim();
  if (!id) return c.json({ ok: false });
  const rep = await c.env.DB.prepare(
    "SELECT id, nome, email, senha_hash, COALESCE(ativo,1) AS ativo FROM representantes WHERE id=? LIMIT 1"
  ).bind(id).first<{ id: string; nome: string; email: string | null; senha_hash: string | null; ativo: number }>();
  if (!rep || !rep.senha_hash || Number(rep.ativo) === 0) return c.json({ ok: false });
  return c.json({ ok: true, rep: { id: rep.id, nome: rep.nome, email: rep.email || "" }, clientes: await carteiraDoRep(c.env, rep.nome) });
});

// Vendas do representante (mini painel): soma por mês dos últimos 6 meses + KPIs do mês
// atual. Só pedidos REAIS do rep logado — exclui rascunho/em-espera (não é venda efetuada).
loja.get("/rep-vendas", async (c) => {
  const id = String(c.req.query("rep") || "").trim();
  if (!id) return c.json({ ok: false });
  const rep = await c.env.DB.prepare(
    "SELECT id, nome, COALESCE(ativo,1) AS ativo FROM representantes WHERE id=? LIMIT 1"
  ).bind(id).first<{ id: string; nome: string; ativo: number }>();
  if (!rep || Number(rep.ativo) === 0) return c.json({ ok: false });
  let rows: { v: number; dt: string }[] = [];
  try {
    const r = await c.env.DB.prepare(
      `SELECT COALESCE(valor_total,0) AS v, COALESCE(created_at,'') AS dt
         FROM pedidos
        WHERE canal='loja_b2b'
          AND TRIM(LOWER(COALESCE(vendedor,''))) = TRIM(LOWER(?))
          AND COALESCE(erp_sync_status,'') <> 'rascunho'
          AND COALESCE(created_at,'') >= datetime('now','-6 months','start of month')`
    ).bind(rep.nome).all<{ v: number; dt: string }>();
    rows = r.results || [];
  } catch { rows = []; }
  const ML = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const now = new Date();
  const meses: { key: string; label: string; valor: number; pedidos: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    meses.push({ key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, label: ML[d.getUTCMonth()], valor: 0, pedidos: 0 });
  }
  const ix = new Map(meses.map((m, i) => [m.key, i] as const));
  for (const r of rows) {
    const k = String(r.dt || "").slice(0, 7);
    const i = ix.get(k);
    if (i != null) { meses[i].valor += Number(r.v) || 0; meses[i].pedidos += 1; }
  }
  const atual = meses[meses.length - 1];
  return c.json({ ok: true, meses, mes_atual: { valor: atual.valor, pedidos: atual.pedidos } });
});

// Link de acesso do rep: valida o token e mostra quem é.
loja.get("/rep-acesso", async (c) => {
  const token = String(c.req.query("token") || "").trim();
  if (token.length < 10) return c.json({ erro: "token_invalido", msg: "Link inválido." }, 400);
  const rep = await c.env.DB.prepare(
    "SELECT nome, email, senha_hash, COALESCE(ativo,1) AS ativo FROM representantes WHERE acesso_token=? LIMIT 1"
  ).bind(token).first<{ nome: string; email: string | null; senha_hash: string | null; ativo: number }>();
  if (!rep) return c.json({ erro: "token_invalido", msg: "Link inválido ou expirado. Peça um novo à Big Tricot." }, 404);
  if (Number(rep.ativo) === 0) return c.json({ erro: "rep_inativo", msg: "Acesso inativo." }, 403);
  const em = String(rep.email || "");
  const mask = em ? em.replace(/^(.{1,2})[^@]*(@.*)$/, "$1•••$2") : "";
  return c.json({ ok: true, nome: rep.nome, email_mascara: mask, tem_senha: !!rep.senha_hash });
});

// Definir/trocar a senha do rep (via token do link, ou e-mail + senha atual).
loja.post("/rep-definir-senha", async (c) => {
  let b: { token?: string; email?: string; senha_atual?: string; nova?: string; esqueci?: boolean } = {};
  try { b = await c.req.json(); } catch { return c.json({ erro: "json_invalido" }, 400); }
  const nova = String(b.nova || "");
  if (nova.length < 4) return c.json({ erro: "senha_curta", msg: "Crie uma senha com pelo menos 4 caracteres." }, 400);
  let rep: { id: string; nome: string; email: string | null; senha_hash: string | null } | null = null;
  const token = String(b.token || "").trim();
  if (token.length >= 10) {
    rep = await c.env.DB.prepare("SELECT id, nome, email, senha_hash FROM representantes WHERE acesso_token=? LIMIT 1").bind(token).first();
    if (!rep) return c.json({ erro: "token_invalido", msg: "Link inválido. Peça um novo à Big Tricot." }, 404);
  } else {
    const email = String(b.email || "").trim().toLowerCase();
    if (!email) return c.json({ erro: "email_invalido", msg: "Informe o e-mail." }, 400);
    rep = await c.env.DB.prepare("SELECT id, nome, email, senha_hash FROM representantes WHERE LOWER(TRIM(COALESCE(email,'')))=? LIMIT 1").bind(email).first();
    if (!rep) return c.json({ erro: "rep_nao_encontrado", msg: "E-mail não encontrado." }, 404);
    // SEM self-service pelo e-mail: quem já tem senha só troca sabendo a senha atual. Quem esqueceu
    // redefine SEMPRE pelo LINK (token) enviado por e-mail via /rep-esqueci — nunca só com o e-mail
    // (senão qualquer um que saiba o e-mail do rep trocaria a senha e entraria como ele).
    if (rep.senha_hash && !(await conferirSenha(String(b.senha_atual || ""), rep.senha_hash))) return c.json({ erro: "senha_invalida", msg: "Senha atual incorreta. Para redefinir, use o link enviado no seu e-mail." }, 401);
  }
  const hash = await hashSenha(nova);
  await c.env.DB.prepare("UPDATE representantes SET senha_hash=? WHERE id=?").bind(hash, rep.id).run();
  return c.json({ ok: true, rep: { id: rep.id, nome: rep.nome, email: rep.email || "" }, clientes: await carteiraDoRep(c.env, rep.nome) });
});

// Código curto (10 chars, sem caracteres ambíguos) para o link de acesso/redefinição.
function gerarCodigoCurto(n = 10): string {
  const alf = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const a = new Uint8Array(n); crypto.getRandomValues(a);
  let s = ""; for (const x of a) s += alf[x % alf.length];
  return s;
}
function escHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
// Envia o e-mail de redefinição de senha do representante via Resend (HTTP API).
async function enviarEmailReset(env: Env, para: string, nome: string, link: string): Promise<void> {
  const from = String(env.EMAIL_FROM || "Big Tricot <naoresponda@bigtricot.com.br>");
  const nm = escHtml((nome || "").split(" ")[0] || "");
  const lk = escHtml(link);
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#2c2721;line-height:1.5">` +
    `<div style="font-size:20px;font-weight:bold;color:#ad5033;margin-bottom:4px">Big Tricot</div>` +
    `<div style="font-size:13px;color:#8a8073;letter-spacing:1px;margin-bottom:18px">ÁREA DO REPRESENTANTE</div>` +
    `<p>Olá${nm ? " " + nm : ""},</p>` +
    `<p>Recebemos um pedido para redefinir a senha do seu acesso de representante.</p>` +
    `<p style="margin:22px 0"><a href="${lk}" style="display:inline-block;background:#2c3e50;color:#fff;text-decoration:none;padding:13px 22px;border-radius:10px;font-weight:bold">Criar uma nova senha</a></p>` +
    `<p style="font-size:13px;color:#777">Ou copie e cole este link no navegador:<br><span style="color:#2c3e50">${lk}</span></p>` +
    `<p style="font-size:13px;color:#777;margin-top:22px">Se você não pediu isso, pode ignorar este e-mail — sua senha atual continua valendo.</p>` +
    `</div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${String(env.RESEND_API_KEY || "")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [para], subject: "Redefinir sua senha — Área do Representante", html }),
  });
  if (!r.ok) throw new Error("resend_falhou_" + r.status + "_" + (await r.text().catch(() => "")).slice(0, 200));
}

// "Esqueci minha senha" do rep (self-service): gera um link de redefinição e MANDA
// no e-mail cadastrado dele. A resposta é sempre a mesma (não revela se o e-mail
// existe) — evita que alguém descubra quais e-mails estão cadastrados. Se o envio
// de e-mail não estiver configurado (sem RESEND_API_KEY), devolve 'email_desligado'
// pra tela cair no fluxo do WhatsApp.
loja.post("/rep-esqueci", async (c) => {
  let b: { email?: string } = {};
  try { b = await c.req.json(); } catch { return c.json({ erro: "json_invalido" }, 400); }
  const email = String(b.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return c.json({ erro: "email_invalido", msg: "Digite o seu e-mail no campo acima e clique de novo." }, 400);
  if (!String(c.env.RESEND_API_KEY || "").trim()) return c.json({ erro: "email_desligado" }, 200);
  const rep = await c.env.DB.prepare(
    "SELECT id, nome, email, COALESCE(ativo,1) AS ativo FROM representantes WHERE LOWER(TRIM(COALESCE(email,'')))=? LIMIT 1"
  ).bind(email).first<{ id: string; nome: string; email: string | null; ativo: number }>();
  // Só envia de fato se achou um representante ATIVO com e-mail; a resposta é igual nos dois casos.
  if (rep && Number(rep.ativo) !== 0 && String(rep.email || "").trim()) {
    const token = gerarCodigoCurto(10);
    await c.env.DB.prepare("UPDATE representantes SET acesso_token=? WHERE id=?").bind(token, rep.id).run();
    const link = `https://vendas.bigtricot.com.br/r/?c=${token}`;
    try { await enviarEmailReset(c.env, String(rep.email), rep.nome || "", link); } catch { /* não revela falha de envio */ }
  }
  return c.json({ ok: true });
});

// O REP cadastra um cliente novo da carteira dele → vai pra fila de aprovação (pendente),
// já atrelado ao representante. Sem senha (o cliente não loga; o rep compra por ele).
loja.post("/rep-cadastrar-cliente", async (c) => {
  let b: Record<string, string> = {};
  try { b = await c.req.json(); } catch { return c.json({ erro: "json_invalido" }, 400); }
  const s = (k: string) => String(b[k] ?? "").trim();
  const rep = await c.env.DB.prepare("SELECT id, nome, COALESCE(ativo,1) AS ativo FROM representantes WHERE id=? LIMIT 1")
    .bind(s("rep_id")).first<{ id: string; nome: string; ativo: number }>();
  if (!rep || Number(rep.ativo) === 0) return c.json({ erro: "rep_invalido", msg: "Sessão do representante inválida. Entre de novo." }, 401);
  const cnpjDig = soDigitos(b.cnpj);
  const nome = s("nome"), cidade = s("cidade"), uf = s("uf").toUpperCase().slice(0, 2);
  if (cnpjDig.length < 11) return c.json({ erro: "cnpj_invalido", msg: "Informe um CNPJ (ou CPF) válido." }, 400);
  if (!nome || !cidade || !uf) return c.json({ erro: "faltam_dados", msg: "Preencha razão social, cidade e UF." }, 400);
  const ex = await c.env.DB.prepare(
    "SELECT id, COALESCE(codigo_erp,'') AS codigo_erp FROM clientes WHERE REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cnpj,''),'.',''),'/',''),'-',''),' ','') = ? LIMIT 1"
  ).bind(cnpjDig).first<{ id: string; codigo_erp: string }>();
  if (ex && ex.codigo_erp) {
    // já é cliente: só garante o representante e devolve (fica liberado na hora).
    await c.env.DB.prepare("UPDATE clientes SET representante=CASE WHEN COALESCE(TRIM(representante),'')='' THEN ? ELSE representante END WHERE id=?").bind(rep.nome, ex.id).run();
    return c.json({ ok: true, ja_existe: true, msg: "Esse cliente já é nosso — coloquei na sua carteira.", clientes: await carteiraDoRep(c.env, rep.nome) });
  }
  const campos = {
    fantasia: s("fantasia") || nome, inscricao_estadual: s("inscricao"), endereco: s("endereco"), numero: s("numero"),
    bairro: s("bairro"), cep: soDigitos(b.cep), email: s("email"), telefone: s("telefone") || s("whatsapp"),
    whatsapp: soDigitos(b.whatsapp) || soDigitos(b.telefone),
  };
  // Rep é de confiança: o cliente já entra LIBERADO (rep monta o pedido na hora). O gestor
  // ainda vê na fila e o PEDIDO só vai pro Syntech depois da aprovação dele. Região pela UF.
  const regiaoRep = regiaoDeUF(uf);
  if (ex) {
    await c.env.DB.prepare(
      "UPDATE clientes SET nome=?, fantasia=?, inscricao_estadual=?, endereco=?, numero=?, bairro=?, cep=?, cidade=?, uf=?, email=?, telefone=?, whatsapp=?, representante=?, origem='rep', loja_status='aprovado', loja_regiao=?, loja_criar_erp=1, loja_cadastro_em=datetime('now') WHERE id=?"
    ).bind(nome, campos.fantasia, campos.inscricao_estadual, campos.endereco, campos.numero, campos.bairro, campos.cep, cidade, uf, campos.email, campos.telefone, campos.whatsapp, rep.nome, regiaoRep, ex.id).run();
  } else {
    await c.env.DB.prepare(
      "INSERT INTO clientes (id, nome, fantasia, cnpj, inscricao_estadual, endereco, numero, bairro, cep, cidade, uf, email, telefone, whatsapp, representante, origem, loja_status, loja_regiao, loja_criar_erp, loja_cadastro_em) " +
      "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'rep', 'aprovado', ?, 1, datetime('now'))"
    ).bind(uid(), nome, campos.fantasia, cnpjDig, campos.inscricao_estadual, campos.endereco, campos.numero, campos.bairro, campos.cep, cidade, uf, campos.email, campos.telefone, campos.whatsapp, rep.nome, regiaoRep).run();
  }
  return c.json({ ok: true, cnpj: cnpjDig, msg: "Cliente cadastrado! Já pode montar o pedido.", clientes: await carteiraDoRep(c.env, rep.nome) });
});

// "Meus pedidos" do REPRESENTANTE: pedidos que ele montou (vendedor = nome do rep),
// com status amigável do nosso fluxo (em espera / enviado / aprovado / no Syntech).
loja.get("/rep-pedidos", async (c) => {
  const repId = String(c.req.query("rep") || "").trim();
  if (!repId) return c.json({ pedidos: [] });
  const rep = await c.env.DB.prepare("SELECT nome FROM representantes WHERE id=? LIMIT 1").bind(repId).first<{ nome: string }>();
  if (!rep) return c.json({ pedidos: [] });
  const { results: peds } = await c.env.DB.prepare(
    `SELECT p.id, p.cliente_nome, p.cliente_cnpj, p.valor_total, p.created_at,
            COALESCE(p.erp_sync_status,'pendente') AS sync, COALESCE(p.erp_liberado,0) AS liberado,
            COALESCE(p.loja_forma_desc,'') AS forma, p.erp_numero, p.reserva_expira_em AS expira_em,
            (SELECT COALESCE(SUM(qtd),0) FROM pedido_itens WHERE pedido_id=p.id) AS pecas
       FROM pedidos p
      WHERE p.canal='loja_b2b' AND TRIM(LOWER(COALESCE(p.vendedor,''))) = TRIM(LOWER(?))
      ORDER BY p.created_at DESC LIMIT 100`
  ).bind(rep.nome).all<{ id: string; cliente_nome: string | null; cliente_cnpj: string | null; valor_total: number | null; created_at: string | null; sync: string; liberado: number; forma: string; erp_numero: number | null; expira_em: string | null; pecas: number }>();
  const pedidos = (peds || []).map((p) => {
    let status: string, label: string;
    if (p.sync === "rascunho") { status = "espera"; label = "Em espera"; }
    else if (p.sync === "enviado") { status = "syntech"; label = p.erp_numero ? ("No Syntech · nº " + p.erp_numero) : "No Syntech"; }
    else if (p.sync === "erro") { status = "erro"; label = "Com erro — a Big resolve"; }
    else if (Number(p.liberado) === 1) { status = "aprovado"; label = "Aprovado · indo pro Syntech"; }
    else { status = "aguardando"; label = "Enviado · aguardando a Big"; }
    return {
      id: p.id, cliente: p.cliente_nome, cnpj: p.cliente_cnpj, data: p.created_at,
      total: p.valor_total, pecas: Number(p.pecas) || 0, forma: p.forma,
      // expira_em só faz sentido pro 'em espera' (rascunho com reserva ativa) — igual ao cliente.
      expira_em: p.sync === "rascunho" ? (p.expira_em || "") : "",
      status, label, editavel: p.sync === "rascunho",
    };
  });
  return c.json({ pedidos });
});

// Ação do rep num pedido EM ESPERA (rascunho): enviar à Big ou excluir.
loja.post("/rep-pedido-acao", async (c) => {
  const b = await c.req.json().catch(() => ({})) as { rep?: string; pedido_id?: string; acao?: string; cod_prazo?: string; forma_desc?: string };
  const repId = String(b.rep || "").trim(); const pid = String(b.pedido_id || "").trim(); const acao = String(b.acao || "").trim();
  if (!repId || !pid) return c.json({ erro: "faltam_dados" }, 400);
  const rep = await c.env.DB.prepare("SELECT nome FROM representantes WHERE id=? LIMIT 1").bind(repId).first<{ nome: string }>();
  if (!rep) return c.json({ erro: "rep_invalido" }, 403);
  const ped = await c.env.DB.prepare(
    "SELECT id, COALESCE(erp_sync_status,'') AS sync, COALESCE(loja_cod_prazo,'') AS prazo, COALESCE(aprovado_erp_em,'') AS aprovado FROM pedidos WHERE id=? AND canal='loja_b2b' AND TRIM(LOWER(COALESCE(vendedor,'')))=TRIM(LOWER(?)) LIMIT 1"
  ).bind(pid, rep.nome).first<{ id: string; sync: string; prazo: string; aprovado: string }>();
  if (!ped) return c.json({ erro: "nao_encontrado", msg: "Pedido não encontrado." }, 404);
  // CANCELAR: o rep cancela o PRÓPRIO pedido enquanto a Big não aprovou (rascunho OU enviado-não-aprovado).
  if (acao === "cancelar") {
    if (String(ped.aprovado || "").trim()) return c.json({ erro: "ja_aprovado", msg: "Esse pedido já foi aprovado pela Big Tricot e está em produção. Fale com a Big para cancelar." }, 409);
    if (ped.sync === "rascunho") {
      await c.env.DB.batch([
        c.env.DB.prepare("DELETE FROM erp_reserva WHERE pedido_id=?").bind(pid),
        c.env.DB.prepare("DELETE FROM pedido_itens WHERE pedido_id=?").bind(pid),
        c.env.DB.prepare("DELETE FROM pedidos WHERE id=? AND canal='loja_b2b'").bind(pid),
      ]);
      return c.json({ ok: true, msg: "Pedido cancelado." });
    }
    if (!["enviado", "pendente", "erro"].includes(String(ped.sync))) return c.json({ erro: "nao_cancelavel", msg: "Esse pedido não pode mais ser cancelado por aqui." }, 409);
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM erp_reserva WHERE pedido_id=?").bind(pid), // devolve o estoque reservado
      c.env.DB.prepare("UPDATE pedidos SET erp_sync_status='cancelado' WHERE id=? AND canal='loja_b2b'").bind(pid),
    ]);
    return c.json({ ok: true, msg: "Pedido cancelado. As peças voltaram para o estoque." });
  }
  // APROVAR: o rep confirma o PRÓPRIO pedido enviado (status "Aguardando aprovação"). Vira "Confirmado".
  if (acao === "aprovar") {
    if (String(ped.aprovado || "").trim()) return c.json({ ok: true, msg: "Pedido já aprovado." });
    if (ped.sync !== "enviado") return c.json({ erro: "nao_aprovavel", msg: "Esse pedido não pode ser aprovado agora." }, 409);
    await c.env.DB.prepare("UPDATE pedidos SET aprovado_erp_em=datetime('now') WHERE id=? AND canal='loja_b2b'").bind(pid).run();
    return c.json({ ok: true, msg: "Pedido aprovado! Confirmado para produção." });
  }
  if (ped.sync !== "rascunho") return c.json({ erro: "nao_rascunho", msg: "Esse pedido já foi enviado." }, 409);
  if (acao === "excluir") {
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM pedido_itens WHERE pedido_id=?").bind(pid),
      c.env.DB.prepare("DELETE FROM pedidos WHERE id=? AND canal='loja_b2b'").bind(pid),
    ]);
    return c.json({ ok: true, msg: "Pedido em espera excluído." });
  }
  if (acao === "enviar") {
    const prazo = String(b.cod_prazo || "").trim() || ped.prazo;
    if (!prazo) return c.json({ erro: "sem_forma", msg: "Escolha a forma de pagamento antes de enviar." }, 400);
    const formaDesc = String(b.forma_desc || "").trim().slice(0, 120) || null;
    // TRAVA DE ESTOQUE: ao enviar um rascunho do rep pro Syntech, confere/reserva as peças
    // (mesma trava do checkout do cliente), senão esse caminho fugiria do controle.
    // INTERRUPTOR "reservas_ativo": desligado (padrão) → envia o pedido SEM reservar estoque.
    const reservarEstoque = await flagLigado(c.env, FLAG_RESERVAS);
    const itensPed = reservarEstoque ? (((await c.env.DB.prepare("SELECT ref, COALESCE(cor_grade,'') AS cor, COALESCE(erp_tamanho,'') AS tam, qtd FROM pedido_itens WHERE pedido_id=?").bind(pid).all<{ ref: string; cor: string; tam: string; qtd: number }>().catch(() => ({ results: [] as { ref: string; cor: string; tam: string; qtd: number }[] }))).results) || []) : [];
    // Trava ATÔMICA (mesma do checkout do cliente): reserva no MESMO batch do UPDATE pra pendente.
    let reservaStmts: D1PreparedStatement[] = [];
    let alvo: Awaited<ReturnType<typeof montarReservaAtomica>>["alvo"] = [];
    if (reservarEstoque) {
      const rr = await montarReservaAtomica(c.env, pid, itensPed.map((it) => ({ ref: it.ref, cor: it.cor, tam: it.tam, qtd: Number(it.qtd) || 0 })));
      reservaStmts = rr.stmts; alvo = rr.alvo;
    }
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE pedidos SET erp_sync_status='pendente', loja_fase='enviado', loja_cod_prazo=?, loja_forma_desc=COALESCE(?, loja_forma_desc) WHERE id=? AND canal='loja_b2b'").bind(prazo, formaDesc, pid),
      ...reservaStmts,
    ]);
    const faltas = alvo.length ? await faltasDaReserva(c.env, pid, alvo) : [];
    if (faltas.length) {
      // desfaz: volta o pedido pra rascunho e solta a reserva (nada vai pro Syntech sem estoque).
      await c.env.DB.batch([
        c.env.DB.prepare("DELETE FROM erp_reserva WHERE pedido_id=?").bind(pid),
        c.env.DB.prepare("UPDATE pedidos SET erp_sync_status='rascunho', loja_fase='em_espera' WHERE id=? AND canal='loja_b2b'").bind(pid),
      ]);
      return c.json({ erro: "sem_estoque", msg: "Alguns itens não têm estoque suficiente agora. Ajuste o pedido e tente novamente.", faltas }, 409);
    }
    return c.json({ ok: true, msg: "Pedido enviado! Aguardando a Big Tricot aprovar." });
  }
  return c.json({ erro: "acao_invalida" }, 400);
});

// Reabrir um pedido EM ESPERA (rascunho) no catálogo: devolve o cliente + itens no
// formato do carrinho, pro rep adicionar mais produtos e salvar de novo o mesmo rascunho.
loja.get("/rep-pedido-itens", async (c) => {
  const id = String(c.req.query("id") || "").trim();
  const repId = String(c.req.query("rep") || "").trim();
  if (!id || !repId) return c.json({ erro: "faltam_dados" }, 400);
  const rep = await c.env.DB.prepare("SELECT nome FROM representantes WHERE id=? LIMIT 1").bind(repId).first<{ nome: string }>();
  if (!rep) return c.json({ erro: "rep_invalido" }, 403);
  const ped = await c.env.DB.prepare(
    "SELECT id, cliente_id, COALESCE(erp_sync_status,'') AS sync, COALESCE(loja_cod_prazo,'') AS prazo, COALESCE(loja_forma_desc,'') AS forma, COALESCE(observacao,'') AS obs FROM pedidos WHERE id=? AND canal='loja_b2b' AND TRIM(LOWER(COALESCE(vendedor,'')))=TRIM(LOWER(?)) LIMIT 1"
  ).bind(id, rep.nome).first<{ id: string; cliente_id: string | null; sync: string; prazo: string; forma: string; obs: string }>();
  if (!ped) return c.json({ erro: "nao_encontrado", msg: "Pedido não encontrado." }, 404);
  if (ped.sync !== "rascunho") return c.json({ erro: "nao_rascunho", msg: "Esse pedido já foi enviado — não dá mais pra editar. Peça liberação à Big Tricot." }, 409);
  const cli = await c.env.DB.prepare(
    "SELECT id, nome, fantasia, cnpj, uf, loja_regiao, COALESCE(codigo_erp,'') AS codigo_erp, COALESCE(rep_codigo,'') AS rep_codigo, COALESCE(loja_status,'') AS loja_status FROM clientes WHERE id=? LIMIT 1"
  ).bind(ped.cliente_id).first<{ id: string; nome: string | null; fantasia: string | null; cnpj: string | null; uf: string | null; loja_regiao: string | null; codigo_erp: string; rep_codigo: string; loja_status: string }>();
  if (!cli) return c.json({ erro: "cliente_nao_encontrado" }, 404);
  const regiao = regiaoDoCliente(cli.loja_regiao, cli.uf);
  const { results: itensRaw } = await c.env.DB.prepare(
    "SELECT produto, ref, cor_grade, tamanho, qtd, valor_unit FROM pedido_itens WHERE pedido_id=? ORDER BY rowid"
  ).bind(id).all<{ produto: string | null; ref: string | null; cor_grade: string | null; tamanho: string | null; qtd: number | null; valor_unit: number | null }>();
  const itens = (itensRaw || []).map((r) => ({
    cod: String(r.ref || ""), nome: String(r.produto || ""), grupo: "", medida: String(r.tamanho || ""),
    corNome: String(r.cor_grade || ""), preco: Number(r.valor_unit) || 0, qtd: Number(r.qtd) || 0, regiao,
  }));
  return c.json({
    ok: true,
    cliente: { id: cli.id, nome: cli.nome, fantasia: cli.fantasia, cnpj: cli.cnpj, regiao, liberado: clienteLiberado(cli.codigo_erp, cli.loja_status, cli.rep_codigo) },
    cod_prazo: ped.prazo, forma_desc: ped.forma, observacao: ped.obs, itens,
  });
});

// Detalhe (SÓ LEITURA) de um pedido do rep pra "Meus pedidos": cabeçalho + itens com
// valor unitário e total. Funciona pra qualquer pedido do rep (rascunho/enviado/etc.).
loja.get("/rep-pedido-detalhe", async (c) => {
  const id = String(c.req.query("id") || "").trim();
  const repId = String(c.req.query("rep") || "").trim();
  if (!id || !repId) return c.json({ erro: "faltam_dados" }, 400);
  const rep = await c.env.DB.prepare("SELECT nome FROM representantes WHERE id=? LIMIT 1").bind(repId).first<{ nome: string }>();
  if (!rep) return c.json({ erro: "rep_invalido" }, 403);
  const ped = await c.env.DB.prepare(
    `SELECT id, erp_numero, cliente_nome, valor_total, created_at, data_pedido,
            COALESCE(loja_forma_desc,'') AS forma, COALESCE(erp_sync_status,'') AS sync,
            COALESCE(erp_liberado,0) AS liberado, COALESCE(aprovado_erp_em,'') AS aprovado
       FROM pedidos WHERE id=? AND canal='loja_b2b' AND TRIM(LOWER(COALESCE(vendedor,'')))=TRIM(LOWER(?)) LIMIT 1`
  ).bind(id, rep.nome).first<{ id: string; erp_numero: number | null; cliente_nome: string | null; valor_total: number | null; created_at: string | null; data_pedido: string | null; forma: string; sync: string; liberado: number; aprovado: string }>();
  if (!ped) return c.json({ erro: "nao_encontrado" }, 404);
  const foiAprovado = !!String(ped.aprovado || "").trim();
  let status: string, label: string;
  if (ped.sync === "cancelado") { status = "cancelado"; label = "Cancelado"; }
  else if (ped.sync === "rascunho") { status = "espera"; label = "Em espera"; }
  else if (ped.sync === "enviado") {
    if (foiAprovado) { status = "aprovado"; label = ped.erp_numero ? ("Confirmado · nº " + ped.erp_numero) : "Confirmado"; }
    else { status = "syntech"; label = ped.erp_numero ? ("Aguardando aprovação · nº " + ped.erp_numero) : "Aguardando aprovação"; }
  }
  else if (ped.sync === "erro") { status = "erro"; label = "Com erro — a Big resolve"; }
  else if (Number(ped.liberado) === 1) { status = "aprovado"; label = "Aprovado · indo pro Syntech"; }
  else { status = "aguardando"; label = "Enviado · aguardando a Big"; }
  const { results: itensRaw } = await c.env.DB.prepare(
    "SELECT produto, ref, cor_grade, tamanho, qtd, valor_unit FROM pedido_itens WHERE pedido_id=? ORDER BY rowid"
  ).bind(id).all<{ produto: string | null; ref: string | null; cor_grade: string | null; tamanho: string | null; qtd: number | null; valor_unit: number | null }>();
  const itens = (itensRaw || []).map((r) => {
    const q = Number(r.qtd) || 0, vu = Number(r.valor_unit) || 0;
    const cor = String(r.cor_grade || "").trim(), tamanho = String(r.tamanho || "").trim();
    return { produto: String(r.produto || ""), ref: String(r.ref || ""), cor, tamanho, descricao: [cor, tamanho].filter(Boolean).join(" · "), qtd: q, valor_unit: vu, valor_total: Math.round(q * vu * 100) / 100 };
  });
  const pecas = itens.reduce((s, i) => s + i.qtd, 0);
  const total = Number(ped.valor_total) || itens.reduce((s, i) => s + i.valor_total, 0);
  return c.json({
    ok: true, status, label, cliente: ped.cliente_nome || "",
    numero: ped.erp_numero ? String(ped.erp_numero) : String(ped.id).slice(0, 8).toUpperCase(),
    data: ped.created_at || ped.data_pedido || "", forma: ped.forma,
    pecas, total, editavel: ped.sync === "rascunho", aprovado: foiAprovado, itens,
  });
});

// Consulta CNPJ na Receita (BrasilAPI) pra preencher o cadastro. ATENÇÃO: o e-mail pode
// estar desatualizado — devolvemos, mas o rep confere/atualiza antes de salvar.
loja.get("/consulta-cnpj", async (c) => {
  const cnpj = soDigitos(c.req.query("cnpj"));
  if (cnpj.length !== 14) return c.json({ ok: false, msg: "CNPJ precisa ter 14 dígitos." }, 400);
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return c.json({ ok: false, msg: "Não encontrei esse CNPJ na Receita." }, 404);
    const j = await r.json() as Record<string, unknown>;
    return c.json({
      ok: true, dados: {
        razao_social: String(j.razao_social ?? "").trim(),
        fantasia: String(j.nome_fantasia ?? "").trim(),
        endereco: String(j.logradouro ?? "").trim(),
        numero: String(j.numero ?? "").trim(),
        bairro: String(j.bairro ?? "").trim(),
        cep: String(j.cep ?? "").replace(/\D/g, ""),
        cidade: String(j.municipio ?? "").trim(),
        uf: String(j.uf ?? "").trim().toUpperCase().slice(0, 2),
        telefone: String(j.ddd_telefone_1 ?? "").replace(/\D/g, ""),
        email: String(j.email ?? "").trim().toLowerCase(),
        situacao: String(j.descricao_situacao_cadastral ?? "").trim(),
      },
    });
  } catch { return c.json({ ok: false, msg: "Não consegui consultar a Receita agora. Preencha à mão." }, 502); }
});

loja.post("/pedido", async (c) => {
  let body: { cnpj?: string; itens?: ItemLoja[]; idem?: string; vendedor?: string; acao?: string; cod_prazo?: string; forma_desc?: string; pedido_id?: string; observacao?: string } = {};
  try { body = await c.req.json(); } catch { return c.json({ erro: "json_invalido", msg: "Não consegui ler o pedido." }, 400); }

  const cnpjDig = soDigitos(body.cnpj);
  const vendedor = String(body.vendedor || "").trim().slice(0, 80) || null; // nome do representante (quando o rep monta)
  const ehRep = !!vendedor;
  // acao: 'espera' = rascunho (não vai pro Syntech) · 'enviar' = manda (rep: aguarda aprovação da Big)
  const acao = body.acao === "espera" ? "espera" : "enviar";
  const codPrazo = String(body.cod_prazo || "").trim().slice(0, 20) || null;
  const formaDesc = String(body.forma_desc || "").trim().slice(0, 120) || null;
  const observacao = String(body.observacao || "").trim().slice(0, 400) || null;
  const pedidoEditar = String(body.pedido_id || "").trim().slice(0, 40) || null; // atualizar um rascunho existente
  const itensIn = Array.isArray(body.itens) ? body.itens : [];
  if (cnpjDig.length < 11) return c.json({ erro: "cnpj_invalido", msg: "Informe um CNPJ (ou CPF) válido para enviar o pedido." }, 400);
  if (!itensIn.length) return c.json({ erro: "carrinho_vazio", msg: "Seu carrinho está vazio." }, 400);
  // Rep enviando o pedido: forma de pagamento (prazo) é obrigatória.
  if (ehRep && acao === "enviar" && !codPrazo) return c.json({ erro: "sem_forma_pagamento", msg: "Escolha a forma de pagamento antes de enviar o pedido." }, 400);

  // 1) cliente pelo CNPJ (comparando só os dígitos), não bloqueado E liberado (aprovado)
  const cli = await c.env.DB.prepare(
    "SELECT id, nome, cnpj, COALESCE(bloqueado,0) AS bloqueado, COALESCE(codigo_erp,'') AS codigo_erp, COALESCE(rep_codigo,'') AS rep_codigo, COALESCE(loja_status,'') AS loja_status FROM clientes " +
    "WHERE REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cnpj,''),'.',''),'/',''),'-',''),' ','') = ? LIMIT 1"
  ).bind(cnpjDig).first<{ id: string; nome: string | null; cnpj: string | null; bloqueado: number; codigo_erp: string; rep_codigo: string; loja_status: string }>();
  if (!cli) return c.json({ erro: "cliente_nao_encontrado", msg: "Não encontramos esse CNPJ no nosso cadastro. Fale com a Big Tricot para liberar seu acesso." }, 404);
  if (Number(cli.bloqueado) === 1) return c.json({ erro: "cliente_bloqueado", msg: "Seu cadastro está bloqueado no momento. Fale com a Big Tricot." }, 403);
  if (!clienteLiberado(cli.codigo_erp, cli.loja_status, cli.rep_codigo)) return c.json({ erro: "cadastro_em_analise", msg: "Seu cadastro ainda está em análise. Assim que a Big Tricot aprovar, você poderá finalizar pedidos. 💛" }, 403);

  // Rep editando um rascunho existente ("em espera"): confere que o pedido é dele e ainda é rascunho.
  if (pedidoEditar) {
    const dr = await c.env.DB.prepare("SELECT id, COALESCE(erp_sync_status,'') AS sync FROM pedidos WHERE id=? AND canal='loja_b2b' AND cliente_id=? LIMIT 1")
      .bind(pedidoEditar, cli.id).first<{ id: string; sync: string }>();
    if (!dr) return c.json({ erro: "pedido_nao_encontrado", msg: "Esse pedido não está mais disponível para edição." }, 404);
    if (dr.sync !== "rascunho") return c.json({ erro: "pedido_travado", msg: "Esse pedido já foi enviado e está travado. Peça liberação à Big Tricot." }, 409);
  }

  // idempotência: se o mesmo checkout já foi gravado, devolve o mesmo pedido.
  // (Pula quando é rep: rep pode salvar várias versões do rascunho / reenviar.)
  const idem = String(body.idem || "").trim().slice(0, 80) || null;
  if (idem && !ehRep && !pedidoEditar) {
    const ex = await c.env.DB.prepare("SELECT id, erp_numero FROM pedidos WHERE canal='loja_b2b' AND idem = ? LIMIT 1")
      .bind(idem).first<{ id: string; erp_numero: number | null }>();
    if (ex) return c.json({ ok: true, duplicado: true, pedido_id: ex.id, erp_numero: ex.erp_numero });
  }

  // 2) resolve as chaves do Syntech (TAMANHO código + COD_COR) por item, via erp_produtos.
  const refs = [...new Set(itensIn.map((i) => String(i.cod || "").trim()).filter(Boolean))];
  const mapProd = new Map<string, { cores: CorErp[]; tamanhos: TamErp[] }>();
  for (const ref of refs) {
    const row = await c.env.DB.prepare("SELECT cores, tamanhos FROM erp_produtos WHERE ref = ?").bind(ref)
      .first<{ cores: string | null; tamanhos: string | null }>();
    if (row) {
      let cores: CorErp[] = [], tamanhos: TamErp[] = [];
      try { const a = JSON.parse(row.cores || "[]"); if (Array.isArray(a)) cores = a; } catch { /* ignora */ }
      try { const a = JSON.parse(row.tamanhos || "[]"); if (Array.isArray(a)) tamanhos = a; } catch { /* ignora */ }
      mapProd.set(ref, { cores, tamanhos });
    }
  }

  type Resolvido = { ref: string; nome: string; grupo: string; medida: string; erp_tamanho: string; corNome: string; cod_cor: number | null; qtd: number; preco: number };
  const resolvidos: Resolvido[] = [];
  const erros: string[] = [];
  for (const it of itensIn) {
    const ref = String(it.cod || "").trim();
    const qtd = Math.max(0, Math.trunc(Number(it.qtd) || 0));
    const preco = Math.round((Number(it.preco) || 0) * 100) / 100;
    if (!ref || qtd <= 0) continue;
    const medida = String(it.medida || "").trim();
    const corNome = String(it.corNome || "").trim();
    const p = mapProd.get(ref);
    let erp_tamanho = medida; let cod_cor: number | null = null;
    if (p) {
      const tam = p.tamanhos.find((t) => norm(t.medida) === norm(medida) || norm(t.tamanho) === norm(medida));
      if (tam && (tam.tamanho || tam.medida)) erp_tamanho = String(tam.tamanho || tam.medida).trim();
      // Kit: o "medida" exibido é a composição (texto longo) e NÃO bate com o código do
      // Syntech. Usa o código real do 1º tamanho do produto (ex.: "UN") — nunca o texto longo
      // (senão a coluna TAMANHO do Syntech estoura: erro -303 string truncation).
      else if (p.tamanhos[0] && (p.tamanhos[0].tamanho || p.tamanhos[0].medida)) {
        erp_tamanho = String(p.tamanhos[0].tamanho || p.tamanhos[0].medida).trim();
      }
      const cor = p.cores.find((cc) => norm(cc.nome) === norm(corNome));
      if (cor && cor.numero != null) cod_cor = Number(cor.numero);
    } else {
      erros.push(`Produto ${ref} não encontrado no catálogo do ERP.`);
    }
    // Segurança final: a coluna TAMANHO do Syntech é curta — nunca envia algo longo.
    if (erp_tamanho.length > 10) erp_tamanho = erp_tamanho.slice(0, 10);
    if (cod_cor == null && p) erros.push(`Cor "${corNome}" do produto ${ref} não encontrada.`);
    resolvidos.push({ ref, nome: String(it.nome || ref), grupo: String(it.grupo || ""), medida, erp_tamanho, corNome, cod_cor, qtd, preco });
  }
  if (!resolvidos.length) return c.json({ erro: "sem_itens_validos", msg: "Não há itens válidos no pedido." }, 400);
  // Se faltou identificar a cor/produto de algum item, NÃO grava (evita pedido errado no Syntech).
  if (erros.length) return c.json({ erro: "mapeamento_incompleto", msg: "Alguns itens não puderam ser identificados automaticamente. Fale com a Big Tricot.", detalhe: [...new Set(erros)] }, 422);

  const total = Math.round(resolvidos.reduce((s, r) => s + r.qtd * r.preco, 0) * 100) / 100;

  // 3) grava o pedido (canal loja_b2b, fora da produção).
  //   - rascunho  (acao='espera'): erp_sync_status='rascunho' → a ponte NUNCA puxa. loja_fase='em_espera'.
  //   - enviado   (acao='enviar'): erp_sync_status='pendente'. loja_fase='enviado' quando é rep.
  //     Pedido de rep sempre fica erp_liberado=0 → espera a Big aprovar (a query da ponte respeita isso).
  const ehEspera = acao === "espera";
  const syncStatus = ehEspera ? "rascunho" : "pendente";
  const lojaFase = ehRep ? (ehEspera ? "em_espera" : "enviado") : null;
  const pedidoId = pedidoEditar || uid();

  // RESERVA DE ESTOQUE (Etapa 1 + trava atômica da Etapa 7) — o carrinho é o próprio pedido.
  // TANTO o rascunho ('espera') QUANTO o envio ('enviar') reservam as peças físicas. A trava é
  // ATÔMICA: cada peça entra por INSERT condicional (SALDO − reservas de OUTROS, reavaliado no
  // momento da escrita dentro da transação do batch) — dois pedidos disputando a última unidade
  // nunca reservam além do saldo. Peça SOB ENCOMENDA passa sem travar. Confere DEPOIS do batch;
  // se faltou, desfaz (libera a reserva e, em pedido novo, apaga o pedido) e recusa (409).
  // INTERRUPTOR "reservas_ativo": desligado (padrão) → NÃO reserva estoque nem abre a janela de 12h.
  // O pedido é salvo igual (itens, prazo, PDF); só a reserva deixa de acontecer. Reservas já criadas
  // por OUTROS pedidos não são tocadas. Ligado → trava atômica da Etapa 7, exatamente como antes.
  const reservarEstoque = await flagLigado(c.env, FLAG_RESERVAS);
  let reservaStmts: D1PreparedStatement[] = [];
  let alvo: Awaited<ReturnType<typeof montarReservaAtomica>>["alvo"] = [];
  if (reservarEstoque) {
    const rr = await montarReservaAtomica(c.env, pedidoId, resolvidos.map((r) => ({ ref: r.ref, cor: r.corNome, tam: r.erp_tamanho, qtd: r.qtd })));
    reservaStmts = rr.stmts; alvo = rr.alvo;
  }
  // JANELA DE 12h = FLUXO DO CARRINHO: vale para QUALQUER carrinho com itens (Edição Limitada, kit
  // OU produto normal — Polisoft/Soft etc.). Só ED/KT travam estoque (as peças em 'alvo'), mas TODO
  // carrinho ganha janela + contador e ESVAZIA ao vencer (expirarCarrinhosVencidos já apaga o
  // rascunho inteiro). Continua sob o interruptor reservas_ativo: desligado (padrão produção) → sem
  // janela nenhuma. 'alvo' permanece restrito às peças que controlam estoque.
  const abrirJanela = reservarEstoque && resolvidos.length > 0;
  const reservaResp = ehRep ? "rep" : "cliente";
  // PROTEÇÃO NOTURNA (Etapa 1): o vencimento base é agora+12h; se cair de madrugada (20h–8h SP), o
  // vencimento EFETIVO vai para as 10h da manhã seguinte. Calculado no SERVIDOR (fuso SP) e gravado
  // como texto UTC. A janela conta enquanto o rascunho estiver ativo e NÃO reinicia ao editar o
  // carrinho (COALESCE preserva início/efetivo/original/flag). Sem itens ou interruptor off → NULL.
  // Validade do carrinho/reserva em MINUTOS (padrão 720 = 12h). Ajustável pela tela de Configurações
  // (chave 'reserva_janela_minutos') para testar rápido e depois voltar ao normal, sem deploy.
  const jmRow = await c.env.DB.prepare("SELECT valor FROM config WHERE chave='reserva_janela_minutos' LIMIT 1").first<{ valor: string | null }>().catch(() => null);
  const janelaMin = (() => { const n = Math.trunc(Number(jmRow?.valor)); return Number.isFinite(n) && n > 0 ? n : 720; })();
  const jw = calcularJanela12h(Date.now(), janelaMin);
  const janelaUpd = abrirJanela
    ? "reserva_responsavel=COALESCE(reserva_responsavel, ?), reserva_iniciada_em=COALESCE(reserva_iniciada_em, datetime('now')), reserva_expira_em=COALESCE(reserva_expira_em, ?), reserva_expira_original=COALESCE(reserva_expira_original, ?), reserva_noturna=CASE WHEN reserva_expira_em IS NULL THEN ? ELSE reserva_noturna END"
    : "reserva_responsavel=NULL, reserva_iniciada_em=NULL, reserva_expira_em=NULL, reserva_expira_original=NULL, reserva_noturna=0";

  const stmts: D1PreparedStatement[] = [];
  if (pedidoEditar) {
    // Atualiza o rascunho existente: troca os dados e substitui os itens.
    const sqlUpd = `UPDATE pedidos SET cliente_nome=?, vendedor=?, valor_total=?, erp_sync_status=?, loja_fase=?,
         loja_cod_prazo=?, loja_forma_desc=?, observacao=?, data_pedido=datetime('now'), ${janelaUpd} WHERE id=? AND canal='loja_b2b'`;
    const bindsUpd = abrirJanela
      ? [cli.nome || "SEM CLIENTE", vendedor, total, syncStatus, lojaFase, codPrazo, formaDesc, observacao, reservaResp, jw.expira, jw.original, jw.noturna, pedidoEditar]
      : [cli.nome || "SEM CLIENTE", vendedor, total, syncStatus, lojaFase, codPrazo, formaDesc, observacao, pedidoEditar];
    stmts.push(c.env.DB.prepare(sqlUpd).bind(...bindsUpd));
    stmts.push(c.env.DB.prepare("DELETE FROM pedido_itens WHERE pedido_id=?").bind(pedidoEditar));
  } else {
    const janelaVals = abrirJanela ? "datetime('now'), ?, ?, ?, ?" : "NULL, NULL, NULL, 0, NULL";
    const sqlIns = `INSERT INTO pedidos (id, cliente_nome, cliente_id, cliente_cnpj, vendedor, tipo, status, canal, valor_total,
         erp_sync_status, erp_liberado, loja_fase, loja_cod_prazo, loja_forma_desc, observacao, idem,
         reserva_iniciada_em, reserva_expira_em, reserva_expira_original, reserva_noturna, reserva_responsavel, data_pedido, created_at)
       VALUES (?, ?, ?, ?, ?, 'pedido', 'aguardando_aprovacao', 'loja_b2b', ?, ?, 0, ?, ?, ?, ?, ?, ${janelaVals}, datetime('now'), datetime('now'))`;
    const bindsIns = [pedidoId, cli.nome || "SEM CLIENTE", cli.id, cnpjDig, vendedor, total, syncStatus, lojaFase, codPrazo, formaDesc, observacao, idem];
    if (abrirJanela) bindsIns.push(jw.expira, jw.original, jw.noturna, reservaResp);
    stmts.push(c.env.DB.prepare(sqlIns).bind(...bindsIns));
  }
  for (const r of resolvidos) {
    stmts.push(c.env.DB.prepare(
      `INSERT INTO pedido_itens (id, pedido_id, produto, ref, cor_grade, cod_cor, tamanho, erp_tamanho, qtd, valor_unit, parte)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unico')`
    ).bind(uid(), pedidoId, r.nome, r.ref, r.corNome, r.cod_cor, r.medida, r.erp_tamanho, r.qtd, r.preco));
  }
  for (const s of reservaStmts) stmts.push(s); // reserva as peças ATOMICAMENTE junto com o pedido
  await c.env.DB.batch(stmts);

  // Confere o que REALMENTE ficou reservado (a trava condicional pode ter barrado peças sem saldo).
  const faltas = alvo.length ? await faltasDaReserva(c.env, pedidoId, alvo) : [];
  if (faltas.length) {
    // desfaz: pedido NOVO → apaga tudo; EDIÇÃO → solta a reserva e zera a janela (o carrinho é
    // revertido no navegador e re-sincronizado). Nunca deixa reserva acima do saldo.
    if (pedidoEditar) {
      await c.env.DB.batch([
        c.env.DB.prepare("DELETE FROM erp_reserva WHERE pedido_id=?").bind(pedidoId),
        c.env.DB.prepare("UPDATE pedidos SET reserva_iniciada_em=NULL, reserva_expira_em=NULL, reserva_responsavel=NULL WHERE id=? AND canal='loja_b2b'").bind(pedidoId),
      ]);
    } else {
      await c.env.DB.batch([
        c.env.DB.prepare("DELETE FROM erp_reserva WHERE pedido_id=?").bind(pedidoId),
        c.env.DB.prepare("DELETE FROM pedido_itens WHERE pedido_id=?").bind(pedidoId),
        c.env.DB.prepare("DELETE FROM pedidos WHERE id=? AND canal='loja_b2b'").bind(pedidoId),
      ]);
    }
    return c.json({
      erro: "sem_estoque",
      msg: "Alguns itens não têm estoque suficiente no momento. Ajuste as quantidades e tente novamente.",
      faltas,
    }, 409);
  }

  const msg = ehEspera
    ? "Pedido salvo em espera. Você pode gerar o PDF e enviar ao cliente quando quiser."
    : ehRep
      ? "Pedido enviado! Aguardando a Big Tricot aprovar para entrar no Syntech."
      : "Pedido recebido! Ele será enviado para a Big Tricot (Syntech) e confirmado em breve.";
  return c.json({
    ok: true,
    pedido_id: pedidoId,
    cliente: cli.nome,
    itens: resolvidos.length,
    pecas: resolvidos.reduce((s, r) => s + r.qtd, 0),
    total,
    fase: lojaFase,
    msg,
  }, 201);
});

// DISPONIBILIDADE AO VIVO (Etapa 1) — devolve o MESMO mapa de estoque que o catálogo usa
// (saldo do Syntech − TODAS as reservas ativas, inclusive os carrinhos em rascunho). A loja
// chama isto de tempos em tempos (e ao focar a aba) pra refletir na hora as reservas de
// outros clientes: a última unidade some das opções assim que alguém a coloca no carrinho.
// Só LÊ — não reserva nada. Nunca derruba a loja (em erro, devolve vazio).
loja.get("/disponibilidade", async (c) => {
  try {
    await expirarCarrinhosVencidos(c.env).catch(() => 0); // solta carrinhos vencidos antes de medir
    const cat = await gerarCatalogoSite(c.env);
    return c.json({ ok: true, atualizadoMs: cat.estoque.atualizadoMs, itens: cat.estoque.itens });
  } catch {
    return c.json({ ok: false, itens: {} });
  }
});

// STATUS DA RESERVA DO CARRINHO (Etapa 2) — fonte de verdade do PRAZO. Varre os vencidos e
// devolve, pro dono do carrinho, se a janela está ativa, QUANDO expira e QUE HORAS são no
// servidor (agora) — a loja corrige o relógio do navegador por esse 'agora'. Pedido já enviado
// (sync != rascunho) devolve enviado=true: contagem encerrada, peças seguem reservadas.
loja.get("/carrinho-status", async (c) => {
  await expirarCarrinhosVencidos(c.env).catch(() => 0);
  const agora = Date.now();
  const pid = String(c.req.query("pedido_id") || "").trim().slice(0, 40);
  if (!pid) return c.json({ ok: true, existe: false, ativo: false, agora });
  const row = await c.env.DB.prepare(
    "SELECT p.id, COALESCE(p.erp_sync_status,'') AS sync, p.reserva_expira_em AS exp, p.reserva_iniciada_em AS ini, COALESCE(p.reserva_prorrogacoes,0) AS prorr, COALESCE(p.vendedor,'') AS vend, COALESCE(cl.cnpj,'') AS cnpj " +
    "FROM pedidos p LEFT JOIN clientes cl ON cl.id=p.cliente_id WHERE p.id=? AND p.canal='loja_b2b' LIMIT 1"
  ).bind(pid).first<{ id: string; sync: string; exp: string | null; ini: string | null; prorr: number; vend: string; cnpj: string }>();
  if (!row) return c.json({ ok: true, existe: false, ativo: false, agora }); // foi esvaziado (expirou/limpou)
  const cnpjDig = soDigitos(c.req.query("cnpj"));
  const vendedor = String(c.req.query("vendedor") || "").trim();
  const donoOk = vendedor
    ? row.vend.trim().toLowerCase() === vendedor.toLowerCase()
    : (cnpjDig.length >= 11 && soDigitos(row.cnpj) === cnpjDig);
  if (!donoOk) return c.json({ ok: true, existe: true, ativo: false, agora }); // não revela a janela a terceiros
  if (row.sync !== "rascunho") return c.json({ ok: true, existe: true, enviado: true, ativo: false, agora });
  const exp = row.exp ? new Date(String(row.exp).replace(" ", "T") + "Z").getTime() : null;
  const restante = exp != null ? Math.max(0, exp - agora) : null;
  const ehRep = !!row.vend;
  // A prorrogação é solicitada EXCLUSIVAMENTE pelo WhatsApp — a tela NÃO oferece opções nem botões.
  // O carrinho mostra apenas o contador (restante_ms/expira_em) calculado pelo servidor.
  return c.json({ ok: true, existe: true, ativo: exp != null, expira_em: exp, restante_ms: restante, agora, eh_rep: ehRep, prorrogacoes: Number(row.prorr) || 0 });
});

// PRORROGAÇÃO PELA TELA — REMOVIDA. A prorrogação passa a ser solicitada EXCLUSIVAMENTE pelo
// WhatsApp (uma única vez, +6h), tratada em reserva-avisos.ts (tratarRespostaProrrogacao).

// LIMPAR CARRINHO (Etapa 1) — quando o carrinho fica VAZIO, solta a reserva na hora: apaga a
// reserva + o rascunho (carrinho) daquele dono. Só mexe no que é 'rascunho' da loja e confere
// a posse (cliente pelo CNPJ ou representante pelo nome). Nunca toca em pedido já enviado.
loja.post("/carrinho-limpar", async (c) => {
  let b: { cnpj?: string; pedido_id?: string; vendedor?: string } = {};
  try { b = await c.req.json(); } catch { return c.json({ ok: true }); }
  const pid = String(b.pedido_id || "").trim().slice(0, 40);
  if (!pid) return c.json({ ok: true }); // nada pra limpar
  const cnpjDig = soDigitos(b.cnpj);
  const vendedor = String(b.vendedor || "").trim();
  const ped = await c.env.DB.prepare(
    "SELECT p.id, COALESCE(p.erp_sync_status,'') AS sync, COALESCE(p.vendedor,'') AS vend, COALESCE(cl.cnpj,'') AS cnpj " +
    "FROM pedidos p LEFT JOIN clientes cl ON cl.id=p.cliente_id WHERE p.id=? AND p.canal='loja_b2b' LIMIT 1"
  ).bind(pid).first<{ id: string; sync: string; vend: string; cnpj: string }>();
  if (!ped) return c.json({ ok: true });               // pedido não existe mais
  if (ped.sync !== "rascunho") return c.json({ ok: true }); // já foi enviado → não mexe
  const donoOk = vendedor
    ? ped.vend.trim().toLowerCase() === vendedor.toLowerCase()
    : (cnpjDig.length >= 11 && soDigitos(ped.cnpj) === cnpjDig);
  if (!donoOk) return c.json({ erro: "nao_dono" }, 403);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM erp_reserva WHERE pedido_id=?").bind(pid),
    c.env.DB.prepare("DELETE FROM pedido_itens WHERE pedido_id=?").bind(pid),
    c.env.DB.prepare("DELETE FROM pedidos WHERE id=? AND canal='loja_b2b' AND COALESCE(erp_sync_status,'')='rascunho'").bind(pid),
  ]);
  return c.json({ ok: true });
});

// Formas de pagamento (prazos do Syntech) — o rep escolhe uma antes de enviar o pedido.
loja.get("/prazos", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT codigo, descricao FROM erp_prazos ORDER BY CAST(codigo AS INTEGER), codigo"
  ).all<{ codigo: string; descricao: string }>();
  return c.json(results || []);
});

// PDF do pedido (pro rep enviar ao cliente / cliente baixar). Escopado por CNPJ (dígitos).
loja.get("/pedido-pdf/:id", async (c) => {
  const id = c.req.param("id");
  const cnpjDig = soDigitos(c.req.query("cnpj"));
  const ped = await c.env.DB.prepare(
    `SELECT p.id, p.cliente_nome, p.cliente_cnpj, p.vendedor, p.valor_total, p.created_at,
            COALESCE(p.loja_forma_desc,'') AS forma, COALESCE(p.observacao,'') AS obs,
            COALESCE(p.loja_fase,'') AS fase, COALESCE(p.erp_sync_status,'') AS sync,
            COALESCE(p.erp_liberado,0) AS liberado, p.erp_numero, COALESCE(p.aprovado_erp_em,'') AS aprovado
       FROM pedidos p WHERE p.id=? AND p.canal='loja_b2b'`
  ).bind(id).first<{ id: string; cliente_nome: string | null; cliente_cnpj: string | null; vendedor: string | null; valor_total: number | null; created_at: string | null; forma: string; obs: string; fase: string; sync: string; liberado: number; erp_numero: number | null; aprovado: string }>();
  if (!ped) return c.json({ erro: "nao_encontrado" }, 404);
  // segurança leve: se veio CNPJ, tem que bater com o do pedido.
  if (cnpjDig && soDigitos(ped.cliente_cnpj) !== cnpjDig) return c.json({ erro: "nao_autorizado" }, 403);
  const { results: itensRaw } = await c.env.DB.prepare(
    "SELECT produto, cor_grade, tamanho, qtd, valor_unit FROM pedido_itens WHERE pedido_id=? ORDER BY rowid"
  ).bind(id).all<{ produto: string | null; cor_grade: string | null; tamanho: string | null; qtd: number | null; valor_unit: number | null }>();
  const itens: PedidoLojaItem[] = (itensRaw || []).map((r) => ({
    produto: String(r.produto || ""), cor: String(r.cor_grade || ""), tamanho: String(r.tamanho || ""),
    qtd: Number(r.qtd) || 0, valor: Number(r.valor_unit) || 0,
  }));
  const emissao = (() => { const m = String(ped.created_at || "").match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; })();
  const cnpjFmt = (() => { const d2 = soDigitos(ped.cliente_cnpj); return d2.length === 14 ? d2.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : (ped.cliente_cnpj || ""); })();
  // Fotos reais das cores do pedido + WhatsApp da Big pro rodapé + situação do pedido.
  const cores = await coresLojaPdf(c.env, (itensRaw || []).map((r) => String(r.cor_grade || "")));
  let whatsapp = "";
  try {
    const w = await c.env.DB.prepare("SELECT valor FROM config WHERE chave IN ('loja_whatsapp','numero_whatsapp') ORDER BY CASE chave WHEN 'loja_whatsapp' THEN 0 ELSE 1 END LIMIT 1").first<{ valor: string | null }>();
    whatsapp = String(w?.valor || "").replace(/\D/g, "");
  } catch { whatsapp = ""; }
  // "enviado" no Syntech = recebido, AGUARDANDO a Big aprovar. Só vira "Confirmado" quando o pedido
  // aprovado RETORNA da integração (aprovado_erp_em preenchido). Antes mostrava "Confirmado" cedo demais.
  const aprovadoDeVerdade = !!String(ped.aprovado || "").trim();
  const nSuf = ped.erp_numero ? " · nº " + ped.erp_numero : "";
  const statusLabel =
    ped.sync === "cancelado" ? "Cancelado"
    : ped.sync === "rascunho" ? "Em espera"
      : ped.sync === "enviado" ? ((aprovadoDeVerdade ? "Confirmado" : "Aguardando aprovação") + nSuf)
        : ped.sync === "erro" ? "Em processamento"
          : Number(ped.liberado) === 1 ? "Aprovado pela Big Tricot"
            : ped.fase === "enviado" ? "Aguardando confirmacao"
              : "Pedido recebido";
  // Logotipo (versão branca) pro cabeçalho do PDF — servido como asset estático.
  let logoBytes: Uint8Array | undefined;
  try {
    const u = new URL(c.req.url);
    const resp = await c.env.ASSETS.fetch(new Request(`${u.protocol}//${u.host}/logo-bt-mark.png`));
    if (resp.ok) logoBytes = new Uint8Array(await resp.arrayBuffer());
  } catch { logoBytes = undefined; }
  const bytes = await gerarPdfPedidoLoja({
    numero: String(ped.id).slice(0, 8).toUpperCase(),
    cliente: ped.cliente_nome || "Cliente",
    cnpj: cnpjFmt,
    representante: ped.vendedor || "",
    formaPagamento: ped.forma || "",
    emissao,
    observacao: ped.obs || "",
    itens,
    total: Number(ped.valor_total) || itens.reduce((s, i) => s + i.qtd * i.valor, 0),
    whatsapp,
    statusLabel,
  }, cores, logoBytes);
  const nomeArq = "pedido-" + String(ped.id).slice(0, 8) + ".pdf";
  // dl=1 → força o DOWNLOAD direto (sem abrir o visualizador/impressora); senão abre inline.
  const baixar = !!c.req.query("dl");
  return new Response(bytes, { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `${baixar ? "attachment" : "inline"}; filename="${nomeArq}"`,
    "Cache-Control": "no-store",
  } });
});

// CADASTRO DE LOJA NOVA (Fase S): o CNPJ não existe → o visitante preenche e a gente
// grava como 'pendente'. O gestor aprova depois (define região + prazo) e a ponte cria
// no Syntech. Aqui NÃO cria no ERP — só guarda pendente.
loja.post("/cadastro", async (c) => {
  let b: Record<string, string> = {};
  try { b = await c.req.json(); } catch { return c.json({ erro: "json_invalido" }, 400); }
  const s = (k: string) => String(b[k] ?? "").trim();
  const cnpjDig = soDigitos(b.cnpj);
  const nome = s("nome"), cidade = s("cidade"), uf = s("uf").toUpperCase().slice(0, 2);
  const senha = String(b.senha || "");
  if (cnpjDig.length < 11) return c.json({ erro: "cnpj_invalido", msg: "Informe um CNPJ (ou CPF) válido." }, 400);
  if (!nome || !cidade || !uf) return c.json({ erro: "faltam_dados", msg: "Preencha ao menos a razão social, cidade e UF." }, 400);
  if (senha.length < 4) return c.json({ erro: "senha_curta", msg: "Crie uma senha com pelo menos 4 caracteres." }, 400);

  const ex = await c.env.DB.prepare(
    "SELECT id, codigo_erp, COALESCE(loja_status,'') AS loja_status FROM clientes " +
    "WHERE REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cnpj,''),'.',''),'/',''),'-',''),' ','') = ? LIMIT 1"
  ).bind(cnpjDig).first<{ id: string; codigo_erp: string | null; loja_status: string }>();
  if (ex && (ex.codigo_erp || "").trim()) return c.json({ erro: "ja_cadastrado", msg: "Essa loja já é nossa cliente! Peça o link de acesso à Big Tricot para criar sua senha." }, 409);
  if (ex && ex.loja_status === "pendente") return c.json({ ok: true, pendente: true, msg: "Seu cadastro já está em análise. Assim que for aprovado, você poderá comprar. 💛" });

  const senhaHash = await hashSenha(senha);

  const campos = {
    nome, fantasia: s("fantasia") || nome, cnpj: cnpjDig, inscricao_estadual: s("inscricao"),
    endereco: s("endereco"), numero: s("numero"), complemento: s("complemento"), bairro: s("bairro"),
    cep: soDigitos(b.cep), cidade, uf, email: s("email"), telefone: s("telefone") || s("whatsapp"),
    whatsapp: soDigitos(b.whatsapp) || soDigitos(b.telefone), simples_nacional: s("simples_nacional"),
  };
  if (ex) {
    await c.env.DB.prepare(
      "UPDATE clientes SET nome=?, fantasia=?, inscricao_estadual=?, endereco=?, numero=?, complemento=?, bairro=?, cep=?, cidade=?, uf=?, email=?, telefone=?, whatsapp=?, simples_nacional=?, senha_hash=?, " +
      "origem='loja', loja_status='pendente', loja_cadastro_em=datetime('now') WHERE id=?"
    ).bind(campos.nome, campos.fantasia, campos.inscricao_estadual, campos.endereco, campos.numero, campos.complemento, campos.bairro, campos.cep, campos.cidade, campos.uf, campos.email, campos.telefone, campos.whatsapp, campos.simples_nacional, senhaHash, ex.id).run();
  } else {
    await c.env.DB.prepare(
      "INSERT INTO clientes (id, nome, fantasia, cnpj, inscricao_estadual, endereco, numero, complemento, bairro, cep, cidade, uf, email, telefone, whatsapp, simples_nacional, senha_hash, origem, loja_status, loja_cadastro_em) " +
      "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'loja', 'pendente', datetime('now'))"
    ).bind(uid(), campos.nome, campos.fantasia, campos.cnpj, campos.inscricao_estadual, campos.endereco, campos.numero, campos.complemento, campos.bairro, campos.cep, campos.cidade, campos.uf, campos.email, campos.telefone, campos.whatsapp, campos.simples_nacional, senhaHash).run();
  }
  return c.json({ ok: true, pendente: true, criado: true, msg: "Recebemos seu cadastro! 🎉 Você já pode ver o catálogo; os preços e pedidos liberam assim que a Big Tricot aprovar seu acesso." }, 201);
});

// ÁREA DO CLIENTE — "Meus pedidos": lista os pedidos da loja daquele CNPJ (público,
// escopado pelo CNPJ em dígitos). Mostra situação amigável + itens (como o cliente pediu).
loja.get("/meus-pedidos", async (c) => {
  const cnpj = soDigitos(c.req.query("cnpj"));
  if (cnpj.length < 11) return c.json({ erro: "cnpj_invalido", msg: "CNPJ inválido." }, 400);
  const { results: peds } = await c.env.DB.prepare(
    "SELECT id, erp_numero, valor_total, data_pedido, created_at, reserva_expira_em, COALESCE(cliente_nome,'') AS cliente_nome, COALESCE(erp_sync_status,'pendente') AS sync, COALESCE(aprovado_erp_em,'') AS aprovado " +
    "FROM pedidos WHERE canal='loja_b2b' AND REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cliente_cnpj,''),'.',''),'/',''),'-',''),' ','') = ? " +
    "ORDER BY created_at DESC LIMIT 60"
  ).bind(cnpj).all<{ id: string; erp_numero: number | null; valor_total: number | null; data_pedido: string | null; created_at: string | null; reserva_expira_em: string | null; cliente_nome: string; sync: string; aprovado: string }>();
  if (!peds.length) return c.json({ pedidos: [] });
  // Nome do cliente dono do CNPJ (fantasia > razão social do cadastro) — pro rep identificar.
  const cliCad = await c.env.DB.prepare(
    "SELECT COALESCE(NULLIF(TRIM(fantasia),''), NULLIF(TRIM(nome),'')) AS nome FROM clientes " +
    "WHERE REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cnpj,''),'.',''),'/',''),'-',''),' ','') = ? LIMIT 1"
  ).bind(cnpj).first<{ nome: string | null }>();
  const clienteCad = String(cliCad?.nome || "").trim();
  const ids = peds.map((p) => p.id);
  const ph = ids.map(() => "?").join(",");
  const { results: itens } = await c.env.DB.prepare(
    `SELECT pedido_id, produto, ref, cor_grade, tamanho, qtd, valor_unit FROM pedido_itens WHERE pedido_id IN (${ph}) ORDER BY rowid`
  ).bind(...ids).all<{ pedido_id: string; produto: string | null; ref: string | null; cor_grade: string | null; tamanho: string | null; qtd: number; valor_unit: number | null }>();
  const porPed = new Map<string, { produto: string | null; ref: string | null; cor: string | null; tamanho: string | null; qtd: number; valor_unit: number | null }[]>();
  for (const it of itens) {
    const a = porPed.get(it.pedido_id) || [];
    a.push({ produto: it.produto, ref: it.ref, cor: it.cor_grade, tamanho: it.tamanho, qtd: it.qtd, valor_unit: it.valor_unit });
    porPed.set(it.pedido_id, a);
  }
  // Status REAL do nosso fluxo (não inventa etapas): rascunho→carrinho não finalizado,
  // enviado→confirmado, erro→em processamento, resto→recebido. 'status' é a chave pra cor.
  // "enviado" = está no Syntech AGUARDANDO a Big aprovar — NÃO é "Confirmado" ainda. Só vira
  // "Confirmado" quando o pedido aprovado RETORNA da integração (aprovado_erp_em preenchido).
  const statusKey = (sync: string, aprovado: string) => sync === "cancelado" ? "cancelado" : sync === "rascunho" ? "aberto" : sync === "enviado" ? (String(aprovado || "").trim() ? "producao" : "analise") : sync === "erro" ? "processando" : "recebido";
  // "aberto" = carrinho que o cliente montou e NÃO finalizou (expira sozinho; não é pedido feito).
  const statusLabel = (st: string) => st === "aberto" ? "Carrinho não finalizado" : st === "producao" ? "Confirmado" : st === "analise" ? "Aguardando aprovação" : st === "cancelado" ? "Cancelado" : st === "processando" ? "Em processamento" : "Pedido recebido";
  const pedidos = peds.map((p) => {
    const its = porPed.get(p.id) || [];
    const st = statusKey(p.sync, p.aprovado);
    return {
      id: p.id, numero: p.erp_numero, data: p.created_at || p.data_pedido, total: p.valor_total,
      cliente: clienteCad || String(p.cliente_nome || "").trim(),
      pecas: its.reduce((s, it) => s + (Number(it.qtd) || 0), 0),
      status: st, status_label: statusLabel(st),
      expira_em: st === "aberto" ? (p.reserva_expira_em || null) : null,
      situacao: statusLabel(st) + (p.erp_numero ? " · nº " + p.erp_numero : ""),
      itens: its,
    };
  });
  return c.json({ pedidos });
});

// CLIENTE/REPRESENTANTE cancela o PRÓPRIO pedido — enquanto a Big AINDA NÃO aprovou (produção).
// Confere pelo CNPJ (mesma segurança do /meus-pedidos). Depois de aprovado, não dá por aqui
// (tem que falar com a Big). Solta a reserva de estoque e marca o pedido como 'cancelado'.
loja.post("/meus-pedidos/:id/cancelar", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json<{ cnpj?: string }>().catch(() => ({} as { cnpj?: string }));
  const cnpj = soDigitos(b.cnpj);
  if (cnpj.length < 11) return c.json({ erro: "cnpj_invalido", msg: "CNPJ inválido." }, 400);
  const ped = await c.env.DB.prepare(
    "SELECT COALESCE(erp_sync_status,'') AS sync, COALESCE(aprovado_erp_em,'') AS aprovado, " +
    "REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cliente_cnpj,''),'.',''),'/',''),'-',''),' ','') AS cnpjped " +
    "FROM pedidos WHERE id=? AND canal='loja_b2b' LIMIT 1"
  ).bind(id).first<{ sync: string; aprovado: string; cnpjped: string }>();
  if (!ped) return c.json({ erro: "nao_encontrado" }, 404);
  if (ped.cnpjped !== cnpj) return c.json({ erro: "nao_autorizado" }, 403);
  if (String(ped.aprovado || "").trim()) return c.json({ erro: "ja_aprovado", msg: "Esse pedido já foi aprovado pela Big Tricot e está em produção. Fale com a gente para cancelar." }, 409);
  if (!["enviado", "pendente", "erro", "rascunho"].includes(String(ped.sync))) return c.json({ erro: "nao_cancelavel", msg: "Esse pedido não pode mais ser cancelado por aqui." }, 409);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM erp_reserva WHERE pedido_id=?").bind(id), // devolve o estoque reservado
    c.env.DB.prepare("UPDATE pedidos SET erp_sync_status='cancelado' WHERE id=? AND canal='loja_b2b'").bind(id),
  ]);
  return c.json({ ok: true });
});

// CLIENTE aprova/confirma o PRÓPRIO pedido (foi ele que fez). Marca como "Confirmado" e mantém
// o estoque reservado. Só enquanto está "Aguardando aprovação" (enviado e ainda não aprovado).
loja.post("/meus-pedidos/:id/aprovar", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json<{ cnpj?: string }>().catch(() => ({} as { cnpj?: string }));
  const cnpj = soDigitos(b.cnpj);
  if (cnpj.length < 11) return c.json({ erro: "cnpj_invalido", msg: "CNPJ inválido." }, 400);
  const ped = await c.env.DB.prepare(
    "SELECT COALESCE(erp_sync_status,'') AS sync, COALESCE(aprovado_erp_em,'') AS aprovado, " +
    "REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cliente_cnpj,''),'.',''),'/',''),'-',''),' ','') AS cnpjped " +
    "FROM pedidos WHERE id=? AND canal='loja_b2b' LIMIT 1"
  ).bind(id).first<{ sync: string; aprovado: string; cnpjped: string }>();
  if (!ped) return c.json({ erro: "nao_encontrado" }, 404);
  if (ped.cnpjped !== cnpj) return c.json({ erro: "nao_autorizado" }, 403);
  if (String(ped.aprovado || "").trim()) return c.json({ ok: true, jaAprovado: true });
  if (ped.sync !== "enviado") return c.json({ erro: "nao_aprovavel", msg: "Esse pedido não pode ser aprovado agora." }, 409);
  await c.env.DB.prepare("UPDATE pedidos SET aprovado_erp_em=datetime('now') WHERE id=? AND canal='loja_b2b'").bind(id).run();
  return c.json({ ok: true });
});

// DIAGNÓSTICO do RISCADO da Edição Limitada (HTML, público gated por ?k=). Fica aqui (em
// /api/loja/) porque no domínio do catálogo só esses caminhos chegam no worker — e aqui não
// há sessão do sistema. Mostra, por peça EL: preço CHEIO (sul0), COM desconto (sul), % e se
// risca. Abra: pedidos.bigtricot.com.br/api/loja/el-diag?k=bt-eldiag
loja.get("/el-diag", async (c) => {
  if (String(c.req.query("k") || "").trim() !== "bt-eldiag") {
    return new Response("Diagnóstico EL — abra com a chave: /api/loja/el-diag?k=bt-eldiag", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const cat = await gerarCatalogoSite(c.env);
  const cfgv = ((await c.env.DB.prepare("SELECT valor FROM config WHERE chave='desc_el_pct'").first<{ valor: string | null }>().catch(() => null))?.valor || "0").trim();
  const prods = ((cat.produtos as Array<Record<string, unknown>>) || []).filter((p) => p._edicao_limitada);
  const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m] as string));
  const brl = (n: unknown) => "R$ " + (Number(n) || 0).toFixed(2).replace(".", ",");
  let rows = "";
  for (const p of prods) {
    for (const gr of ((p.grupos as Array<Record<string, unknown>>) || [])) {
      for (const l of ((gr.linhas as Array<Record<string, unknown>>) || [])) {
        const ll = l as Record<string, unknown>;
        const sul0 = ll.sul0, sul = ll.sul;
        const risca = sul0 != null && Number(sul0) > Number(sul);
        rows += `<tr><td>${esc(p.id)}</td><td>${esc(ll.rotulo || gr.titulo || "")}</td><td class=r>${sul0 != null ? brl(sul0) : "—"}</td><td class=r>${brl(sul)}</td><td class=c>${esc(p._desc_pct)}%</td><td class=c>${risca ? "✅ risca" : "— sem risco"}</td></tr>`;
      }
    }
  }
  if (!rows) rows = `<tr><td colspan=6 style="text-align:center;color:#8a8073">Nenhum produto de Edição Limitada com estoque.</td></tr>`;
  const htmlOut = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Diagnóstico EL</title>` +
    `<style>body{font-family:system-ui,-apple-system,sans-serif;padding:18px;color:#24201d}table{border-collapse:collapse;width:100%;max-width:980px}th,td{border:1px solid #e2ddd3;padding:7px 10px;font-size:14px}th{background:#f3efe8;text-align:left}td.r{text-align:right}td.c{text-align:center}h1{font-size:20px}.note{color:#555;margin:10px 0 18px;max-width:980px;line-height:1.55;background:#fff7ed;border:1px solid #f0d9c4;border-radius:10px;padding:12px 14px}</style>` +
    `<h1>Diagnóstico — preços da Edição Limitada</h1>` +
    `<div class=note>Desconto manual configurado na Gestão (<b>desc_el_pct</b>): <b>${esc(cfgv)}%</b>.<br><br>` +
    `Pra aparecer o <b>riscado</b> (de/por), a coluna <b>Preço cheio</b> tem que ser MAIOR que o <b>Preço com desconto</b> → aí a coluna <b>Risca?</b> mostra ✅.<br>` +
    `Se o <b>% desc = 0</b> e os dois preços são IGUAIS: não há desconto configurado. Ponha o preço <b>CHEIO</b> no Syntech e defina o <b>%</b> na Gestão → Configurar catálogo → Loja B2B.</div>` +
    `<table><thead><tr><th>Modelo</th><th>Peça</th><th>Preço cheio</th><th>Com desconto</th><th>% desc</th><th>Risca?</th></tr></thead><tbody>${rows}</tbody></table>`;
  return new Response(htmlOut, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
});

// DIAGNÓSTICO — POR QUE O AVISO DE WHATSAPP NÃO CHEGA
// Mostra, sem enviar nada: flags (zapi/reservas/carrinho), janela de envio, tempos,
// e o estado real dos carrinhos em rascunho da loja (telefone resolvido, mascarado,
// e se cada lembrete ainda consegue disparar antes do carrinho expirar).
// Abra: pedidos.bigtricot.com.br/api/loja/wa-diag?k=bt-wadiag
loja.get("/wa-diag", async (c) => {
  if (String(c.req.query("k") || "").trim() !== "bt-wadiag") {
    return new Response("Diagnóstico WhatsApp — abra com a chave: /api/loja/wa-diag?k=bt-wadiag", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const DB = c.env.DB;
  const cfg = async (chave: string): Promise<string> => ((await DB.prepare("SELECT valor FROM config WHERE chave=? LIMIT 1").bind(chave).first<{ valor: string | null }>().catch(() => null))?.valor || "").trim();
  const num = (s: string, padrao: number) => { const n = Math.trunc(Number(s)); return Number.isFinite(n) ? n : padrao; };
  const digits = (s: unknown) => String(s ?? "").replace(/\D+/g, "");
  const mask = (t: string) => { const d = digits(t); return d ? (d.length <= 4 ? d : d.slice(0, 2) + "·····" + d.slice(-4)) + ` (${d.length} díg.)` : "—"; };
  const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m] as string));
  const fromSql = (s: string | null) => (s ? new Date(String(s).replace(" ", "T") + "Z").getTime() : null);
  const horaSP = () => { try { return Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date()).replace(/\D/g, "")); } catch { return new Date().getUTCHours() - 3; } };
  const fmtSP = (ms: number | null) => { if (ms == null) return "—"; try { return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(ms)).replace(", ", " "); } catch { return "—"; } };

  const zapi = await cfg("zapi_ativo");
  const reservas = await cfg("reservas_ativo");
  const carrinho = await cfg("aviso_carrinho_ativo");
  const hIni = num(await cfg("envio_hora_ini"), 8), hFim = num(await cfg("envio_hora_fim"), 20);
  const minCarr = Math.max(1, num(await cfg("aviso_carrinho_minutos"), 60));
  const hSP = horaSP();
  const naJanela = hIni <= hFim ? (hSP >= hIni && hSP < hFim) : (hSP >= hIni || hSP < hFim);
  const now = Date.now();
  const agoraSP = (() => { try { return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date()); } catch { return `${hSP}h`; } })();
  const agoraUTC = (() => { try { return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }).format(new Date()); } catch { return ""; } })();

  type Row = { id: string; erp_numero: number | null; vendedor: string | null; cliente_id: string | null; cliente_nome: string | null; created_at: string | null; data_pedido: string | null; exp: string | null; a2: string | null; ac: string | null; nut: number };
  const rows = ((await DB.prepare(
    `SELECT id, erp_numero, COALESCE(vendedor,'') AS vendedor, cliente_id, COALESCE(cliente_nome,'') AS cliente_nome,
            created_at, data_pedido, reserva_expira_em AS exp, reserva_aviso2_em AS a2, aviso_carrinho_em AS ac, COALESCE(reserva_noturna,0) AS nut
       FROM pedidos WHERE canal='loja_b2b' AND COALESCE(erp_sync_status,'')='rascunho'
      ORDER BY COALESCE(created_at, data_pedido) DESC LIMIT 12`
  ).all<Row>().catch(() => ({ results: [] as Row[] }))).results) || [];

  let tr = "";
  for (const p of rows) {
    // resolve destino igual ao destinoDoPedido (rep → representantes.whatsapp; senão clientes.whatsapp||telefone)
    let tel = "", quem = "";
    if (p.vendedor) { const r = await DB.prepare("SELECT whatsapp FROM representantes WHERE lower(nome)=lower(?) LIMIT 1").bind(p.vendedor).first<{ whatsapp: string | null }>().catch(() => null); tel = digits(r?.whatsapp); quem = "Rep: " + esc(p.vendedor); }
    else { const r = await DB.prepare("SELECT COALESCE(whatsapp,'') AS w, COALESCE(telefone,'') AS t FROM clientes WHERE id=? LIMIT 1").bind(p.cliente_id).first<{ w: string; t: string }>().catch(() => null); tel = digits(r?.w) || digits(r?.t); quem = "Cliente"; }
    const criadoMs = fromSql(p.created_at || p.data_pedido), expMs = fromSql(p.exp);
    const minExpira = expMs ? Math.round((expMs - now) / 60000) : null;
    const dispAbandono = criadoMs != null ? now >= criadoMs + minCarr * 60000 : false;        // já passou o tempo p/ disparar
    const abandonoAindaDaTempo = (criadoMs != null && expMs != null) ? (criadoMs + minCarr * 60000) < expMs : true; // dispara ANTES de expirar?
    const aviso2Elegivel = expMs != null && now >= expMs - 3600000;                              // ~1h antes de vencer
    // motivos por linha
    const motivos: string[] = [];
    if (!tel) motivos.push("❌ SEM TELEFONE no " + (p.vendedor ? "cadastro do representante" : "cadastro do cliente (nosso sistema)"));
    else if (tel.replace(/^55/, "").length < 10) motivos.push("⚠️ telefone curto (falta DDD/9?)");
    if (p.ac) motivos.push("carrinho: já avisado " + esc(fmtSP(fromSql(p.ac))));
    else if (!carrinho) motivos.push("carrinho: flag desligada");
    else if (!abandonoAindaDaTempo) motivos.push(`carrinho: ⏱ reserva expira antes dos ${minCarr} min → nunca dispara`);
    else if (!dispAbandono) motivos.push(`carrinho: aguardando (${minCarr} min após criar)`);
    else motivos.push("carrinho: ✅ pronto p/ disparar no próximo cron");
    if (p.a2) motivos.push("vencimento: já avisado " + esc(fmtSP(fromSql(p.a2))));
    else if (!reservas) motivos.push("vencimento: flag reservas desligada");
    else if (!aviso2Elegivel) motivos.push("vencimento: ainda falta >1h p/ vencer");
    else motivos.push("vencimento: ✅ elegível (próximo cron, ≤5 min)");
    tr += `<tr><td>${p.erp_numero ? "#" + p.erp_numero : esc(p.id).slice(0, 8)}</td><td>${quem}<br><small>${esc(p.cliente_nome)}</small></td><td>${esc(mask(tel))}</td><td>${esc(fmtSP(criadoMs))}</td><td>${esc(fmtSP(expMs))}${minExpira != null ? `<br><small>${minExpira} min</small>` : ""}</td><td style="font-size:12.5px">${motivos.map(esc).join("<br>")}</td></tr>`;
  }
  if (!rows.length) tr = `<tr><td colspan=6 style="text-align:center;color:#8a8073">Nenhum carrinho em rascunho na loja agora.</td></tr>`;

  const chip = (on: boolean, txt: string) => `<span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:13px;font-weight:700;background:${on ? "#dcfce7" : "#fee2e2"};color:${on ? "#166534" : "#991b1b"}">${on ? "LIGADO" : "DESLIGADO"} · ${txt}</span>`;
  const html = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Diagnóstico WhatsApp</title>` +
    `<style>body{font-family:system-ui,-apple-system,sans-serif;padding:18px;color:#24201d;line-height:1.5}table{border-collapse:collapse;width:100%;max-width:1100px}th,td{border:1px solid #e2ddd3;padding:7px 10px;font-size:13.5px;vertical-align:top}th{background:#f3efe8;text-align:left}h1{font-size:20px}.box{max-width:1100px;background:#fff7ed;border:1px solid #f0d9c4;border-radius:10px;padding:12px 14px;margin:10px 0 16px}.chips>*{margin:3px 6px 3px 0}small{color:#6b6257}</style>` +
    `<h1>Diagnóstico — avisos de WhatsApp</h1>` +
    `<div class=box><div class=chips>${chip(zapi === "1", "WhatsApp (zapi_ativo)")} ${chip(reservas === "1", "Avisos de reserva (reservas_ativo)")} ${chip(carrinho === "1", "Carrinho abandonado (aviso_carrinho_ativo)")}</div>` +
    `<div style="margin-top:10px">⏰ Janela de envio: <b>${hIni}h–${hFim}h</b> · agora em Brasília são <b>${agoraSP}</b> (UTC ${agoraUTC}) → <b>${naJanela ? "✅ DENTRO da janela" : "⛔ FORA da janela (não envia agora)"}</b></div>` +
    `<div>🛒 Carrinho abandonado dispara <b>${minCarr} min</b> após criar (config <code>aviso_carrinho_minutos</code>).</div>` +
    `<div style="margin-top:8px;font-size:13px">Para o aviso SAIR: a flag correspondente tem que estar <b>LIGADA</b>, <b>zapi_ativo=1</b>, estar <b>dentro da janela</b>, haver <b>telefone</b> no cadastro (do cliente no nosso sistema, ou do representante) e o lembrete ainda ter <b>tempo de disparar antes do carrinho expirar</b>.</div></div>` +
    `<table><thead><tr><th>Pedido</th><th>Destino</th><th>Telefone</th><th>Criado</th><th>Expira</th><th>Situação dos lembretes</th></tr></thead><tbody>${tr}</tbody></table>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
});
