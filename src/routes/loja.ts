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

// "Liberado" = pode ver preços e comprar. Cliente que já é nosso (tem código no Syntech)
// ou cadastro da loja já APROVADO pelo gestor. Cadastro novo em análise = não liberado.
function clienteLiberado(codigoErp?: string | null, lojaStatus?: string | null): boolean {
  if (String(codigoErp || "").trim() !== "") return true;
  return String(lojaStatus || "").trim() === "aprovado";
}

// Carteira do representante: os clientes cujo campo "representante" bate com o nome do rep.
async function carteiraDoRep(env: Env, repNome: string) {
  // last_pedido = data do pedido mais recente da loja (canal loja_b2b) daquele CNPJ.
  // Os pedidos guardam o CNPJ só com dígitos; o cadastro guarda formatado — normaliza os dois.
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.nome, c.fantasia, c.cnpj, c.cidade, c.uf, c.loja_regiao, COALESCE(c.codigo_erp,'') AS codigo_erp,
            COALESCE(c.loja_status,'') AS loja_status, COALESCE(c.bloqueado,0) AS bloqueado,
            (SELECT MAX(COALESCE(p.created_at, p.data_pedido)) FROM pedidos p
               WHERE p.canal='loja_b2b'
                 AND REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(p.cliente_cnpj,''),'.',''),'/',''),'-',''),' ','')
                   = REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(c.cnpj,''),'.',''),'/',''),'-',''),' ','')
            ) AS ultimo_pedido
       FROM clientes c WHERE TRIM(LOWER(COALESCE(c.representante,''))) = TRIM(LOWER(?)) ORDER BY c.nome`
  ).bind(repNome).all<{ id: string; nome: string | null; fantasia: string | null; cnpj: string | null; cidade: string | null; uf: string | null; loja_regiao: string | null; codigo_erp: string; loja_status: string; bloqueado: number; ultimo_pedido: string | null }>();
  return results.map((r) => ({
    id: r.id, nome: r.nome, fantasia: r.fantasia, cnpj: r.cnpj, cidade: r.cidade, uf: r.uf,
    regiao: regiaoDoCliente(r.loja_regiao, r.uf),
    liberado: clienteLiberado(r.codigo_erp, r.loja_status),
    status: r.loja_status || (r.codigo_erp ? "aprovado" : ""),
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
async function hashSenha(senha: string): Promise<string> {
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
    "COALESCE(loja_status,'') AS loja_status, COALESCE(codigo_erp,'') AS codigo_erp FROM clientes " +
    "WHERE REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cnpj,''),'.',''),'/',''),'-',''),' ','') = ? LIMIT 1"
  ).bind(cnpjDig).first<{ nome: string | null; uf: string | null; loja_regiao: string | null; bloqueado: number; senha_hash: string | null; loja_status: string; codigo_erp: string }>();

  if (!cli) return c.json({ erro: "cliente_nao_encontrado", msg: "Não encontramos esse CNPJ. Se é sua primeira vez, cadastre sua loja." }, 404);
  if (Number(cli.bloqueado) === 1) return c.json({ erro: "cliente_bloqueado", msg: "Seu cadastro está bloqueado no momento. Fale com a Big Tricot." }, 403);

  // Sem senha criada ainda: precisa abrir o LINK que a Big Tricot enviou pra criar a senha.
  if (!cli.senha_hash) return c.json({ erro: "sem_senha", msg: "Seu acesso ainda não tem senha. Abra o link que a Big Tricot te enviou para criar a sua senha." }, 401);
  if (!senha) return c.json({ erro: "senha_requerida", msg: "Digite sua senha." }, 401);
  if (!(await conferirSenha(senha, cli.senha_hash))) return c.json({ erro: "senha_invalida", msg: "Senha incorreta." }, 401);

  return c.json({
    ok: true, nome: cli.nome || "", regiao: regiaoDoCliente(cli.loja_regiao, cli.uf),
    liberado: clienteLiberado(cli.codigo_erp, cli.loja_status),
    status: cli.loja_status || (cli.codigo_erp ? "aprovado" : ""),
  });
});

// SESSÃO — ao recarregar a loja, confirma rapidinho (sem senha) o estado do cliente já logado:
// nome, região e se está liberado (o gestor pode ter aprovado nesse meio tempo).
loja.get("/sessao", async (c) => {
  const cnpjDig = soDigitos(c.req.query("cnpj"));
  if (cnpjDig.length < 11) return c.json({ ok: false });
  const cli = await c.env.DB.prepare(
    "SELECT nome, uf, loja_regiao, COALESCE(bloqueado,0) AS bloqueado, senha_hash, " +
    "COALESCE(loja_status,'') AS loja_status, COALESCE(codigo_erp,'') AS codigo_erp FROM clientes " +
    "WHERE REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cnpj,''),'.',''),'/',''),'-',''),' ','') = ? LIMIT 1"
  ).bind(cnpjDig).first<{ nome: string | null; uf: string | null; loja_regiao: string | null; bloqueado: number; senha_hash: string | null; loja_status: string; codigo_erp: string }>();
  if (!cli || Number(cli.bloqueado) === 1 || !cli.senha_hash) return c.json({ ok: false });
  return c.json({
    ok: true, nome: cli.nome || "", regiao: regiaoDoCliente(cli.loja_regiao, cli.uf),
    liberado: clienteLiberado(cli.codigo_erp, cli.loja_status),
    status: cli.loja_status || (cli.codigo_erp ? "aprovado" : ""),
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
  let b: { token?: string; cnpj?: string; senha_atual?: string; nova?: string } = {};
  try { b = await c.req.json(); } catch { return c.json({ erro: "json_invalido" }, 400); }
  const nova = String(b.nova || "");
  if (nova.length < 4) return c.json({ erro: "senha_curta", msg: "Crie uma senha com pelo menos 4 caracteres." }, 400);

  let cli: { id: string; nome: string | null; cnpj: string | null; uf: string | null; loja_regiao: string | null; senha_hash: string | null; loja_status: string; codigo_erp: string } | null = null;
  const token = String(b.token || "").trim();
  if (token.length >= 10) {
    cli = await c.env.DB.prepare(
      "SELECT id, nome, cnpj, uf, loja_regiao, senha_hash, COALESCE(loja_status,'') AS loja_status, COALESCE(codigo_erp,'') AS codigo_erp, COALESCE(bloqueado,0) AS bloqueado FROM clientes WHERE acesso_token = ? LIMIT 1"
    ).bind(token).first();
    if (!cli) return c.json({ erro: "token_invalido", msg: "Link inválido. Peça um novo à Big Tricot." }, 404);
  } else {
    const cnpjDig = soDigitos(b.cnpj);
    if (cnpjDig.length < 11) return c.json({ erro: "cnpj_invalido", msg: "CNPJ inválido." }, 400);
    cli = await c.env.DB.prepare(
      "SELECT id, nome, cnpj, uf, loja_regiao, senha_hash, COALESCE(loja_status,'') AS loja_status, COALESCE(codigo_erp,'') AS codigo_erp FROM clientes " +
      "WHERE REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cnpj,''),'.',''),'/',''),'-',''),' ','') = ? LIMIT 1"
    ).bind(cnpjDig).first();
    if (!cli) return c.json({ erro: "cliente_nao_encontrado", msg: "CNPJ não encontrado." }, 404);
    if (cli.senha_hash && !(await conferirSenha(String(b.senha_atual || ""), cli.senha_hash))) return c.json({ erro: "senha_invalida", msg: "Senha atual incorreta." }, 401);
  }

  const hash = await hashSenha(nova);
  // Se veio pelo LINK (token = o gestor confirmou que é cliente nosso), já LIBERA junto.
  const viaToken = token.length >= 10;
  const statusFinal = viaToken && String(cli.loja_status) !== "recusado" ? "aprovado" : (cli.loja_status || (cli.codigo_erp ? "aprovado" : ""));
  if (viaToken && String(cli.loja_status) !== "recusado") {
    await c.env.DB.prepare("UPDATE clientes SET senha_hash=?, loja_status='aprovado' WHERE id=?").bind(hash, cli.id).run();
  } else {
    await c.env.DB.prepare("UPDATE clientes SET senha_hash=? WHERE id=?").bind(hash, cli.id).run();
  }
  return c.json({
    ok: true, nome: cli.nome || "", cnpj: soDigitos(cli.cnpj), regiao: regiaoDoCliente(cli.loja_regiao, cli.uf),
    liberado: clienteLiberado(cli.codigo_erp, statusFinal),
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
  let b: { token?: string; email?: string; senha_atual?: string; nova?: string } = {};
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
    if (rep.senha_hash && !(await conferirSenha(String(b.senha_atual || ""), rep.senha_hash))) return c.json({ erro: "senha_invalida", msg: "Senha atual incorreta." }, 401);
  }
  const hash = await hashSenha(nova);
  await c.env.DB.prepare("UPDATE representantes SET senha_hash=? WHERE id=?").bind(hash, rep.id).run();
  return c.json({ ok: true, rep: { id: rep.id, nome: rep.nome, email: rep.email || "" }, clientes: await carteiraDoRep(c.env, rep.nome) });
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
            COALESCE(p.loja_forma_desc,'') AS forma, p.erp_numero,
            (SELECT COALESCE(SUM(qtd),0) FROM pedido_itens WHERE pedido_id=p.id) AS pecas
       FROM pedidos p
      WHERE p.canal='loja_b2b' AND TRIM(LOWER(COALESCE(p.vendedor,''))) = TRIM(LOWER(?))
      ORDER BY p.created_at DESC LIMIT 100`
  ).bind(rep.nome).all<{ id: string; cliente_nome: string | null; cliente_cnpj: string | null; valor_total: number | null; created_at: string | null; sync: string; liberado: number; forma: string; erp_numero: number | null; pecas: number }>();
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
    "SELECT id, COALESCE(erp_sync_status,'') AS sync, COALESCE(loja_cod_prazo,'') AS prazo FROM pedidos WHERE id=? AND canal='loja_b2b' AND TRIM(LOWER(COALESCE(vendedor,'')))=TRIM(LOWER(?)) LIMIT 1"
  ).bind(pid, rep.nome).first<{ id: string; sync: string; prazo: string }>();
  if (!ped) return c.json({ erro: "nao_encontrado", msg: "Pedido não encontrado." }, 404);
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
    await c.env.DB.prepare(
      "UPDATE pedidos SET erp_sync_status='pendente', loja_fase='enviado', loja_cod_prazo=?, loja_forma_desc=COALESCE(?, loja_forma_desc) WHERE id=? AND canal='loja_b2b'"
    ).bind(prazo, formaDesc, pid).run();
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
    "SELECT id, nome, fantasia, cnpj, uf, loja_regiao, COALESCE(codigo_erp,'') AS codigo_erp, COALESCE(loja_status,'') AS loja_status FROM clientes WHERE id=? LIMIT 1"
  ).bind(ped.cliente_id).first<{ id: string; nome: string | null; fantasia: string | null; cnpj: string | null; uf: string | null; loja_regiao: string | null; codigo_erp: string; loja_status: string }>();
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
    cliente: { id: cli.id, nome: cli.nome, fantasia: cli.fantasia, cnpj: cli.cnpj, regiao, liberado: clienteLiberado(cli.codigo_erp, cli.loja_status) },
    cod_prazo: ped.prazo, forma_desc: ped.forma, observacao: ped.obs, itens,
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
    "SELECT id, nome, cnpj, COALESCE(bloqueado,0) AS bloqueado, COALESCE(codigo_erp,'') AS codigo_erp, COALESCE(loja_status,'') AS loja_status FROM clientes " +
    "WHERE REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cnpj,''),'.',''),'/',''),'-',''),' ','') = ? LIMIT 1"
  ).bind(cnpjDig).first<{ id: string; nome: string | null; cnpj: string | null; bloqueado: number; codigo_erp: string; loja_status: string }>();
  if (!cli) return c.json({ erro: "cliente_nao_encontrado", msg: "Não encontramos esse CNPJ no nosso cadastro. Fale com a Big Tricot para liberar seu acesso." }, 404);
  if (Number(cli.bloqueado) === 1) return c.json({ erro: "cliente_bloqueado", msg: "Seu cadastro está bloqueado no momento. Fale com a Big Tricot." }, 403);
  if (!clienteLiberado(cli.codigo_erp, cli.loja_status)) return c.json({ erro: "cadastro_em_analise", msg: "Seu cadastro ainda está em análise. Assim que a Big Tricot aprovar, você poderá finalizar pedidos. 💛" }, 403);

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
  const stmts: D1PreparedStatement[] = [];
  if (pedidoEditar) {
    // Atualiza o rascunho existente: troca os dados e substitui os itens.
    stmts.push(c.env.DB.prepare(
      `UPDATE pedidos SET cliente_nome=?, vendedor=?, valor_total=?, erp_sync_status=?, loja_fase=?,
         loja_cod_prazo=?, loja_forma_desc=?, observacao=?, data_pedido=datetime('now') WHERE id=? AND canal='loja_b2b'`
    ).bind(cli.nome || "SEM CLIENTE", vendedor, total, syncStatus, lojaFase, codPrazo, formaDesc, observacao, pedidoEditar));
    stmts.push(c.env.DB.prepare("DELETE FROM pedido_itens WHERE pedido_id=?").bind(pedidoEditar));
  } else {
    stmts.push(c.env.DB.prepare(
      `INSERT INTO pedidos (id, cliente_nome, cliente_id, cliente_cnpj, vendedor, tipo, status, canal, valor_total,
         erp_sync_status, erp_liberado, loja_fase, loja_cod_prazo, loja_forma_desc, observacao, idem, data_pedido, created_at)
       VALUES (?, ?, ?, ?, ?, 'pedido', 'aguardando_aprovacao', 'loja_b2b', ?, ?, 0, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(pedidoId, cli.nome || "SEM CLIENTE", cli.id, cnpjDig, vendedor, total, syncStatus, lojaFase, codPrazo, formaDesc, observacao, idem));
  }
  for (const r of resolvidos) {
    stmts.push(c.env.DB.prepare(
      `INSERT INTO pedido_itens (id, pedido_id, produto, ref, cor_grade, cod_cor, tamanho, erp_tamanho, qtd, valor_unit, parte)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unico')`
    ).bind(uid(), pedidoId, r.nome, r.ref, r.corNome, r.cod_cor, r.medida, r.erp_tamanho, r.qtd, r.preco));
  }
  await c.env.DB.batch(stmts);

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
            COALESCE(p.erp_liberado,0) AS liberado, p.erp_numero
       FROM pedidos p WHERE p.id=? AND p.canal='loja_b2b'`
  ).bind(id).first<{ id: string; cliente_nome: string | null; cliente_cnpj: string | null; vendedor: string | null; valor_total: number | null; created_at: string | null; forma: string; obs: string; fase: string; sync: string; liberado: number; erp_numero: number | null }>();
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
  const statusLabel =
    ped.sync === "rascunho" ? "Em espera"
      : ped.sync === "enviado" ? (ped.erp_numero ? "Confirmado · nº " + ped.erp_numero : "Confirmado")
        : ped.sync === "erro" ? "Em processamento"
          : Number(ped.liberado) === 1 ? "Aprovado pela Big Tricot"
            : ped.fase === "enviado" ? "Aguardando confirmacao"
              : "Pedido recebido";
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
  }, cores);
  const nomeArq = "pedido-" + String(ped.id).slice(0, 8) + ".pdf";
  return new Response(bytes, { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${nomeArq}"`,
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
    "SELECT id, erp_numero, valor_total, data_pedido, created_at, COALESCE(erp_sync_status,'pendente') AS sync " +
    "FROM pedidos WHERE canal='loja_b2b' AND REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cliente_cnpj,''),'.',''),'/',''),'-',''),' ','') = ? " +
    "ORDER BY created_at DESC LIMIT 60"
  ).bind(cnpj).all<{ id: string; erp_numero: number | null; valor_total: number | null; data_pedido: string | null; created_at: string | null; sync: string }>();
  if (!peds.length) return c.json({ pedidos: [] });
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
  // Status REAL do nosso fluxo (não inventa etapas): enviado→em produção, erro→em
  // processamento, resto→recebido. 'status' é a chave pra cor; 'status_label' o texto.
  const statusKey = (sync: string) => sync === "enviado" ? "producao" : sync === "erro" ? "processando" : "recebido";
  const statusLabel = (st: string) => st === "producao" ? "Em produção" : st === "processando" ? "Em processamento" : "Pedido recebido";
  const pedidos = peds.map((p) => {
    const its = porPed.get(p.id) || [];
    const st = statusKey(p.sync);
    return {
      id: p.id, numero: p.erp_numero, data: p.created_at || p.data_pedido, total: p.valor_total,
      pecas: its.reduce((s, it) => s + (Number(it.qtd) || 0), 0),
      status: st, status_label: statusLabel(st),
      situacao: statusLabel(st) + (p.erp_numero ? " · nº " + p.erp_numero : ""),
      itens: its,
    };
  });
  return c.json({ pedidos });
});
