// Rotas de SETORES + ACESSO do usuário (setor principal, ver/editar por setor, funções liberadas).
// Reaproveita a tabela `usuarios`/`sessoes` existentes — nenhuma autenticação nova.
import { Hono } from "hono";
import type { Env } from "../index";
import { exigirFuncao, permissoesDoUsuario, derivarPaginas, CHAVES_FUNCAO, SETOR_PAGINAS } from "../permissoes";

export const setores = new Hono<{ Bindings: Env }>();

const slug = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || crypto.randomUUID().slice(0, 8);

// LISTA os setores com contagem e nomes de usuários vinculados (principal OU com acesso de ver).
setores.get("/", async (c) => {
  const { results: sts } = await c.env.DB.prepare(
    "SELECT id, nome, ativo, ordem FROM setores ORDER BY ordem, nome"
  ).all<{ id: string; nome: string; ativo: number; ordem: number }>().catch(() => ({ results: [] as { id: string; nome: string; ativo: number; ordem: number }[] }));

  // Usuários do setor (setor_principal) e usuários COM ACESSO (usuario_setores.ver=1) — separados.
  const [princ, acc, prest] = await Promise.all([
    c.env.DB.prepare(
      "SELECT setor_principal AS setor_id, nome, id AS uid FROM usuarios WHERE setor_principal IS NOT NULL AND setor_principal <> ''"
    ).all<{ setor_id: string; nome: string; uid: string }>().catch(() => ({ results: [] as { setor_id: string; nome: string; uid: string }[] })),
    c.env.DB.prepare(
      `SELECT us.setor_id AS setor_id, u.nome AS nome, u.id AS uid, COALESCE(u.setor_principal,'') AS princ
         FROM usuario_setores us JOIN usuarios u ON u.id = us.usuario_id WHERE us.ver = 1`
    ).all<{ setor_id: string; nome: string; uid: string; princ: string }>().catch(() => ({ results: [] as { setor_id: string; nome: string; uid: string; princ: string }[] })),
    c.env.DB.prepare(
      "SELECT setor AS setor_id, nome FROM prestadores WHERE setor IS NOT NULL AND setor <> '' AND COALESCE(ativo,1) = 1"
    ).all<{ setor_id: string; nome: string }>().catch(() => ({ results: [] as { setor_id: string; nome: string }[] })),
  ]);

  const nomesPrinc = new Map<string, string[]>();
  for (const v of princ.results || []) { if (!nomesPrinc.has(v.setor_id)) nomesPrinc.set(v.setor_id, []); nomesPrinc.get(v.setor_id)!.push(v.nome); }
  // "Com acesso" = tem ver=1 e o setor NÃO é o principal dele (senão duplicaria com "do setor").
  const nomesAcesso = new Map<string, string[]>();
  for (const v of acc.results || []) { if (v.princ === v.setor_id) continue; if (!nomesAcesso.has(v.setor_id)) nomesAcesso.set(v.setor_id, []); nomesAcesso.get(v.setor_id)!.push(v.nome); }
  const nomesPrest = new Map<string, string[]>();
  for (const v of prest.results || []) { if (!nomesPrest.has(v.setor_id)) nomesPrest.set(v.setor_id, []); nomesPrest.get(v.setor_id)!.push(v.nome); }
  const ord = (a: string, b: string) => a.localeCompare(b);

  return c.json(sts.map((s) => {
    const pr = (nomesPrinc.get(s.id) || []).sort(ord);
    const ac = (nomesAcesso.get(s.id) || []).sort(ord);
    const pe = (nomesPrest.get(s.id) || []).sort(ord);
    return {
      id: s.id, nome: s.nome, ativo: !!s.ativo, ordem: s.ordem,
      temTela: (SETOR_PAGINAS[s.id]?.length ?? 0) > 0,
      usuarios: pr.length,                      // do setor (principal) — usado na contagem principal
      usuarios_nomes: pr,                        // compat: nomes dos usuários do setor
      usuarios_principal_nomes: pr,
      usuarios_acesso_nomes: ac,
      prestadores: pe.length,
      prestadores_nomes: pe,
    };
  }));
});

// CRIA / RENOMEIA setor (admin ou quem tem admin.setores).
setores.post("/", async (c) => {
  const g = await exigirFuncao(c, "admin.setores"); if ("erro" in g) return g.erro;
  const b = await c.req.json<{ id?: string; nome?: string; ordem?: number }>().catch(() => ({} as { id?: string; nome?: string; ordem?: number }));
  const nome = (b.nome || "").trim();
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  const id = (b.id || slug(nome)).trim();
  const ordem = Number.isFinite(b.ordem as number) ? (b.ordem as number) : 999;
  await c.env.DB.prepare(
    `INSERT INTO setores (id, nome, ordem) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET nome = excluded.nome`
  ).bind(id, nome, ordem).run();
  return c.json({ id, nome, ativo: true }, 201);
});

// ATIVA / DESATIVA (nunca apaga setor com histórico — a tela só oferece desativar).
setores.post("/:id/ativar", async (c) => {
  const g = await exigirFuncao(c, "admin.setores"); if ("erro" in g) return g.erro;
  const id = c.req.param("id");
  const b = await c.req.json<{ ativo?: boolean }>().catch(() => ({} as { ativo?: boolean }));
  const ativo = b.ativo ? 1 : 0;
  await c.env.DB.prepare("UPDATE setores SET ativo=? WHERE id=?").bind(ativo, id).run();
  return c.json({ ok: true, ativo: !!ativo });
});

// EXCLUI de vez — só permitido se NÃO houver usuários vinculados (principal ou acesso). Caso
// contrário, orienta a desativar (preserva histórico).
setores.delete("/:id", async (c) => {
  const g = await exigirFuncao(c, "admin.setores"); if ("erro" in g) return g.erro;
  const id = c.req.param("id");
  const usados = await c.env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM usuario_setores WHERE setor_id=?) +
            (SELECT COUNT(*) FROM usuarios WHERE setor_principal=?) AS n`
  ).bind(id, id).first<{ n: number }>().catch(() => ({ n: 0 }));
  if ((usados?.n ?? 0) > 0) return c.json({ error: "setor_em_uso", desativar: true, usuarios: usados?.n ?? 0 }, 409);
  await c.env.DB.prepare("DELETE FROM setores WHERE id=?").bind(id).run();
  return c.json({ ok: true });
});

// LÊ o acesso completo de um usuário (para a tela de edição/permissões).
setores.get("/acesso/:usuarioId", async (c) => {
  const g = await exigirFuncao(c, "admin.usuarios"); if ("erro" in g) return g.erro;
  const uid = c.req.param("usuarioId");
  const p = await permissoesDoUsuario(c.env, uid);
  return c.json({
    configurado: p.configurado,
    setor_principal: p.setorPrincipal,
    setores: [...p.setores.entries()].map(([setor_id, v]) => ({ setor_id, ver: v.ver, editar: v.editar })),
    funcoes: [...p.funcoes],
  });
});

// SALVA o acesso do usuário: setor principal + ver/editar por setor + funções + telas gerais avulsas.
// Recalcula usuarios.paginas (para o menu/rota atuais) e marca perm_configurado=1.
setores.post("/acesso/:usuarioId", async (c) => {
  const g = await exigirFuncao(c, "admin.permissoes"); if ("erro" in g) return g.erro;
  const uid = c.req.param("usuarioId");
  const b = await c.req.json<{
    setor_principal?: string | null;
    setores?: { setor_id: string; ver?: boolean; editar?: boolean }[];
    funcoes?: string[];
    telas_gerais?: string[];
  }>().catch(() => ({} as {
    setor_principal?: string | null;
    setores?: { setor_id: string; ver?: boolean; editar?: boolean }[];
    funcoes?: string[];
    telas_gerais?: string[];
  }));

  const existe = await c.env.DB.prepare("SELECT id FROM usuarios WHERE id=?").bind(uid).first<{ id: string }>();
  if (!existe) return c.json({ error: "usuario_nao_encontrado" }, 404);

  const setoresIn = Array.isArray(b.setores) ? b.setores : [];
  const setoresVer = setoresIn.filter((s) => s.ver).map((s) => s.setor_id);
  const funcoes = (Array.isArray(b.funcoes) ? b.funcoes : []).filter((k) => CHAVES_FUNCAO.has(k));
  const telasGerais = Array.isArray(b.telas_gerais) ? b.telas_gerais : [];
  const paginas = derivarPaginas(setoresVer, telasGerais);
  const principal = (b.setor_principal || "").trim() || null;

  const stmts = [
    c.env.DB.prepare("DELETE FROM usuario_setores WHERE usuario_id=?").bind(uid),
    c.env.DB.prepare("DELETE FROM usuario_permissoes WHERE usuario_id=?").bind(uid),
    c.env.DB.prepare("UPDATE usuarios SET setor_principal=?, paginas=?, perm_configurado=1 WHERE id=?")
      .bind(principal, JSON.stringify(paginas), uid),
  ];
  for (const s of setoresIn) {
    if (!s.ver && !s.editar) continue;
    stmts.push(c.env.DB.prepare("INSERT INTO usuario_setores (usuario_id, setor_id, ver, editar) VALUES (?, ?, ?, ?)")
      .bind(uid, s.setor_id, s.ver ? 1 : 0, s.editar ? 1 : 0));
  }
  for (const k of funcoes) {
    stmts.push(c.env.DB.prepare("INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES (?, ?)").bind(uid, k));
  }
  await c.env.DB.batch(stmts);
  return c.json({ ok: true, paginas, setor_principal: principal, configurado: true });
});
