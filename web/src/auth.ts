// Autenticação simples por usuário + senha (ferramenta interna).
// O usuário logado fica no localStorage; as permissões definem o que ele vê.
export interface Usuario {
  id: string;
  nome: string;
  usuario: string;
  admin: boolean;
  paginas: string[];
}

// Telas controláveis por usuário (chaves usadas nas permissões).
export const PAGINAS: { key: string; label: string; tv?: boolean }[] = [
  { key: "pedidos", label: "Pedidos" },
  { key: "producao", label: "Tecelagem" },
  { key: "passadoria", label: "Passadoria" },
  { key: "corte", label: "Corte" },
  { key: "revisao", label: "Revisão" },
  { key: "estoque", label: "Estoque" },
  { key: "romaneios", label: "Romaneios" },
  { key: "cadastros", label: "Cadastros" },
  { key: "tv-dashboard", label: "Painel TV (Dashboard)", tv: true },
  { key: "tv-tecelagem", label: "TV Tecelagem", tv: true },
  { key: "tv-costura", label: "TV Costura", tv: true },
  { key: "tv-revisao", label: "TV Revisão", tv: true },
];

export function getUser(): Usuario | null {
  try {
    return JSON.parse(localStorage.getItem("usuario") || "null");
  } catch {
    return null;
  }
}
export function setUser(u: Usuario | null) {
  if (u) localStorage.setItem("usuario", JSON.stringify(u));
  else localStorage.removeItem("usuario");
}
export function pode(u: Usuario | null, key: string): boolean {
  if (!u) return false;
  if (u.admin) return true;
  return u.paginas.includes(key);
}
// Primeira página do sistema (não-TV) que o usuário pode abrir.
export function primeiraPagina(u: Usuario | null): string {
  if (!u) return "/login";
  if (u.admin) return "/pedidos";
  const ordem: [string, string][] = [
    ["pedidos", "/pedidos"], ["producao", "/producao"], ["passadoria", "/passadoria"],
    ["corte", "/corte"], ["revisao", "/revisao"], ["estoque", "/estoque"],
    ["romaneios", "/romaneios"], ["cadastros", "/cadastros"],
  ];
  for (const [k, rota] of ordem) if (u.paginas.includes(k)) return rota;
  return "/sem-acesso";
}
