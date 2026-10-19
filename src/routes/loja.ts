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

loja.post("/pedido", async (c) => {
  let body: { cnpj?: string; itens?: ItemLoja[]; idem?: string } = {};
  try { body = await c.req.json(); } catch { return c.json({ erro: "json_invalido", msg: "Não consegui ler o pedido." }, 400); }

  const cnpjDig = soDigitos(body.cnpj);
  const itensIn = Array.isArray(body.itens) ? body.itens : [];
  if (cnpjDig.length < 11) return c.json({ erro: "cnpj_invalido", msg: "Informe um CNPJ (ou CPF) válido para enviar o pedido." }, 400);
  if (!itensIn.length) return c.json({ erro: "carrinho_vazio", msg: "Seu carrinho está vazio." }, 400);

  // 1) cliente pelo CNPJ (comparando só os dígitos), não bloqueado E liberado (aprovado)
  const cli = await c.env.DB.prepare(
    "SELECT id, nome, cnpj, COALESCE(bloqueado,0) AS bloqueado, COALESCE(codigo_erp,'') AS codigo_erp, COALESCE(loja_status,'') AS loja_status FROM clientes " +
    "WHERE REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cnpj,''),'.',''),'/',''),'-',''),' ','') = ? LIMIT 1"
  ).bind(cnpjDig).first<{ id: string; nome: string | null; cnpj: string | null; bloqueado: number; codigo_erp: string; loja_status: string }>();
  if (!cli) return c.json({ erro: "cliente_nao_encontrado", msg: "Não encontramos esse CNPJ no nosso cadastro. Fale com a Big Tricot para liberar seu acesso." }, 404);
  if (Number(cli.bloqueado) === 1) return c.json({ erro: "cliente_bloqueado", msg: "Seu cadastro está bloqueado no momento. Fale com a Big Tricot." }, 403);
  if (!clienteLiberado(cli.codigo_erp, cli.loja_status)) return c.json({ erro: "cadastro_em_analise", msg: "Seu cadastro ainda está em análise. Assim que a Big Tricot aprovar, você poderá finalizar pedidos. 💛" }, 403);

  // idempotência: se o mesmo checkout já foi gravado, devolve o mesmo pedido.
  const idem = String(body.idem || "").trim().slice(0, 80) || null;
  if (idem) {
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

  // 3) grava o pedido (canal loja_b2b, fora da produção, pendente de envio ao ERP)
  const pedidoId = uid();
  const stmts: D1PreparedStatement[] = [];
  stmts.push(c.env.DB.prepare(
    `INSERT INTO pedidos (id, cliente_nome, cliente_id, cliente_cnpj, tipo, status, canal, valor_total,
       erp_sync_status, erp_liberado, idem, data_pedido, created_at)
     VALUES (?, ?, ?, ?, 'pedido', 'aguardando_aprovacao', 'loja_b2b', ?, 'pendente', 0, ?, datetime('now'), datetime('now'))`
  ).bind(pedidoId, cli.nome || "SEM CLIENTE", cli.id, cnpjDig, total, idem));
  for (const r of resolvidos) {
    stmts.push(c.env.DB.prepare(
      `INSERT INTO pedido_itens (id, pedido_id, produto, ref, cor_grade, cod_cor, tamanho, erp_tamanho, qtd, valor_unit, parte)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unico')`
    ).bind(uid(), pedidoId, r.nome, r.ref, r.corNome, r.cod_cor, r.medida, r.erp_tamanho, r.qtd, r.preco));
  }
  await c.env.DB.batch(stmts);

  return c.json({
    ok: true,
    pedido_id: pedidoId,
    cliente: cli.nome,
    itens: resolvidos.length,
    pecas: resolvidos.reduce((s, r) => s + r.qtd, 0),
    total,
    msg: "Pedido recebido! Ele será enviado para a Big Tricot (Syntech) e confirmado em breve.",
  }, 201);
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
