import { useEffect, useMemo, useState } from "react";
import { api, type Prestador, type SetorRow } from "../api";
import type { Usuario } from "../auth";
import { CATEGORIAS_FUNCAO, TODAS_FUNCOES, TELAS_GERAIS, SETOR_PAGINAS } from "../permissoes";

// ── Tela ACESSOS (Gestão) ─────────────────────────────────────────────────────
// Navegação progressiva: nav interna (Usuários / Prestadores / Setores) → lista limpa → clique
// abre um painel lateral com os detalhes/edição. Reaproveita 100% os endpoints existentes
// (/api/usuarios, /api/setores + /acesso, /api/prestadores) e o catálogo real de permissões.

type Sec = "usuarios" | "prestadores" | "setores";

// Toggle no padrão do sistema (classe .sw já existe).
function Sw({ on, onClick, titulo }: { on: boolean; onClick: () => void; titulo?: string }) {
  return <button type="button" className={"sw" + (on ? " on" : " off")} onClick={onClick} title={titulo} aria-pressed={on} />;
}

// UTC do banco → "dd/mm HH:MM" (Brasília, UTC-3).
function fmtAcesso(s?: string | null): string {
  if (!s) return "—";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return "—";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 3 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  const hoje = new Date();
  const mesmoDia = d.getDate() === hoje.getDate() && d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear();
  const dia = mesmoDia ? "Hoje" : `${p(d.getDate())}/${p(d.getMonth() + 1)}`;
  return `${dia} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function Acessos() {
  const [sec, setSec] = useState<Sec>(() => (localStorage.getItem("acessos-sec") as Sec) || "usuarios");
  const [full, setFull] = useState(false); // edição em tela cheia (esconde nav + lista)
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [prestadores, setPrestadores] = useState<Prestador[]>([]);
  const [setores, setSetores] = useState<SetorRow[]>([]);

  const carregarUsuarios = () => api.listarUsuarios().then(setUsuarios).catch(() => {});
  const carregarPrestadores = () => api.listarPrestadores().then(setPrestadores).catch(() => {});
  const carregarSetores = () => api.listarSetores().then(setSetores).catch(() => {});
  useEffect(() => { carregarUsuarios(); carregarPrestadores(); carregarSetores(); }, []);
  useEffect(() => { localStorage.setItem("acessos-sec", sec); }, [sec]);

  const NAV: { id: Sec; icon: string; label: string; count: number }[] = [
    { id: "usuarios", icon: "👥", label: "Usuários", count: usuarios.length },
    { id: "prestadores", icon: "🧵", label: "Prestadores", count: prestadores.length },
    { id: "setores", icon: "🏢", label: "Setores", count: setores.filter((s) => s.ativo).length },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Acessos</h1>
          <div className="breadcrumb">Gestão › Usuários e acessos</div>
        </div>
      </div>

      <div className={"acs-wrap" + (full ? " full" : "")}>
        {!full && (
          <aside className="acs-side">
            {NAV.map((n) => (
              <button key={n.id} className={"acs-si" + (sec === n.id ? " on" : "")} onClick={() => setSec(n.id)}>
                <span className="acs-si-ic">{n.icon}</span>
                <span className="acs-si-lb">{n.label}</span>
                <span className="acs-si-cnt">{n.count}</span>
              </button>
            ))}
          </aside>
        )}

        {sec === "usuarios" && <SecUsuarios usuarios={usuarios} setores={setores} onReload={carregarUsuarios} onFull={setFull} />}
        {sec === "prestadores" && <SecPrestadores prestadores={prestadores} setores={setores} onReload={carregarPrestadores} />}
        {sec === "setores" && <SecSetores setores={setores} onReload={() => { carregarSetores(); carregarPrestadores(); }} />}
      </div>
    </>
  );
}

// ── USUÁRIOS ───────────────────────────────────────────────────────────────────
type AcessoMap = Record<string, { ver: boolean; editar: boolean }>;

function SecUsuarios({ usuarios, setores, onReload, onFull }: { usuarios: Usuario[]; setores: SetorRow[]; onReload: () => void; onFull: (v: boolean) => void }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "ativos" | "inativos">("todos");
  const [sel, setSel] = useState<Usuario | null>(null);   // usuário aberto em tela cheia (null = lista)
  const [novo, setNovo] = useState(false);

  const setoresAtivos = useMemo(() => setores.filter((s) => s.ativo), [setores]);
  const nomeSetor = (id?: string | null) => setores.find((s) => s.id === id)?.nome || (id || "—");

  const lista = usuarios
    .filter((u) => (filtro === "todos" ? true : filtro === "ativos" ? !u.bloqueado : !!u.bloqueado))
    .filter((u) => {
      const q = busca.trim().toLowerCase();
      return !q || u.nome.toLowerCase().includes(q) || u.usuario.toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q);
    });

  function abrir(u: Usuario) { setNovo(false); setSel(u); onFull(true); }
  function abrirNovo() { setNovo(true); setSel({ id: "", nome: "", usuario: "", admin: false, paginas: [] } as Usuario); onFull(true); }
  function fechar() { setSel(null); setNovo(false); onFull(false); }

  // Tela cheia: só o editor do usuário escolhido (lista e menu escondidos).
  if (sel) {
    return (
      <PainelUsuario
        key={sel.id || "novo"}
        usuario={sel}
        novo={novo}
        setoresAtivos={setoresAtivos}
        onFechar={fechar}
        onSalvo={() => { fechar(); onReload(); }}
      />
    );
  }

  return (
    <main className="acs-main">
      <div className="acs-bar">
        <h2 className="acs-h2">Usuários</h2>
        <div className="acs-search"><span>🔎</span><input placeholder="Buscar por nome, login ou e-mail…" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <div className="acs-seg">
          {(["todos", "ativos", "inativos"] as const).map((f) => (
            <button key={f} className={filtro === f ? "on" : ""} onClick={() => setFiltro(f)}>{f === "todos" ? "Todos" : f === "ativos" ? "Ativos" : "Inativos"}</button>
          ))}
        </div>
        <button className="acs-new" onClick={abrirNovo}>＋ Novo usuário</button>
      </div>
      <div className="card">
        <table className="table">
          <thead><tr><th>Nome</th><th>Login</th><th>Setor principal</th><th>Status</th><th>Último acesso</th><th></th></tr></thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={6} className="empty pad">Nenhum usuário.</td></tr>}
            {lista.map((u) => (
              <tr key={u.id} style={{ cursor: "pointer" }} onClick={() => abrir(u)}>
                <td data-label="Nome"><div className="acs-nm">{u.nome}</div>{u.email && <div className="acs-sub">{u.email}</div>}</td>
                <td data-label="Login">{u.usuario}</td>
                <td data-label="Setor principal">{u.admin ? <span className="acs-sub">👑 Admin (tudo)</span> : u.setor_principal ? <span className="perm-tag">{nomeSetor(u.setor_principal)}</span> : <span className="acs-sub">—</span>}</td>
                <td data-label="Status">{u.bloqueado ? <span className="st-off">🔒 inativo</span> : <span className="st-ok">● ativo</span>}</td>
                <td data-label="Último acesso">{fmtAcesso(u.ultimo_acesso)}</td>
                <td><button className="acs-rowbtn" onClick={(e) => { e.stopPropagation(); abrir(u); }}>✎ Configurar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function PainelUsuario({ usuario, novo, setoresAtivos, onFechar, onSalvo }: {
  usuario: Usuario; novo: boolean; setoresAtivos: SetorRow[]; onFechar: () => void; onSalvo: () => void;
}) {
  const [nome, setNome] = useState(usuario.nome || "");
  const [login, setLogin] = useState(usuario.usuario || "");
  const [email, setEmail] = useState(usuario.email || "");
  const [senha, setSenha] = useState(usuario.senha || "");
  const [admin, setAdmin] = useState(!!usuario.admin);
  const [principal, setPrincipal] = useState(usuario.setor_principal || "");
  const [acesso, setAcesso] = useState<AcessoMap>({});
  const [gerais, setGerais] = useState<Set<string>>(new Set());
  const [funcoes, setFuncoes] = useState<Set<string>>(new Set());
  const [catAberta, setCatAberta] = useState<Record<string, boolean>>({ pedidos: true });
  const [salvando, setSalvando] = useState(false);
  const ehAdminFixo = usuario.usuario === "admin"; // não pode remover/bloquear

  // Carrega o acesso salvo (ou pré-preenche legado, sem tirar acesso de ninguém).
  useEffect(() => {
    if (novo || !usuario.id) return;
    let vivo = true;
    (async () => {
      let a: { configurado: boolean; setor_principal: string | null; setores: { setor_id: string; ver: boolean; editar: boolean }[]; funcoes: string[] } | null = null;
      try { a = await api.obterAcessoUsuario(usuario.id); } catch { a = null; }
      if (!vivo) return;
      const mapa: AcessoMap = {};
      const ger = new Set<string>();
      let fns = new Set<string>();
      if (a && a.configurado) {
        for (const s of a.setores) mapa[s.setor_id] = { ver: s.ver, editar: s.editar };
        fns = new Set(a.funcoes);
        for (const k of usuario.paginas || []) if (TELAS_GERAIS.some((t) => t.key === k)) ger.add(k);
        setPrincipal(a.setor_principal || "");
      } else {
        const pgs = new Set(usuario.paginas || []);
        for (const s of setoresAtivos) {
          const telas = SETOR_PAGINAS[s.id] || [];
          if (telas.length > 0 && telas.every((t) => pgs.has(t))) mapa[s.id] = { ver: true, editar: true };
        }
        for (const k of pgs) if (TELAS_GERAIS.some((t) => t.key === k)) ger.add(k);
        fns = new Set(TODAS_FUNCOES);
      }
      setAcesso(mapa); setGerais(ger); setFuncoes(fns);
    })();
    return () => { vivo = false; };
  }, [usuario.id, novo]); // eslint-disable-line react-hooks/exhaustive-deps

  function setSetor(id: string, campo: "ver" | "editar", val: boolean) {
    setAcesso((m) => {
      const cur = m[id] || { ver: false, editar: false };
      const next = { ...cur, [campo]: val };
      if (campo === "ver" && !val) next.editar = false;
      if (campo === "editar" && val) next.ver = true;
      return { ...m, [id]: next };
    });
  }
  const toggleGeral = (k: string) => setGerais((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleFuncao = (k: string) => setFuncoes((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const marcarCategoria = (keys: string[], on: boolean) => setFuncoes((s) => { const n = new Set(s); keys.forEach((k) => (on ? n.add(k) : n.delete(k))); return n; });

  async function salvar() {
    if (!nome.trim() || !login.trim()) return alert("Informe nome e login.");
    if (novo && !senha.trim()) return alert("Informe uma senha.");
    setSalvando(true);
    try {
      const saved = await api.salvarUsuario({ id: usuario.id || undefined, nome: nome.trim(), usuario: login.trim(), senha: senha.trim() || undefined, admin, paginas: [], email: email.trim() || null });
      const uid = saved.id || usuario.id;
      if (uid) {
        const setoresArr = Object.entries(acesso).filter(([, v]) => v.ver || v.editar).map(([setor_id, v]) => ({ setor_id, ver: v.ver, editar: v.editar }));
        await api.salvarAcessoUsuario(uid, { setor_principal: principal || null, setores: setoresArr, funcoes: [...funcoes], telas_gerais: [...gerais] });
      }
      onSalvo();
    } catch (e) { alert((e as Error).message); } finally { setSalvando(false); }
  }
  async function bloquear() {
    if (ehAdminFixo) return alert("O usuário admin não pode ser bloqueado.");
    const vai = !usuario.bloqueado;
    if (vai && !confirm(`Inativar o acesso de ${usuario.nome}? Ele é deslogado na hora (o cadastro e o histórico continuam salvos).`)) return;
    try { await api.bloquearUsuario(usuario.id, vai); onSalvo(); } catch (e) { alert((e as Error).message); }
  }
  async function remover() {
    if (ehAdminFixo) return alert("O usuário admin não pode ser removido.");
    if (!confirm(`Remover ${usuario.nome}? (o histórico de ações permanece)`)) return;
    try { await api.removerUsuario(usuario.id); onSalvo(); } catch (e) { alert((e as Error).message); }
  }

  return (
    <section className="acs-editor">
      <div className="acs-eh">
        <button className="acs-back" onClick={onFechar}>← Voltar</button>
        <div className="acs-eh-tit"><span className="acs-eh-nome">{novo ? "Novo usuário" : nome || "—"}</span><span className="acs-eh-meta">{login || "login"}{!novo && (usuario.bloqueado ? " · Inativo" : " · Ativo")}</span></div>
      </div>
      <div className="acs-pb acs-eb">
        <div className="acs-fld"><div className="acs-lb">Dados</div>
          <div className="acs-two">
            <input className="acs-inp" placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            <input className="acs-inp" placeholder="Login" value={login} onChange={(e) => setLogin(e.target.value)} />
          </div>
          <div className="acs-two" style={{ marginTop: 10 }}>
            <input className="acs-inp" placeholder="E-mail (opcional)" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="acs-inp" placeholder={novo ? "Senha (em branco = a pessoa cria no 1º acesso)" : "Nova senha (em branco = manter)"} value={senha} onChange={(e) => setSenha(e.target.value)} />
          </div>
          <label className="acs-adm"><input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} /> 👑 Administrador (acesso total)</label>
        </div>

        {admin ? (
          <p className="muted" style={{ fontSize: 13 }}>👑 O administrador enxerga e executa <strong>tudo</strong> — setores, telas e funções. As permissões abaixo não se aplicam.</p>
        ) : (
          <>
            <div className="acs-fld"><div className="acs-lb">Setor principal</div>
              <select className="acs-inp" value={principal} onChange={(e) => setPrincipal(e.target.value)}>
                <option value="">—</option>
                {setoresAtivos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>

            <div className="acs-fld"><div className="acs-lb">Acesso aos setores</div>
              <div className="perm-box">
                <div className="perm-srow perm-srow-head"><span>Setor</span><span>Ver</span><span>Editar</span></div>
                {setoresAtivos.map((s) => {
                  const a = acesso[s.id] || { ver: false, editar: false };
                  const ehPrinc = principal === s.id;
                  return (
                    <div key={s.id} className={"perm-srow" + (ehPrinc ? " princ" : "")}>
                      <span className="perm-sname">{s.nome}{ehPrinc && <span className="perm-badge">PRINCIPAL</span>}</span>
                      <span className="perm-tog"><Sw on={a.ver} onClick={() => setSetor(s.id, "ver", !a.ver)} titulo="Visualizar" /></span>
                      <span className="perm-tog"><Sw on={a.editar} onClick={() => setSetor(s.id, "editar", !a.editar)} titulo="Editar" /></span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="acs-fld"><div className="acs-lb">Outras telas (fora de um setor)</div>
              <div className="perm-chips">
                {TELAS_GERAIS.map((t) => (
                  <label key={t.key} className={"perm-chip" + (gerais.has(t.key) ? " on" : "")}>
                    <input type="checkbox" checked={gerais.has(t.key)} onChange={() => toggleGeral(t.key)} />
                    {t.tv ? "📺 " : ""}{t.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="acs-fld">
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div className="acs-lb" style={{ margin: 0 }}>Funções permitidas</div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button type="button" className="btn btn-soft" style={{ padding: "3px 9px", fontSize: 11 }} onClick={() => setFuncoes(new Set(TODAS_FUNCOES))}>Marcar tudo</button>
                  <button type="button" className="btn btn-soft" style={{ padding: "3px 9px", fontSize: 11 }} onClick={() => setFuncoes(new Set())}>Limpar</button>
                </div>
              </div>
              <div className="acs-fngrid">
                {CATEGORIAS_FUNCAO.map((cat) => {
                  const keys = cat.funcoes.map((f) => f.key);
                  const marc = keys.filter((k) => funcoes.has(k)).length;
                  const todos = marc === keys.length;
                  const open = !!catAberta[cat.id];
                  return (
                    <div key={cat.id} className="perm-acc">
                      <button type="button" className="perm-acc-head" onClick={() => setCatAberta((c) => ({ ...c, [cat.id]: !c[cat.id] }))}>
                        <span className="perm-acc-ic">{cat.icon}</span>
                        <span className="perm-acc-tt">{cat.titulo}</span>
                        <span className={"perm-acc-count" + (marc ? " has" : "")}>{marc} / {keys.length}</span>
                        <span className="perm-acc-arrow">{open ? "▲" : "▼"}</span>
                      </button>
                      {open && (
                        <div className="perm-acc-body">
                          <label className="perm-marcar"><input type="checkbox" checked={todos} onChange={() => marcarCategoria(keys, !todos)} /><strong>Marcar todos de {cat.titulo}</strong></label>
                          <div className="perm-fgrid">
                            {cat.funcoes.map((f) => (
                              <div key={f.key} className="perm-fn">
                                <Sw on={funcoes.has(f.key)} onClick={() => toggleFuncao(f.key)} titulo={f.label} />
                                <span><span className="perm-fn-nome">{f.label}</span>{f.desc && <span className="perm-fn-desc"> — {f.desc}</span>}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {!novo && !ehAdminFixo && (
          <div className="acs-fld" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={bloquear}>{usuario.bloqueado ? "🔓 Reativar acesso" : "🔒 Inativar acesso"}</button>
            <button className="btn danger-btn" onClick={remover}>✕ Remover</button>
          </div>
        )}
      </div>
      <div className="acs-foot">
        <button className="btn" onClick={onFechar} disabled={salvando}>Cancelar</button>
        <button className="btn btn-primary" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar alterações"}</button>
      </div>
    </section>
  );
}

// ── PRESTADORES DE SERVIÇO (costureiras entram aqui) ───────────────────────────
const TIPOS_PRESTADOR = ["Costureira", "Tassel", "Terceirizado", "Prestador", "Outro"];

function SecPrestadores({ prestadores, setores, onReload }: { prestadores: Prestador[]; setores: SetorRow[]; onReload: () => void }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "ativos" | "inativos">("todos");
  const [sel, setSel] = useState<Prestador | null>(null);
  const [novo, setNovo] = useState(false);
  const nomeSetor = (id?: string | null) => setores.find((s) => s.id === id)?.nome || (id || "—");

  const lista = prestadores
    .filter((p) => (filtro === "todos" ? true : filtro === "ativos" ? p.ativo !== false : p.ativo === false))
    .filter((p) => { const q = busca.trim().toLowerCase(); return !q || p.nome.toLowerCase().includes(q) || (p.tipo || "").toLowerCase().includes(q); });

  function abrirNovo() { setNovo(true); setSel({ nome: "", tipo: "Costureira", ativo: true }); }

  return (
    <>
      <main className="acs-main">
        <div className="acs-bar">
          <h2 className="acs-h2">Prestadores de serviço</h2>
          <div className="acs-search"><span>🔎</span><input placeholder="Buscar por nome ou tipo…" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
          <div className="acs-seg">
            {(["todos", "ativos", "inativos"] as const).map((f) => (
              <button key={f} className={filtro === f ? "on" : ""} onClick={() => setFiltro(f)}>{f === "todos" ? "Todos" : f === "ativos" ? "Ativos" : "Inativos"}</button>
            ))}
          </div>
          <button className="acs-new" onClick={abrirNovo}>＋ Novo prestador</button>
        </div>
        <div className="card">
          <table className="table">
            <thead><tr><th>Nome</th><th>Tipo</th><th>Setor</th><th>Telefone</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {lista.length === 0 && <tr><td colSpan={6} className="empty pad">Nenhum prestador.</td></tr>}
              {lista.map((p) => (
                <tr key={p.id || p.nome} className={sel?.id === p.id && !novo ? "acs-selrow" : ""} style={{ cursor: "pointer" }} onClick={() => { setNovo(false); setSel(p); }}>
                  <td data-label="Nome"><div className="acs-nm">{p.nome}</div>{p.email && <div className="acs-sub">{p.email}</div>}</td>
                  <td data-label="Tipo">{p.tipo ? <span className="perm-tag">{p.tipo}</span> : <span className="acs-sub">—</span>}</td>
                  <td data-label="Setor">{p.setor ? nomeSetor(p.setor) : <span className="acs-sub">—</span>}</td>
                  <td data-label="Telefone">{p.telefone || <span className="acs-sub">—</span>}</td>
                  <td data-label="Status">{p.ativo === false ? <span className="st-off">🔒 inativo</span> : <span className="st-ok">● ativo</span>}</td>
                  <td><button className="acs-rowbtn" onClick={(e) => { e.stopPropagation(); setNovo(false); setSel(p); }}>✎ Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {sel && (
        <PainelPrestador key={(sel.id || "novo") + (novo ? "-n" : "")} prestador={sel} novo={novo} setoresAtivos={setores.filter((s) => s.ativo)} onFechar={() => { setSel(null); setNovo(false); }} onSalvo={() => { setSel(null); setNovo(false); onReload(); }} />
      )}
    </>
  );
}

function PainelPrestador({ prestador, novo, setoresAtivos, onFechar, onSalvo }: {
  prestador: Prestador; novo: boolean; setoresAtivos: SetorRow[]; onFechar: () => void; onSalvo: () => void;
}) {
  const [nome, setNome] = useState(prestador.nome || "");
  const [tipo, setTipo] = useState(prestador.tipo || "Costureira");
  const [telefone, setTelefone] = useState(prestador.telefone || "");
  const [email, setEmail] = useState(prestador.email || "");
  const [setor, setSetor] = useState(prestador.setor || "");
  const [obs, setObs] = useState(prestador.obs || "");
  const [ativo, setAtivo] = useState(prestador.ativo !== false);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!nome.trim()) return alert("Informe o nome.");
    setSalvando(true);
    try {
      await api.salvarPrestador({ id: prestador.id, nome: nome.trim(), tipo, telefone: telefone.trim() || null, email: email.trim() || null, setor: setor || null, obs: obs.trim() || null, ativo, pix: prestador.pix ?? null, cidade: prestador.cidade ?? null });
      onSalvo();
    } catch (e) { alert((e as Error).message); } finally { setSalvando(false); }
  }
  async function alternarAtivo() {
    if (!prestador.id) return;
    try { await api.ativarPrestador(prestador.id, !(prestador.ativo !== false)); onSalvo(); } catch (e) { alert((e as Error).message); }
  }

  return (
    <aside className="acs-panel">
      <div className="acs-ph">
        <div className="acs-ph-top">
          <div><div className="acs-ph-nome">{novo ? "Novo prestador" : nome || "—"}</div><div className="acs-ph-meta">{tipo}{!novo && (prestador.ativo === false ? " · Inativo" : " · Ativo")}</div></div>
          <button className="acs-x" onClick={onFechar}>✕</button>
        </div>
      </div>
      <div className="acs-pb">
        <div className="acs-fld"><div className="acs-lb">Dados</div>
          <input className="acs-inp" placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          <div className="acs-two" style={{ marginTop: 10 }}>
            <select className="acs-inp" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS_PRESTADOR.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="acs-inp" value={setor} onChange={(e) => setSetor(e.target.value)}>
              <option value="">Setor relacionado…</option>
              {setoresAtivos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
          <div className="acs-two" style={{ marginTop: 10 }}>
            <input className="acs-inp" placeholder="Telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
            <input className="acs-inp" placeholder="E-mail (opcional)" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <textarea className="acs-inp" placeholder="Observações" value={obs} onChange={(e) => setObs(e.target.value)} rows={3} style={{ marginTop: 10, resize: "vertical" }} />
          <label className="acs-adm"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Ativo (aparece nas operações)</label>
          <p className="muted" style={{ fontSize: 12 }}>💡 "Costureira" e "Tassel" entram automaticamente nos romaneios e pagamentos correspondentes. Prestador inativo não some — só deixa de aparecer nas novas operações; o histórico fica.</p>
        </div>
        {!novo && prestador.id && (
          <div className="acs-fld"><button className="btn" onClick={alternarAtivo}>{prestador.ativo === false ? "🔓 Reativar" : "🔒 Inativar"}</button></div>
        )}
      </div>
      <div className="acs-foot">
        <button className="btn" onClick={onFechar} disabled={salvando}>Cancelar</button>
        <button className="btn btn-primary" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
      </div>
    </aside>
  );
}

// ── SETORES ────────────────────────────────────────────────────────────────────
function SecSetores({ setores, onReload }: { setores: SetorRow[]; onReload: () => void }) {
  const [sel, setSel] = useState<SetorRow | null>(null);
  const [novoNome, setNovoNome] = useState("");

  // Mantém o painel em sincronia com os dados recém-carregados.
  const selAtual = sel ? setores.find((s) => s.id === sel.id) || sel : null;

  async function criar() {
    const nome = novoNome.trim();
    if (!nome) return;
    try { await api.salvarSetor({ nome }); setNovoNome(""); onReload(); } catch (e) { alert((e as Error).message); }
  }
  async function ativar(s: SetorRow) {
    try { await api.ativarSetor(s.id, !s.ativo); onReload(); } catch (e) { alert((e as Error).message); }
  }
  async function excluir(s: SetorRow) {
    if (s.usuarios > 0) return alert(`"${s.nome}" tem usuários vinculados. Setor com histórico não pode ser apagado — apenas desativado.`);
    if (!confirm(`Excluir o setor "${s.nome}"?`)) return;
    try {
      const r = await api.excluirSetor(s.id);
      if (r.error) return alert(r.desativar ? `Setor em uso por ${r.usuarios} usuário(s). Desative em vez de apagar.` : r.error);
      setSel(null); onReload();
    } catch (e) { alert((e as Error).message); }
  }

  return (
    <>
      <main className="acs-main">
        <div className="acs-bar">
          <h2 className="acs-h2">Setores</h2>
          <input className="acs-inp" style={{ maxWidth: 220 }} placeholder="Nome do novo setor" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} onKeyDown={(e) => e.key === "Enter" && criar()} />
          <button className="acs-new" onClick={criar}>＋ Novo setor</button>
        </div>
        <div className="acs-setgrid">
          {setores.map((s) => (
            <button key={s.id} className={"acs-setcard" + (selAtual?.id === s.id ? " on" : "") + (s.ativo ? "" : " off")} onClick={() => setSel(s)}>
              <div className="acs-setname">{s.nome}{!s.ativo && <span className="st-off" style={{ marginLeft: 8 }}>inativo</span>}</div>
              <div className="acs-setmeta">
                <span>👥 {s.usuarios} usuário{s.usuarios === 1 ? "" : "s"}</span>
                <span>🧵 {s.prestadores ?? 0} prestador{(s.prestadores ?? 0) === 1 ? "" : "es"}</span>
              </div>
            </button>
          ))}
        </div>
      </main>

      {selAtual && (
        <aside className="acs-panel">
          <div className="acs-ph">
            <div className="acs-ph-top">
              <div><div className="acs-ph-nome">{selAtual.nome}</div><div className="acs-ph-meta">{selAtual.ativo ? "Ativo" : "Inativo"}{selAtual.temTela ? " · com tela" : " · sem tela"}</div></div>
              <button className="acs-x" onClick={() => setSel(null)}>✕</button>
            </div>
          </div>
          <div className="acs-pb">
            <div className="acs-fld"><div className="acs-lb">Usuários do setor (principal)</div>
              {(selAtual.usuarios_principal_nomes || selAtual.usuarios_nomes || []).length ? (
                <div className="acs-people">{(selAtual.usuarios_principal_nomes || selAtual.usuarios_nomes || []).map((n) => <span key={n} className="acs-person">{n}</span>)}</div>
              ) : <p className="muted" style={{ fontSize: 13 }}>Ninguém tem este setor como principal.</p>}
            </div>
            <div className="acs-fld"><div className="acs-lb">Usuários com acesso (não é o principal)</div>
              {(selAtual.usuarios_acesso_nomes || []).length ? (
                <div className="acs-people">{(selAtual.usuarios_acesso_nomes || []).map((n) => <span key={n} className="acs-person alt">{n}</span>)}</div>
              ) : <p className="muted" style={{ fontSize: 13 }}>Ninguém de fora com acesso.</p>}
            </div>
            <div className="acs-fld"><div className="acs-lb">Prestadores vinculados</div>
              {(selAtual.prestadores_nomes || []).length ? (
                <div className="acs-people">{(selAtual.prestadores_nomes || []).map((n) => <span key={n} className="acs-person">{n}</span>)}</div>
              ) : <p className="muted" style={{ fontSize: 13 }}>Nenhum prestador vinculado.</p>}
            </div>
          </div>
          <div className="acs-foot">
            <button className="btn danger-btn" onClick={() => excluir(selAtual)}>Excluir</button>
            <button className="btn" onClick={() => ativar(selAtual)}>{selAtual.ativo ? "Desativar" : "Ativar"}</button>
          </div>
        </aside>
      )}
    </>
  );
}
