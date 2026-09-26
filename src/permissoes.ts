// PERMISSÕES (controle de acesso fino) — núcleo do backend.
//
// Modelo:
//  • usuarios.admin=1  → pode tudo (protegido).
//  • usuarios.perm_configurado=0 → LEGADO: o gestor ainda não configurou; mantém tudo que já fazia
//    (nada quebra no deploy). O backend NÃO bloqueia esse usuário.
//  • usuarios.perm_configurado=1 → o controle fino vale: só passa quem tiver a função liberada
//    (usuario_permissoes) / o acesso ao setor (usuario_setores).
//
// As CHAVES de função abaixo são a fonte da verdade compartilhada com o front (web/src/permissoes.ts
// tem a mesma lista com rótulos). Ao criar função nova: adicione a chave aqui e lá.
import type { Context } from "hono";
import type { Env } from "./index";
import { usuarioLogado, type UsuarioAuth } from "./sessao";

// Setor → chaves de tela do sistema (para derivar usuarios.paginas e o menu continuar funcionando).
export const SETOR_PAGINAS: Record<string, string[]> = {
  tecelagem: ["producao"],
  passadoria: ["passadoria"],
  corte: ["corte"],
  costura: ["costura"],
  revisao: ["revisao"],
  estoque: ["estoque"],
  expedicao: ["expedicao"],
  fiscal: ["fiscal"],
  crm: ["atendimento", "comercial"],
  pcp: [], // ainda não tem tela dedicada
};

// Todas as chaves de função válidas (espelhar em web/src/permissoes.ts).
export const CHAVES_FUNCAO = new Set<string>([
  // Pedidos
  "pedido.criar", "pedido.editar", "pedido.excluir", "pedido.importar", "pedido.etiquetas",
  // Produção
  "producao.iniciar", "producao.finalizar", "producao.enviar", "producao.voltar",
  "producao.defeito", "producao.devolver", "producao.prioridade", "producao.desmembrar",
  "producao.revisadora", "producao.historico",
  // Estoque
  "estoque.entrada", "estoque.saida", "estoque.ajuste",
  // Expedição
  "expedicao.fase", "expedicao.romaneio", "expedicao.etiquetas",
  // Fiscal
  "fiscal.frete", "fiscal.nf",
  // CRM
  "crm.assumir", "crm.transferir", "crm.encerrar", "crm.nota", "crm.mover",
  "crm.excluir_msg", "crm.nova", "crm.campanha",
  // Relatórios
  "relatorio.acessar", "relatorio.exportar",
  // Cadastros
  "cadastro.produtos", "cadastro.fios", "cadastro.tamanhos", "cadastro.materiais",
  "cadastro.fornecedores", "cadastro.operadores",
  // Administração
  "admin.usuarios", "admin.setores", "admin.permissoes",
]);

export interface PermsUsuario {
  configurado: boolean;
  funcoes: Set<string>;
  setores: Map<string, { ver: boolean; editar: boolean }>;
  setorPrincipal: string | null;
}

// Carrega, do banco, as permissões finas de um usuário.
export async function permissoesDoUsuario(env: Env, usuarioId: string): Promise<PermsUsuario> {
  const [meta, fns, sts] = await Promise.all([
    env.DB.prepare("SELECT COALESCE(perm_configurado,0) AS pc, setor_principal FROM usuarios WHERE id=?")
      .bind(usuarioId).first<{ pc: number; setor_principal: string | null }>().catch(() => null),
    env.DB.prepare("SELECT permissao FROM usuario_permissoes WHERE usuario_id=?")
      .bind(usuarioId).all<{ permissao: string }>().catch(() => ({ results: [] as { permissao: string }[] })),
    env.DB.prepare("SELECT setor_id, ver, editar FROM usuario_setores WHERE usuario_id=?")
      .bind(usuarioId).all<{ setor_id: string; ver: number; editar: number }>().catch(() => ({ results: [] as { setor_id: string; ver: number; editar: number }[] })),
  ]);
  const funcoes = new Set<string>((fns.results || []).map((r) => r.permissao));
  const setores = new Map<string, { ver: boolean; editar: boolean }>();
  for (const r of sts.results || []) setores.set(r.setor_id, { ver: !!r.ver, editar: !!r.editar });
  return { configurado: !!meta?.pc, funcoes, setores, setorPrincipal: meta?.setor_principal ?? null };
}

// Guard de rota por FUNÇÃO. Uso:
//   const g = await exigirFuncao(c, "pedido.excluir"); if ("erro" in g) return g.erro;
//   const u = g.u;  // usuário autenticado
export async function exigirFuncao(c: Context, chave: string): Promise<{ u: UsuarioAuth } | { erro: Response }> {
  const env = c.env as Env;
  const u = await usuarioLogado(env, c);
  if (!u) return { erro: c.json({ error: "sessao_invalida", relogar: true }, 401) };
  if (u.admin) return { u };
  const p = await permissoesDoUsuario(env, u.id);
  if (!p.configurado) return { u };                 // legado: mantém tudo até o gestor configurar
  if (p.funcoes.has(chave)) return { u };
  return { erro: c.json({ error: "sem_permissao", chave }, 403) };
}

// Guard que libera se o usuário tiver PELO MENOS UMA das funções (ações com mais de um botão que
// batem no mesmo endpoint — ex.: enviar/voltar/devolver na produção).
export async function exigirAlgumaFuncao(c: Context, chaves: string[]): Promise<{ u: UsuarioAuth } | { erro: Response }> {
  const env = c.env as Env;
  const u = await usuarioLogado(env, c);
  if (!u) return { erro: c.json({ error: "sessao_invalida", relogar: true }, 401) };
  if (u.admin) return { u };
  const p = await permissoesDoUsuario(env, u.id);
  if (!p.configurado) return { u };
  if (chaves.some((k) => p.funcoes.has(k))) return { u };
  return { erro: c.json({ error: "sem_permissao", chaves }, 403) };
}

// Guard de rota por EDIÇÃO de um setor (ver vs. editar). Ex.: alterar algo dentro de Revisão exige
// editar do setor 'revisao'.
export async function exigirEditarSetor(c: Context, setorId: string): Promise<{ u: UsuarioAuth } | { erro: Response }> {
  const env = c.env as Env;
  const u = await usuarioLogado(env, c);
  if (!u) return { erro: c.json({ error: "sessao_invalida", relogar: true }, 401) };
  if (u.admin) return { u };
  const p = await permissoesDoUsuario(env, u.id);
  if (!p.configurado) return { u };
  if (p.setores.get(setorId)?.editar) return { u };
  return { erro: c.json({ error: "sem_permissao_setor", setor: setorId }, 403) };
}

// Deriva o array usuarios.paginas a partir dos setores que o usuário PODE VER + telas gerais avulsas
// (as que não pertencem a um setor: pedidos, produtos, romaneios, cadastros, TVs…). Assim o menu e os
// guardas de rota atuais continuam funcionando sem mudança, e o admin controla tudo por setor/tela.
export function derivarPaginas(setoresVer: string[], telasGerais: string[]): string[] {
  const set = new Set<string>();
  for (const s of setoresVer) for (const pg of (SETOR_PAGINAS[s] || [])) set.add(pg);
  for (const t of telasGerais) set.add(t);
  return [...set];
}
