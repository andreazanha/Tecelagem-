// SESSÃO / IDENTIDADE (barreira de acesso REAL no servidor).
// Lê o token de sessão (crachá) do cabeçalho, confere no banco e devolve o usuário REAL — sem
// confiar em nada que o navegador mande. As permissões vêm frescas do cadastro (join usuarios),
// então revogar cargo/bloquear vale já no próximo request.
//
// Mora aqui (e não em routes/atendimento) para que o módulo de permissões e as demais rotas possam
// importar sem criar import circular com atendimento.
import type { Context } from "hono";
import type { Env } from "./index";

export interface UsuarioAuth { id: string; nome: string; usuario: string; admin: boolean; paginas: string[] }

export async function usuarioLogado(env: Env, c: Context): Promise<UsuarioAuth | null> {
  const auth = c.req.header("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : (c.req.header("x-auth-token") || "").trim();
  if (!token) return null;
  // Consulta o "crachá" no banco. Se o banco der um soluço (erro transitório), tentamos de novo
  // antes de dizer "sessão inválida" — assim um piscar do D1 não desloga a pessoa no meio do uso.
  const q = () => env.DB.prepare(
    `SELECT u.id, u.nome, u.usuario, u.admin, u.paginas
       FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token = ? AND s.expira_em > datetime('now') AND COALESCE(u.bloqueado,0)=0`
  ).bind(token).first<{ id: string; nome: string; usuario: string; admin: number; paginas: string }>();
  let row: { id: string; nome: string; usuario: string; admin: number; paginas: string } | null = null;
  try {
    row = await q();
  } catch {
    try { await new Promise((r) => setTimeout(r, 150)); row = await q(); } catch { row = null; }
  }
  if (!row) return null;
  let paginas: string[] = [];
  try { paginas = JSON.parse(row.paginas || "[]"); } catch { paginas = []; }
  return { id: row.id, nome: row.nome, usuario: row.usuario, admin: !!row.admin, paginas };
}
